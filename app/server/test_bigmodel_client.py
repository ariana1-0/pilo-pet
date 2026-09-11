"""智谱 OpenAI 兼容层的离线协议测试。"""
import io
import json
import unittest
from unittest.mock import patch

from . import chat_service, classifier, config
from .bigmodel_client import BigModelClient


class _Response:
    def __init__(self, body: bytes):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return self.body

    def __iter__(self):
        return iter(io.BytesIO(self.body))


class BigModelClientTest(unittest.TestCase):
    @patch("app.server.bigmodel_client.request.urlopen")
    def test_json_completion_uses_ordinary_api(self, urlopen):
        urlopen.return_value = _Response(json.dumps({
            "choices": [{"message": {"content": '{"tags":[],"crisis":false}'}}]
        }).encode())
        client = BigModelClient("secret", "https://open.bigmodel.cn/api/paas/v4")

        result = client.complete(
            model="glm-4.7-flash",
            messages=[{"role": "user", "content": "你好"}],
            max_tokens=256,
            timeout=12,
            response_format={"type": "json_object"},
            thinking="disabled",
        )

        req = urlopen.call_args.args[0]
        sent = json.loads(req.data.decode())
        self.assertEqual(req.full_url,
                         "https://open.bigmodel.cn/api/paas/v4/chat/completions")
        self.assertEqual(sent["model"], "glm-4.7-flash")
        self.assertEqual(sent["response_format"], {"type": "json_object"})
        self.assertEqual(sent["thinking"], {"type": "disabled"})
        self.assertIn("choices", result)

    @patch("app.server.bigmodel_client.request.urlopen")
    def test_stream_is_mapped_to_existing_pet_events(self, urlopen):
        urlopen.return_value = _Response(
            b'data: {"choices":[{"delta":{"content":"hello"},"finish_reason":null}]}\n\n'
            b'data: {"choices":[{"delta":{"content":" world"},"finish_reason":null}]}\n\n'
            b'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'
            b'data: [DONE]\n\n'
        )
        client = BigModelClient("secret", "https://example.test/v4")

        events = list(chat_service.stream_reply(
            client,
            "system prompt",
            [{"role": "user", "content": "hi"}],
        ))

        self.assertEqual(events, [
            {"type": "delta", "text": "hello"},
            {"type": "delta", "text": " world"},
            {"type": "done", "stop_reason": "stop", "refusal": None},
        ])
        sent = json.loads(urlopen.call_args.args[0].data.decode())
        self.assertEqual(sent["thinking"], {"type": config.CHAT_THINKING})

    @patch("app.server.bigmodel_client.request.urlopen")
    def test_reasoning_can_be_enabled_or_left_to_provider(self, urlopen):
        urlopen.return_value = _Response(b'data: [DONE]\n\n')
        client = BigModelClient("secret", "https://example.test/v4")
        for mode in (None, "enabled"):
            list(client.stream(model="glm-5.2", messages=[], max_tokens=100,
                               timeout=12, thinking=mode))
            sent = json.loads(urlopen.call_args.args[0].data.decode())
            if mode is None:
                self.assertNotIn("thinking", sent)
            else:
                self.assertEqual(sent["thinking"], {"type": "enabled"})

    @patch("app.server.classifier.engine.load_taxonomy")
    def test_classifier_reads_json_and_filters_unknown_tags(self, load_taxonomy):
        class _Taxonomy:
            tag_ids = ["choice", "loss"]

            @staticmethod
            def few_shot_lines():
                return "- choice（选择困境）"

        class _Client:
            @staticmethod
            def complete(**_kwargs):
                return {"choices": [{"message": {
                    "content": '{"tags":["choice","invented"],"crisis":false}'
                }}]}

        load_taxonomy.return_value = _Taxonomy()
        result = classifier.classify(_Client(), "我要不要换工作？")
        self.assertEqual(result, {
            "tags": ["choice"], "crisis": False, "degraded": False,
        })


if __name__ == "__main__":
    unittest.main()
