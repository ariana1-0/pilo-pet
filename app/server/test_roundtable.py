"""Offline behavioral checks for independent agents and discussion boundaries."""
import queue
import threading
import time
import unittest
from unittest.mock import patch

from . import roundtable_service as rt
from .roundtable_agent import PhilosopherAgent
from .bigmodel_client import StreamCancellation


SLUGS = ["marcus-aurelius", "zhuangzi", "nietzsche", "laozi", "confucius", "camus"]


class RoundtableTest(unittest.TestCase):
    def setUp(self):
        self.classify = patch.object(rt.classifier, "classify", return_value={
            "tags": ["peer-comparison"], "crisis": False, "degraded": False}).start()
        self.timeline = patch.object(rt.memory, "append_timeline").start()
        patch.object(rt.memory, "log_crisis").start()
        self.calls = []
        self.sessions = []
        self.hook = lambda number, cancel: None
        parent = self

        class FakeAgent:
            def __init__(self, slug):
                self.slug = slug
                self.messages = []

            def stream(self, client, transcript, participants, phase, user_id, cancel):
                self.messages = transcript
                number = len(parent.calls) + 1
                parent.calls.append((self.slug, transcript, phase))
                yield f"独立发言 {number}"
                parent.hook(number, cancel)
                if not cancel.is_set():
                    yield "。"

            def clear(self):
                self.messages.clear()
        self.factory = FakeAgent

    def tearDown(self):
        for session in self.sessions:
            session.close()
        patch.stopall()

    def session(self, count=3):
        session = rt.Session("test-user", SLUGS[:count], agent_factory=self.factory)
        self.sessions.append(session)
        session.submit(None, "question", "同学都拿到 offer，我还没有着落。")
        return session

    def drain(self, events):
        collected = []
        while True:
            event = events.get(timeout=3)
            collected.append(event)
            if event[0] == "paused":
                return collected

    def gate(self, number):
        entered, release = threading.Event(), threading.Event()
        def hook(current, cancel):
            if current == number:
                entered.set()
                if not release.wait(3):
                    raise RuntimeError("test gate timed out")
        self.hook = hook
        return entered, release

    def test_two_rounds_for_two_three_and_six_distinct_agents(self):
        for count in (2, 3, 6):
            with self.subTest(count=count):
                self.calls.clear()
                session = self.session(count)
                _, events = session.start(None)
                output = self.drain(events)
                self.assertEqual([c[0] for c in self.calls], SLUGS[:count] * 2)
                self.assertEqual(len({id(a) for a in session.agents.values()}), count)
                self.assertEqual(len([e for e in output if e[0] == "speaker_done"]), 2 * count)
                self.assertEqual(len(self.calls[count][1]), count + 1)
                self.assertEqual(self.calls[count][2], "response")
                self.assertFalse(session.running)

    def test_interjection_in_final_speaker_gives_everyone_one_more_turn(self):
        session = self.session()
        entered, release = self.gate(6)
        _, events = session.start(None)
        self.assertTrue(entered.wait(2))
        session.submit(None, "followup", "其实我更在意父母怎么看我。")
        release.set(); self.drain(events)
        self.assertEqual(len(self.calls), 9)
        self.assertEqual([c[0] for c in self.calls[6:]], SLUGS[:3])
        for call in self.calls[6:]:
            self.assertIn("followup", [r["id"] for r in call[1]])

    def test_multiple_interjections_replace_remaining_rounds_without_stacking(self):
        session = self.session()
        entered, release = self.gate(1)
        _, events = session.start(None)
        self.assertTrue(entered.wait(2))
        session.submit(None, "one", "第一条补充")
        session.submit(None, "two", "第二条补充")
        release.set(); self.drain(events)
        self.assertEqual([c[0] for c in self.calls], SLUGS[:3] + [SLUGS[0]])
        self.assertEqual([r["id"] for r in self.calls[1][1] if r["role"] == "user"],
                         ["question", "one", "two"])

    def test_pending_classification_blocks_the_next_speaker(self):
        session = self.session()
        entered, release_speaker = self.gate(1)
        _, events = session.start(None)
        self.assertTrue(entered.wait(2))
        classifying, release_classifier = threading.Event(), threading.Event()
        def classify(*args):
            classifying.set(); release_classifier.wait(2)
            return {"tags": [], "crisis": False}
        self.classify.side_effect = classify
        submit = threading.Thread(target=session.submit, args=(None, "pending", "补充"))
        submit.start(); self.assertTrue(classifying.wait(2))
        release_speaker.set()
        while events.get(timeout=2)[0] != "speaker_done":
            pass
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(session.pending, 1)
        release_classifier.set(); submit.join(2); self.drain(events)
        self.assertEqual(len(self.calls), 4)

    def test_duplicate_submission_is_classified_and_logged_once(self):
        session = self.session()
        first = session.submit(None, "same", "一样的话")
        second = session.submit(None, "same", "一样的话")
        self.assertEqual(first, second)
        self.assertEqual(self.classify.call_count, 2)  # initial question plus this one
        self.assertEqual(self.timeline.call_count, 2)
        with self.assertRaises(rt.RoundtableError):
            session.submit(None, "same", "不同的话")

    def test_concurrent_duplicate_waits_for_original_receipt(self):
        session = self.session()
        entered, release = threading.Event(), threading.Event()
        def classify(*args):
            entered.set(); release.wait(2)
            return {"tags": [], "crisis": False}
        self.classify.side_effect = classify
        results = []
        def submit(): results.append(session.submit(None, "same", "补充"))
        a, b = threading.Thread(target=submit), threading.Thread(target=submit)
        a.start(); self.assertTrue(entered.wait(2)); b.start(); release.set()
        a.join(2); b.join(2)
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0], results[1])
        self.assertEqual(self.classify.call_count, 2)

    def test_stop_drops_partial_context_and_retries_same_speaker(self):
        session = self.session()
        entered, release = self.gate(2)
        run_id, events = session.start(None)
        self.assertTrue(entered.wait(2))
        with self.assertRaises(rt.RoundtableError): session.start(None)
        session.stop(); release.set(); self.drain(events)
        self.assertEqual(session.cursor, 1)
        self.assertEqual(session.transcript[-1]["status"], "incomplete")
        old_partial_id = session.transcript[-1]["id"]
        self.hook = lambda *_: None
        _, events = session.start(None, retry=True)
        session.stop("disconnected", run_id=run_id)
        self.drain(events)
        self.assertEqual(self.calls[2][0], SLUGS[1])
        self.assertNotIn(old_partial_id, [r["id"] for r in self.calls[2][1]])
        self.assertEqual(len([r for r in session.transcript if r["role"] == "assistant"
                              and r["status"] == "complete"]), 6)

    def test_speaker_failure_pauses_and_only_retries_unfinished_turn(self):
        session = self.session()
        def fail(number, cancel):
            if number == 2: raise RuntimeError("network failure")
        self.hook = fail
        _, events = session.start(None); output = self.drain(events)
        self.assertIn("error", [e[0] for e in output]); self.assertEqual(session.cursor, 1)
        self.hook = lambda *_: None
        _, events = session.start(None, retry=True); self.drain(events)
        self.assertEqual([c[0] for c in self.calls[:3]], [SLUGS[0], SLUGS[1], SLUGS[1]])

    def test_crisis_interjection_stops_table_and_blocks_further_runs(self):
        session = self.session()
        entered, release = self.gate(1)
        _, events = session.start(None); self.assertTrue(entered.wait(2))
        self.classify.return_value = {"tags": [], "crisis": True}
        receipt = session.submit(None, "crisis", "危机测试文本")
        self.assertTrue(receipt["crisis"]); self.assertTrue(session.cancel.is_set())
        session.stop(); release.set(); output = self.drain(events)
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(output[-1][1]["reason"], "crisis")
        with self.assertRaises(rt.RoundtableError): session.start(None)

    def test_followup_after_final_boundary_is_a_new_two_round_discussion(self):
        session = self.session()
        _, events = session.start(None); self.drain(events)
        receipt = session.submit(None, "later", "我们接着聊")
        self.assertFalse(receipt["running"])
        _, events = session.start(None); self.drain(events)
        self.assertEqual(len(self.calls), 12)

    def test_expiration_and_forgetting_clear_agent_contexts(self):
        session = self.session()
        store = rt.SessionStore(ttl=1); store.sessions[session.id] = session
        _, events = session.start(None); self.drain(events)
        session.last_used = time.monotonic() - 2
        with self.assertRaises(rt.RoundtableError): store.get(session.id)
        self.assertTrue(session.deleted); self.assertFalse(session.transcript)
        self.assertTrue(all(not agent.messages for agent in session.agents.values()))
        other = self.session(); store.sessions[other.id] = other
        store.forget("test-user")
        self.assertFalse(store.sessions)

    def test_forget_during_classification_does_not_recreate_memory(self):
        session = self.session()
        entered, release = threading.Event(), threading.Event()
        def classify(*args):
            entered.set(); release.wait(2)
            return {"tags": [], "crisis": False}
        self.classify.side_effect = classify
        errors = []
        def submit():
            try: session.submit(None, "late", "补充")
            except rt.RoundtableError as error: errors.append(error.status)
        worker = threading.Thread(target=submit); worker.start()
        self.assertTrue(entered.wait(2)); session.close(); release.set(); worker.join(2)
        self.assertEqual(errors, [410]); self.assertEqual(self.timeline.call_count, 1)

    def test_invalid_rosters_rejected_before_loading_packages(self):
        store = rt.SessionStore()
        for roster in ([], SLUGS[:1], [SLUGS[0]] * 3, ["../../secret", SLUGS[0]], SLUGS + ["other"]):
            with self.assertRaises(rt.RoundtableError): store.create("test-user", roster)


