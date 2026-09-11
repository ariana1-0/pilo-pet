"""智谱开放平台普通 API 的轻量客户端。

只实现 philo-pet 需要的 OpenAI 兼容 ``/chat/completions``，使用 Python
标准库，避免为了两处调用再引入 SDK 依赖。
"""
import json
import socket
import threading
from urllib import error, request


class BigModelError(RuntimeError):
    pass


class StreamCancellation:
    """Cancel a roundtable stream without changing existing chat callers."""
    def __init__(self):
        self.event = threading.Event()
        self.lock = threading.Lock()
        self.response = None

    def is_set(self):
        return self.event.is_set()

    def attach(self, response):
        with self.lock:
            self.response = response
            if self.is_set():
                response.close()

    def detach(self):
        with self.lock:
            self.response = None

    def cancel(self):
        self.event.set()
        with self.lock:
            response = self.response
        if response is not None:
            # Closing a buffered HTTP reader may wait on its read lock. Never
            # block the stop endpoint or the session's scheduling lock on it.
            def close():
                try:
                    response.close()
                except OSError:
                    pass
            threading.Thread(target=close, daemon=True).start()


class BigModelClient:
    def __init__(self, api_key: str, base_url: str):
        self.api_key = api_key.strip()
        self.base_url = base_url.rstrip("/")

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

    def _open(self, payload: dict, timeout: float):
        if not self.api_key:
            raise BigModelError(
                "未配置 ZAI_API_KEY；请在 app/.env.local 中填写智谱开放平台普通 API key"
            )
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = request.Request(
            f"{self.base_url}/chat/completions",
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "Accept": "text/event-stream" if payload.get("stream") else "application/json",
                "User-Agent": "philo-pet/0.1",
            },
        )
        try:
            return request.urlopen(req, timeout=timeout)
        except error.HTTPError as exc:
            detail = ""
            try:
                data = json.loads(exc.read().decode("utf-8", errors="replace"))
                detail = data.get("error", {}).get("message") or data.get("message") or ""
            except (json.JSONDecodeError, AttributeError, UnicodeDecodeError):
                pass
            suffix = f"：{detail}" if detail else ""
            raise BigModelError(f"智谱 API 返回 HTTP {exc.code}{suffix}") from exc
        except (error.URLError, TimeoutError, socket.timeout) as exc:
            reason = getattr(exc, "reason", exc)
            raise BigModelError(f"连接智谱 API 失败：{reason}") from exc

    def complete(self, *, model: str, messages: list, max_tokens: int,
                 timeout: float, response_format: dict = None, thinking=None) -> dict:
        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "stream": False,
        }
        if response_format:
            payload["response_format"] = response_format
        if thinking is not None:
            payload["thinking"] = {"type": thinking}
        with self._open(payload, timeout) as resp:
            try:
                return json.loads(resp.read().decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError) as exc:
                raise BigModelError("智谱 API 返回了无法解析的 JSON") from exc

    def stream(self, *, model: str, messages: list, max_tokens: int,
               timeout: float, cancel=None, thinking=None):
        """逐条产出 OpenAI 兼容 SSE 的 JSON 对象，忽略心跳和 [DONE]。"""
        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "stream": True,
        }
        if thinking is not None:
            payload["thinking"] = {"type": thinking}
        if cancel and cancel.is_set():
            return
        try:
            with self._open(payload, timeout) as resp:
                if cancel:
                    cancel.attach(resp)
                    if cancel.is_set():
                        return
                for raw in resp:
                    if cancel and cancel.is_set():
                        return
                    line = raw.decode("utf-8", errors="replace").strip()
                    if not line or line.startswith(":") or not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        yield json.loads(data)
                    except json.JSONDecodeError as exc:
                        raise BigModelError("智谱流式响应中出现了无法解析的数据") from exc
        finally:
            if cancel:
                cancel.detach()
