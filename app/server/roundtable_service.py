"""Ephemeral roundtables with serial speakers and concurrently accepted interjections.

The condition protects scheduling and transcript commits. No network request is
made while holding it; pending classification is a barrier before the next turn.
"""
import queue
import threading
import time
import uuid

from . import classifier, config, crisis, memory
from .bigmodel_client import StreamCancellation
from .roundtable_agent import PhilosopherAgent


class RoundtableError(Exception):
    def __init__(self, status, message):
        self.status = status
        self.message = message
        super().__init__(message)


class Session:
    def __init__(self, user_id, participants, region="CN", agent_factory=PhilosopherAgent):
        self.id = uuid.uuid4().hex
        self.user_id = user_id
        self.participants = tuple(participants)
        self.region = region
        self.agents = {slug: agent_factory(slug) for slug in participants}
        self.condition = threading.Condition(threading.RLock())
        self.transcript = []
        self.receipts = {}
        self.pending = 0
        self.version = 0
        self.cursor = 0
        self.remaining = 0
        self.running = False
        self.blocked = False
        self.deleted = False
        self.last_used = time.monotonic()
        self.cancel = StreamCancellation()
        self.events = None
        self.run_id = None
        self.stop_reason = "complete"

    def _check(self):
        if self.deleted:
            raise RoundtableError(410, "圆桌已结束，请新开圆桌。")
        if self.blocked:
            raise RoundtableError(409, "角色讨论已暂停，请先照顾好自己。")

    def submit(self, client, message_id, content):
        if not isinstance(message_id, str) or not 1 <= len(message_id) <= 128:
            raise RoundtableError(400, "消息标识无效。")
        if not isinstance(content, str) or not 1 <= len(content.strip()) <= 12000:
            raise RoundtableError(400, "请输入不超过 12000 字的问题。")
        content = content.strip()
        with self.condition:
            if self.deleted:
                self._check()
            previous = self.receipts.get(message_id)
            if previous:
                if previous["content"] != content:
                    raise RoundtableError(409, "消息标识已被使用。")
                while previous["result"] is None and not self.deleted:
                    self.condition.wait()
                if self.deleted:
                    self._check()
                return dict(previous["result"])
            self._check()
            receipt = {"content": content, "result": None}
            self.receipts[message_id] = receipt
            record = {"id": message_id, "role": "user", "content": content,
                      "status": "pending"}
            # Snapshot before adding the new message, which classify appends itself.
            context = [{"role": r["role"], "content": r["content"]}
                       for r in self.transcript if r["status"] == "complete"][-4:]
            self.transcript.append(record)
            self.pending += 1
            self.version += 1
            self.last_used = time.monotonic()
        try:
            result = classifier.classify(client, content, context)
            with self.condition:
                if self.deleted:
                    raise RoundtableError(410, "圆桌已结束。")
                memory.append_timeline(self.user_id, "web-roundtable", result["tags"])
                record["status"] = "complete"
                receipt["result"] = {"message_id": message_id, "accepted": True,
                                     "running": self.running, "crisis": result["crisis"]}
                if result["crisis"]:
                    self.blocked = True
                    memory.log_crisis(self.user_id, "roundtable")
                    payload = crisis.crisis_response(self.region)
                    receipt["result"]["response"] = payload
                    if self.running:
                        self.events.put(("crisis", payload))
                    self.stop("crisis")
                return dict(receipt["result"])
        except Exception:
            with self.condition:
                record["status"] = "failed"
                receipt["result"] = {"message_id": message_id, "accepted": False,
                                     "running": self.running, "crisis": False}
                self.stop("error")
            raise
        finally:
            with self.condition:
                self.pending -= 1
                self.condition.notify_all()

    def start(self, client, retry=False):
        with self.condition:
            self._check()
            if self.running:
                raise RoundtableError(409, "这一桌仍在讨论，请稍候。")
            if not any(r["role"] == "user" and r["status"] == "complete"
                       for r in self.transcript):
                raise RoundtableError(400, "请先提出一个问题。")
            self.running = True
            self.last_used = time.monotonic()
            self.cancel = StreamCancellation()
            self.events = queue.Queue()
            self.run_id = uuid.uuid4().hex
            if not retry or self.remaining <= 0:
                self.remaining = 2 * len(self.participants)
            self.stop_reason = "complete"
            events, run_id = self.events, self.run_id
            threading.Thread(target=self._work, args=(client, self.version, events),
                             daemon=True).start()
            return run_id, events

    def _work(self, client, seen_version, events):
        turn = None
        count = 0
        responding = False
        finalized = False
        try:
            while True:
                with self.condition:
                    while self.pending and not self.cancel.is_set():
                        self.condition.wait(.2)
                    if self.cancel.is_set() or self.deleted:
                        break
                    # Check even after the last planned speaker: an interjection
                    # in that final turn still gives every participant a response.
                    if self.version != seen_version:
                        seen_version = self.version
                        self.remaining = len(self.participants)
                        responding = True
                    if self.remaining <= 0:
                        # Finish atomically with respect to accepting a new question.
                        break
                    slug = self.participants[self.cursor]
                    snapshot = [dict(r) for r in self.transcript if r["status"] == "complete"]
                    turn = {"id": uuid.uuid4().hex, "role": "assistant", "slug": slug,
                            "content": "", "status": "generating"}
                    self.transcript.append(turn)
                    phase = "response" if responding or count >= len(self.participants) else "opening"
                    events.put(("speaker_start", {"message_id": turn["id"], "slug": slug,
                                                   "phase": phase}))
                for text in self.agents[slug].stream(
                    client, snapshot, self.participants, phase, self.user_id, self.cancel):
                    with self.condition:
                        if self.cancel.is_set() or self.deleted:
                            break
                        turn["content"] += text
                        events.put(("delta", {"message_id": turn["id"], "slug": slug,
                                               "text": text}))
                with self.condition:
                    if self.cancel.is_set() or self.deleted:
                        break
                    if not turn["content"].strip():
                        raise RuntimeError("empty speaker response")
                    turn["status"] = "complete"
                    events.put(("speaker_done", {"message_id": turn["id"], "slug": slug,
                                                  "text": turn["content"]}))
                    self.cursor = (self.cursor + 1) % len(self.participants)
                    self.remaining -= 1
                    count += 1
                    turn = None
                    # Stay inside the lock for the final boundary, so submit cannot
                    # see a running session whose last boundary has already passed.
                    if self.remaining == 0 and self.version == seen_version and not self.pending:
                        self._finish(events)
                        finalized = True
                        return
        except Exception:
            with self.condition:
                if not self.cancel.is_set():
                    self.stop_reason = "error"
                    events.put(("error", {"message": "这次发言中断了，可以重试。",
                                           "message_id": turn["id"] if turn else None,
                                           "slug": turn["slug"] if turn else None}))
        finally:
            with self.condition:
                if turn and turn["status"] == "generating":
                    turn["status"] = "incomplete"
                if not finalized:
                    self._finish(events)
                if self.deleted:
                    for agent in self.agents.values():
                        agent.clear()

    def _finish(self, events):
        self.running = False
        self.last_used = time.monotonic()
        events.put(("paused", {"reason": self.stop_reason,
                                "next_slug": self.participants[self.cursor]}))
        self.condition.notify_all()

    def stop(self, reason="stopped", run_id=None):
        with self.condition:
            if run_id is not None and run_id != self.run_id:
                return  # A late disconnect must not stop a newer run.
            if self.running:
                if self.stop_reason != "crisis":
                    self.stop_reason = reason
                self.cancel.cancel()
                self.condition.notify_all()

    def close(self):
        with self.condition:
            self.stop("closed")
            self.deleted = True
            self.transcript.clear()
            self.receipts.clear()
            for agent in self.agents.values():
                agent.clear()
            if self.events:
                while True:
                    try:
                        self.events.get_nowait()
                    except queue.Empty:
                        break
                self.events.put(("paused", {"reason": "closed", "next_slug": None}))
            self.condition.notify_all()


