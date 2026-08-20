#!/usr/bin/env python3
import json
import os
import re
import sys
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ZEN_BASE = "https://opencode.ai/zen/v1"
UA = "opencode/1.15.0 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.13"
PORT = int(os.environ.get("ZEN_RELAY_PORT", "7077"))
MODELS_CACHE = None
MODELS_CACHE_AT = 0
FREE_SUFFIXES = ("-free", "-free-beta")
EXTRA_MODELS = [
    {"id": "opencode/deepseek-v4-flash-free", "object": "model", "owned_by": "opencode"},
    {"id": "opencode/hy3-free", "object": "model", "owned_by": "opencode"},
    {"id": "opencode/mimo-v2.5-free", "object": "model", "owned_by": "opencode"},
    {"id": "opencode/nemotron-3-ultra-free", "object": "model", "owned_by": "opencode"},
    {"id": "opencode/kimi-k2.5-free", "object": "model", "owned_by": "opencode"},
    {"id": "deepseek-v4-flash-free", "object": "model", "owned_by": "opencode"},
]


def zen_headers(client_ip=None):
    h = {
        "Authorization": "Bearer public",
        "User-Agent": UA,
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
        "x-opencode-client": "cli",
        "x-opencode-project": "global",
        "x-opencode-session": "ses_" + uuid.uuid4().hex[:16],
        "x-opencode-request": "msg_" + uuid.uuid4().hex[:24],
    }
    if client_ip and client_ip not in ("127.0.0.1", "::1"):
        h["x-forwarded-for"] = client_ip
    return h


def fetch_models():
    global MODELS_CACHE, MODELS_CACHE_AT
    if MODELS_CACHE and time.time() - MODELS_CACHE_AT < 300:
        return MODELS_CACHE
    req = Request(ZEN_BASE + "/models", headers=zen_headers())
    try:
        with urlopen(req, timeout=20) as r:
            raw = json.loads(r.read().decode())
        models = []
        for m in raw.get("data", []):
            mid = m.get("id", "")
            if mid.endswith(FREE_SUFFIXES) or "free" in mid.lower():
                models.append({"id": mid, "object": "model", "owned_by": "opencode"})
        MODELS_CACHE = models + EXTRA_MODELS
        MODELS_CACHE_AT = time.time()
        return MODELS_CACHE
    except Exception as e:
        print(f"[zen-relay] model fetch failed: {e}", flush=True)
        return EXTRA_MODELS


def strip_stream_events(body: bytes) -> bytes:
    out = []
    for line in body.split(b"\n"):
        if line.startswith(b"data:") and line.strip() != b"data: [DONE]":
            try:
                obj = json.loads(line[5:].strip())
                if obj.get("type") == "error":
                    continue
            except Exception:
                pass
        out.append(line)
    return b"\n".join(out)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        sys.stderr.write("[zen-relay] %s\n" % (fmt % args))

    def _client_ip(self):
        fwd = self.headers.get("x-forwarded-for", "")
        if fwd:
            return fwd.split(",")[0].strip()
        return self.client_address[0]

    def _send(self, code, body, ctype):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if self.path.rstrip("/") == "/v1/models" or self.path.rstrip("/") == "/models":
            models = fetch_models()
            return self._send(200, json.dumps({"object": "list", "data": models}), "application/json")
        if self.path == "/health":
            return self._send(200, json.dumps({"ok": True}), "application/json")
        self._send(404, json.dumps({"error": "not found"}), "application/json")

    def do_POST(self):
        if not (self.path.rstrip("/").endswith("/v1/chat/completions") or self.path.rstrip("/").endswith("/chat/completions")):
            return self._send(404, json.dumps({"error": "not found"}), "application/json")
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length) if length else b"{}"
            payload = json.loads(body.decode("utf-8"))
        except Exception:
            return self._send(400, json.dumps({"error": "bad json"}), "application/json")

        model = payload.get("model", "")
        clean = model.split("/")[-1]
        payload["model"] = clean
        stream = bool(payload.get("stream", False))

        data = json.dumps(payload).encode()
        req = Request(ZEN_BASE + "/chat/completions", data=data, headers=zen_headers(self._client_ip()), method="POST")
        try:
            upstream = urlopen(req, timeout=600)
        except HTTPError as e:
            err_body = e.read().decode(errors="replace")[:500]
            print(f"[zen-relay] upstream error {e.code}: {err_body[:200]}", flush=True)
            return self._send(e.code, err_body.encode(), "application/json")
        except Exception as e:
            print(f"[zen-relay] upstream fail: {e}", flush=True)
            return self._send(502, json.dumps({"error": {"message": str(e)}}), "application/json")

        if stream:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "close")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            try:
                while True:
                    chunk = upstream.read(4096)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    self.wfile.flush()
            except Exception:
                pass
            finally:
                upstream.close()
        else:
            raw = upstream.read()
            upstream.close()
            ctype = upstream.headers.get("Content-Type", "application/json")
            if "event-stream" in ctype or raw.lstrip().startswith(b"data:"):
                self._send(200, strip_stream_events(raw), "application/json")
            else:
                self._send(200, raw, "application/json")


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"[zen-relay] listening on 127.0.0.1:{PORT} -> {ZEN_BASE}", flush=True)
    server.serve_forever()