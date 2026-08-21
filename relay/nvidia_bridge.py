#!/usr/bin/env python3
import json
import os
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

UPSTREAM = "https://integrate.api.nvidia.com"
PORT = int(os.environ.get("NVIDIA_BRIDGE_PORT", "9456"))
KEY = os.environ.get("NVIDIA_API_KEY", "")

def forward(path, body, headers, method="POST"):
    target = UPSTREAM + path
    req_headers = {
        "Authorization": "Bearer " + KEY,
        "Content-Type": "application/json",
        "User-Agent": "curl/8.21.0",
        "Accept": headers.get("Accept", "*/*"),
    }
    if headers.get("Content-Type", "").startswith("multipart/form-data"):
        req_headers["Content-Type"] = headers["Content-Type"]
    req = urllib.request.Request(target, data=body, headers=req_headers, method=method)
    return urllib.request.urlopen(req, timeout=300)

class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _relay(self, method):
        ln = int(self.headers.get("Content-Length", 0) or 0)
        body = self.rfile.read(ln) if ln else None
        try:
            up = forward(self.path, body, self.headers, method)
        except urllib.error.HTTPError as e:
            data = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        except Exception as e:
            resp = json.dumps({"error": {"message": str(e)[:200], "type": "bridge_error", "code": "bridge_upstream_failed"}}).encode()
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(resp)))
            self.end_headers()
            self.wfile.write(resp)
            return

        ctype = up.headers.get("Content-Type", "application/json")
        streaming = False
        try:
            req_body = json.loads(body or b"{}")
            streaming = req_body.get("stream") is True
        except Exception:
            pass

        self.send_response(up.status)
        self.send_header("Content-Type", ctype)
        if streaming:
            self.send_header("Transfer-Encoding", "chunked")
            self.end_headers()
            try:
                while True:
                    chunk = up.read(8192)
                    if not chunk:
                        break
                    if len(chunk):
                        self.wfile.write(("%x\r\n" % len(chunk)).encode() + chunk + b"\r\n")
                self.wfile.write(b"0\r\n\r\n")
            finally:
                up.close()
        else:
            data = up.read()
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    def do_POST(self):
        self._relay("POST")

    def do_GET(self):
        self._relay("GET")

    def log_message(self, fmt, *args):
        sys.stderr.write("[nvidia-bridge] %s %s\n" % (self.address_string(), fmt % args))

if __name__ == "__main__":
    if not KEY:
        sys.stderr.write("NVIDIA_BRIDGE_PORT=%s NVIDIA_API_KEY missing\n" % PORT)
        sys.exit(1)
    sys.stderr.write("nvidia-bridge listening on 127.0.0.1:%s -> %s\n" % (PORT, UPSTREAM))
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()