class SessionStore:
    def __init__(self, ttl=3600):
        self.ttl = ttl
        self.lock = threading.RLock()
        self.sessions = {}

    def create(self, user_id, participants, region="CN"):
        if not isinstance(user_id, str) or not 1 <= len(user_id) <= 128:
            raise RoundtableError(400, "用户标识无效。")
        if (not isinstance(participants, list) or not 2 <= len(participants) <= 6
                or any(not isinstance(s, str) or s not in config.QUOTE_AUTHORS for s in participants)
                or len(set(participants)) != len(participants)):
            raise RoundtableError(400, "请选择两到六位不同的哲学家。")
        try:
            session = Session(user_id, participants, region if region in ("CN", "US") else "CN")
        except FileNotFoundError:
            raise RoundtableError(400, "有哲学家的资料尚未准备好。") from None
        with self.lock:
            self.sessions[session.id] = session
        return session

    def get(self, session_id):
        self.expire()
        with self.lock:
            session = self.sessions.get(session_id)
            if not session:
                raise RoundtableError(410, "圆桌已结束或过期，请新开圆桌。")
            session.last_used = time.monotonic()
            return session

    def delete(self, session_id):
        with self.lock:
            session = self.sessions.pop(session_id, None)
            if session:
                session.close()

    def forget(self, user_id):
        with self.lock:
            for session_id, session in list(self.sessions.items()):
                if session.user_id == user_id:
                    self.delete(session_id)

    def expire(self):
        with self.lock:
            for session_id, session in list(self.sessions.items()):
                with session.condition:
                    if (not session.running and not session.pending
                            and time.monotonic() - session.last_used >= self.ttl):
                        self.delete(session_id)


STORE = SessionStore()


def start_cleanup():
    def clean():
        while True:
            time.sleep(60)
            STORE.expire()
    threading.Thread(target=clean, daemon=True).start()