class AgentTest(unittest.TestCase):
    @patch("app.server.roundtable_agent.memory.had_crisis_since", return_value=False)
    @patch("app.server.roundtable_agent.chat_service.build_memory_digest", return_value=None)
    def test_independent_personas_and_authorship_in_context(self, *mocks):
        calls = []
        class Client:
            def stream(self, **kwargs):
                calls.append(kwargs)
                yield {"choices": [{"delta": {"content": "自己的回答"}, "finish_reason": "stop"}]}
        records = [
            {"id": "u", "role": "user", "content": "问题", "status": "complete"},
            {"id": "a", "role": "assistant", "slug": SLUGS[0], "content": "马可的话", "status": "complete"},
            {"id": "b", "role": "assistant", "slug": SLUGS[1], "content": "庄子的话", "status": "complete"},
            {"id": "c", "role": "assistant", "slug": SLUGS[2], "content": "半句话", "status": "incomplete"},
        ]
        agents = [PhilosopherAgent(slug) for slug in SLUGS[:3]]
        for agent in agents:
            list(agent.stream(Client(), records, SLUGS[:3], "response", "test", StreamCancellation()))
        for agent, call in zip(agents, calls):
            self.assertEqual(call["thinking"], rt.config.CHAT_THINKING)
            self.assertEqual(call["messages"][0], {"role": "system", "content": agent.system_prompt})
            self.assertEqual(len([m for m in call["messages"] if m["role"] == "system"]), 1)
            self.assertNotIn("半句话", str(call["messages"]))
        self.assertEqual([m["content"] for m in calls[0]["messages"] if m["role"] == "assistant"], ["马可的话"])
        self.assertEqual([m["content"] for m in calls[1]["messages"] if m["role"] == "assistant"], ["庄子的话"])
        self.assertIsNot(agents[0].messages, agents[1].messages)


if __name__ == "__main__":
    unittest.main()
