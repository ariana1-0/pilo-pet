"""本地服务入口（engine-api.md §7 首个里程碑）。

端点：
  GET  /health              健康检查 + 可用 slug
  GET  /quote?user_id&slug  忠实直译弹语；slug 省略时跨哲学家随机
  GET  /concept?corpus_id   概念卡“说人话”层（纯本地，不调用模型）
  POST /chat                流式对话（SSE），前置分类器 + 危机旁路
  POST /forget              用户主权：物理删除某用户记忆（memory §7）

跑法（在 philo-pet 仓库根）：
  python3 -m app.server.app
零新增依赖；智谱普通 API 凭据从环境变量或 app/.env.local 读取。
"""
import json
import mimetypes
import os
import queue
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

from . import (chat_service, classifier, config, crisis, credentials,
               engine, memory, quote_service, roundtable_service)
from .bigmodel_client import BigModelClient

CLIENT = None  # BigModelClient，main 中初始化


def _make_client():
    return BigModelClient(credentials.api_key(), config.ZAI_BASE_URL)


class Handler(BaseHTTPRequestHandler):
    server_version = "philo-pet-engine/1"

    # ── CORS（本地开发：网页端/桌宠从不同 origin 访问引擎）────
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        super().end_headers()

    def do_OPTIONS(self):  # 预检
        self.send_response(204)
        self.end_headers()

    # ── 响应助手 ────────────────────────────────────────
    def _json(self, code: int, obj: dict):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _static(self, request_path: str):
        """测试部署：由同一个 Render 服务提供静态网页与 API。"""
        relative = "index.html" if request_path == "/" else request_path.lstrip("/")
        root = config.WEB_DIR.resolve()
        target = (root / relative).resolve()
        if (
            not target.is_relative_to(root)
            or not target.is_file()
            or target.name.startswith(".")
        ):
            return self._json(404, {"error": "not found"})
        body = target.read_bytes()
        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if content_type.startswith("text/") or content_type in ("application/javascript", "application/json"):
            content_type += "; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        cache = "public, max-age=86400" if "/assets/" in request_path else "no-cache"
        self.send_header("Cache-Control", cache)
        self.end_headers()
        self.wfile.write(body)

    def _sse_start(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        # 每次 /chat 只承载一轮回复；done/error 后关闭连接，让客户端结束 loading。
        self.send_header("Connection", "close")
        self.send_header("X-Accel-Buffering", "no")  # 禁反代缓冲
        self.end_headers()
        self.close_connection = True

    def _sse(self, event: str, data: dict):
        chunk = f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
        self.wfile.write(chunk.encode("utf-8"))
        self.wfile.flush()

    def _body(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        if not length:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def log_message(self, fmt, *args):  # 精简日志
        pass

    # ── 路由 ────────────────────────────────────────────
    def do_GET(self):
        path = urlsplit(self.path).path
        qs = parse_qs(urlsplit(self.path).query)
        try:
            if path == "/health":
                return self._health()
            if path == "/quote":
                return self._quote(qs)
            if path == "/concept":
                return self._concept(qs)
            return self._static(path)
        except Exception as e:  # noqa: BLE001
            self._json(500, {"error": str(e)})

    def do_POST(self):
        path = urlsplit(self.path).path
        try:
            if path.startswith("/roundtable/"):
                return self._roundtable(path)
            if path == "/chat":
                return self._chat()
            if path == "/forget":
                return self._forget()
            self._json(404, {"error": "not found"})
        except roundtable_service.RoundtableError as e:
            self._json(e.status, {"error": e.message})
        except (ValueError, TypeError):
            self._json(400, {"error": "请求格式不正确。"})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:  # noqa: BLE001
            self._json(500, {"error": str(e)})

    # ── 处理器 ──────────────────────────────────────────
    def do_DELETE(self):
        parts = urlsplit(self.path).path.strip("/").split("/")
        if len(parts) == 3 and parts[:2] == ["roundtable", "sessions"]:
            roundtable_service.STORE.delete(parts[2])
            return self._json(200, {"deleted": True})
        self._json(404, {"error": "not found"})

    def _roundtable(self, path):
        body = self._body()
        if not isinstance(body, dict):
            raise ValueError("body must be an object")
        store = roundtable_service.STORE
        if path == "/roundtable/sessions":
            session = store.create(body.get("user_id"), body.get("participants"), body.get("region", "CN"))
            return self._json(201, {"session_id": session.id,
                                    "participants": session.participants})
        parts = path.strip("/").split("/")
        if len(parts) != 4 or parts[:2] != ["roundtable", "sessions"]:
            return self._json(404, {"error": "not found"})
        session = store.get(parts[2])
        action = parts[3]
        if action == "messages":
            return self._json(200, session.submit(CLIENT, body.get("message_id"), body.get("content")))
        if action == "stop":
            session.stop()
            return self._json(200, {"stopped": True})
        if action != "run":
            return self._json(404, {"error": "not found"})
        run_id, events = session.start(CLIENT, retry=body.get("retry") is True)
        try:
            self._sse_start()
            while True:
                try:
                    event, data = events.get(timeout=10)
                except queue.Empty:
                    self._sse("heartbeat", {})
                    continue
                self._sse(event, data)
                if event == "paused":
                    return
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            session.stop("disconnected", run_id=run_id)

    def _health(self):
        avail = []
        for slug in config.QUOTE_SLUGS:
            if config.build_paths(slug)["system_prompt"].exists():
                avail.append(slug)
        self._json(200, {"ok": True, "slugs_available": avail,
                         "model_provider": "bigmodel",
                         "api_configured": bool(CLIENT and CLIENT.configured),
                         "model_chat": config.MODEL_CHAT,
                         "model_classifier": config.MODEL_CLASSIFIER})

    def _quote(self, qs: dict):
        user_id = (qs.get("user_id") or ["anon"])[0]
        slug = (qs.get("slug") or [None])[0]
        q = quote_service.select(user_id, slug)
        self._json(200, {"quote": q})  # 无合适弹语时 quote 为 null

    def _concept(self, qs: dict):
        corpus_id = (qs.get("corpus_id") or [""])[0]
        slug = (qs.get("slug") or [config.DEFAULT_SLUG])[0]
        if not corpus_id:
            return self._json(400, {"error": "corpus_id required"})
        concept = engine.concept_plain(slug, corpus_id)
        if concept is None:
            return self._json(404, {"error": "concept plain not found"})
        self._json(200, {"concept": concept})

    def _forget(self):
        body = self._body()
        user_id = body.get("user_id")
        if not user_id:
            return self._json(400, {"error": "user_id required"})
        roundtable_service.STORE.forget(user_id)
        self._json(200, {"deleted": memory.forget_user(user_id)})

    def _chat(self):
        body = self._body()
        user_id = body.get("user_id", "anon")
        source = body.get("source", "web")
        slug = body.get("slug", config.DEFAULT_SLUG)
        region = body.get("region", "CN")
        messages = body.get("messages", [])
        user_text = ""
        for m in reversed(messages):
            if m.get("role") == "user" and isinstance(m.get("content"), str):
                user_text = m["content"]
                break

        # 1) 前置分类（含本地危机粗筛兜底）
        cls = classifier.classify(CLIENT, user_text, messages)

        self._sse_start()
        self._sse("classify", {"tags": cls["tags"], "crisis": cls["crisis"],
                               "degraded": cls["degraded"]})

        # 2) 请求路径唯一写入：时间线追加一条（memory §3.1）
        memory.append_timeline(user_id, source, cls["tags"])

        # 3) 危机旁路：不调用哲学家对话（engine-api §5，安全红线）
        if cls["crisis"]:
            memory.log_crisis(user_id, "prescreen" if cls["degraded"] else "classifier")
            self._sse("crisis", crisis.crisis_response(region))
            self._sse("done", {"stop_reason": "crisis_bypass"})
            return

        # 4) 正常对话：拼记忆摘要 → 组 system → 流式
        mortality_paused = memory.had_crisis_since(
            user_id, config.CRISIS_MORTALITY_PAUSE_DAYS)
        digest = chat_service.build_memory_digest(user_id, mortality_paused)
        if digest:
            self._sse("memory", {"digest": digest})
        system_text = chat_service.build_system_text(slug, digest)
        norm = chat_service.normalize_messages(messages)
        try:
            for ev in chat_service.stream_reply(CLIENT, system_text, norm):
                if ev["type"] == "delta":
                    self._sse("delta", {"text": ev["text"]})
                else:
                    self._sse("done", {"stop_reason": ev["stop_reason"],
                                       "refusal": ev.get("refusal")})
        except Exception as e:  # noqa: BLE001
            self._sse("error", {"error": str(e)})


def main():
    memory.init_db()
    engine.load_taxonomy()  # 预热 + 早失败
    global CLIENT
    CLIENT = _make_client()
    roundtable_service.start_cleanup()

    host = os.environ.get(
        "PHILO_HOST", "0.0.0.0" if os.environ.get("RENDER") else "127.0.0.1")
    port = int(os.environ.get("PORT") or os.environ.get("PHILO_PORT", "8848"))
    srv = ThreadingHTTPServer((host, port), Handler)
    print(f"philo-pet engine → http://{host}:{port}  (slug={config.DEFAULT_SLUG}, "
          f"provider=bigmodel, chat={config.MODEL_CHAT}, "
          f"api={'ready' if CLIENT.configured else 'not-configured'})")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")


if __name__ == "__main__":
    main()
