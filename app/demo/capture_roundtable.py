"""Capture one real, default roundtable for the static presentation.

Uses a fresh demo identity and stores only the supplied prompt/model output.
Never reads credentials, existing user sessions, or existing conversations.
"""
import argparse
import datetime
import json
from pathlib import Path
import time
import urllib.request
import uuid


def capture(base, output):
    def request(path, body=None, method=None):
        data = None if body is None else json.dumps(body, ensure_ascii=False).encode()
        req = urllib.request.Request(base + path, data=data, method=method,
                                     headers={"Content-Type": "application/json"})
        return urllib.request.urlopen(req, timeout=180)

    prompt = "你们怎么看待亲密关系？"
    roster = ["marcus-aurelius", "zhuangzi", "nietzsche"]
    with request("/health") as response:
        health = json.load(response)
    if not health.get("api_configured"):
        raise RuntimeError("The local model service is not configured")
    with request("/roundtable/sessions", {"user_id": "demo-capture-" + uuid.uuid4().hex,
                 "participants": roster, "region": "CN"}) as response:
        session = json.load(response)
    route = "/roundtable/sessions/" + session["session_id"]
    events, turns = [], []
    started = time.monotonic()
    try:
        with request(route + "/messages", {"message_id": uuid.uuid4().hex, "content": prompt}) as response:
            accepted = json.load(response)
        if not accepted.get("accepted") or accepted.get("crisis"):
            raise RuntimeError("The discussion did not accept the demo prompt")
        event, lines, completed = None, [], False
        with request(route + "/run", {"retry": False}) as response:
            for raw in response:
                line = raw.decode("utf-8").rstrip("\r\n")
                if line.startswith("event:"):
                    event = line[6:].strip()
                elif line.startswith("data:"):
                    lines.append(line[5:].lstrip())
                elif not line and lines:
                    payload = json.loads("\n".join(lines))
                    elapsed = round((time.monotonic() - started) * 1000)
                    if event not in ("heartbeat",):
                        events.append({"event": event, "at_ms": elapsed, "data": payload})
                    if event == "speaker_start":
                        print("Started:", payload["slug"], flush=True)
                    elif event == "speaker_done":
                        turns.append({"slug": payload["slug"], "text": payload["text"]})
                        print("Completed:", payload["slug"], len(payload["text"]), "characters", flush=True)
                    elif event in ("error", "crisis"):
                        raise RuntimeError("Capture interrupted: " + json.dumps(payload, ensure_ascii=False))
                    elif event == "paused":
                        completed = payload.get("reason") == "complete"
                        break
                    event, lines = None, []
        if not completed or [turn["slug"] for turn in turns] != roster * 2:
            raise RuntimeError("Expected all six complete speeches; previous capture was preserved")
        result = {"prompt": prompt, "participants": roster, "turns": turns,
                  "captured_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  "model": health["model_chat"], "provider": health["model_provider"],
                  "duration_ms": round((time.monotonic() - started) * 1000),
                  "source": "Local /roundtable/sessions API; unedited speaker_done text",
                  "events": events}
        output.parent.mkdir(parents=True, exist_ok=True)
        temporary = output.with_suffix(".tmp")
        temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
        temporary.replace(output)
        print("Saved:", output, flush=True)
    finally:
        try:
            with request(route, method="DELETE"):
                pass
        except OSError:
            pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://127.0.0.1:8848")
    parser.add_argument("--output", type=Path, default=Path(__file__).parent / "assets/showcase/roundtable.json")
    args = parser.parse_args()
    capture(args.base.rstrip("/"), args.output)
