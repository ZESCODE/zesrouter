import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";

const PORT = Number(process.env.PORT) || 5050;
const DIST = "/data/data/com.termux/files/home/build/zesrouter-dash/dist";
const HOME = process.env.HOME || "/data/data/com.termux/files/home";

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".ico": "image/x-icon", ".woff2": "font/woff2",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  // service control -> dash-ctl.sh (allow-listed)
  if (p.startsWith("/api/control")) {
    if (req.method !== "POST") {
      res.writeHead(405, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: "method_not_allowed" }));
    }
    const m = p.match(/^\/api\/control\/([\w-]+)\/(start|stop)$/);
    const ALLOW = new Set(["9router", "zesrouter", "opencode-zen", "zen-relay", "nvidia-bridge"]);
    if (!m || !ALLOW.has(m[1])) {
      res.writeHead(400, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: "bad_request" }));
    }
    execFile("bash", [HOME + "/zesrouter/dash-ctl.sh", m[1], m[2]], { timeout: 60000 }, (err) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: !err, id: m[1], action: m[2], error: err ? String(err.message) : null }));
    });
    return;
  }

  // upstream probe/proxy -> 127.0.0.1:<port>
  if (p.startsWith("/up/")) {
    const m = p.match(/^\/up\/(\d+)(?:\/(.*))?$/);
    if (!m) { res.writeHead(400); return res.end(); }
    const port = Number(m[1]);
    const rest = "/" + (m[2] || "");
    const up = http.request(
      { host: "127.0.0.1", port, path: rest, method: req.method,
        headers: { ...req.headers, host: `127.0.0.1:${port}` } },
      (ur) => { res.writeHead(ur.statusCode, ur.headers); ur.pipe(res); }
    );
    up.on("error", () => {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "upstream_unreachable", port }));
    });
    req.pipe(up);
    return;
  }

  // same-origin gateway proxy -> ZESRouter (BitRouter) on internal :5051
  // BitRouter itself serves no UI, so this server is the single :5050
  // listener: it serves the Frost control panel AND proxies /v1/* to the
  // real BitRouter (mirrors how 9router serves UI + API on one port).
  if (p.startsWith("/v1")) {
    const up = http.request(
      { host: "127.0.0.1", port: 5051, path: p, method: req.method,
        headers: { ...req.headers, host: "127.0.0.1:5051" } },
      (ur) => { res.writeHead(ur.statusCode, ur.headers); ur.pipe(res); }
    );
    up.on("error", () => {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "upstream_unreachable", port: 5051 }));
    });
    req.pipe(up);
    return;
  }

  // provider management (allow-listed; persists to bitrouter.yaml via python helper)
  if (p === "/api/providers") {
    if (req.method === "GET") {
      execFile("python3", [HOME + "/zesrouter/dash_provider.py", "list"], { timeout: 20000 },
        (err, stdout) => {
          if (err) { res.writeHead(500, { "content-type": "application/json" }); return res.end(JSON.stringify({ error: String(err.message) })); }
          res.writeHead(200, { "content-type": "application/json" });
          res.end(stdout);
        });
      return;
    }
    if (req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const tmp = os.tmpdir() + "/zr-prov-" + Date.now() + ".json";
        try { fs.writeFileSync(tmp, body); } catch (e) {
          res.writeHead(500, { "content-type": "application/json" });
          return res.end(JSON.stringify({ error: "write temp failed" }));
        }
        execFile("python3", [HOME + "/zesrouter/dash_provider.py", "add", tmp], { timeout: 20000 },
          (err, stdout) => {
            try { fs.unlinkSync(tmp); } catch {}
            if (err) {
              res.writeHead(400, { "content-type": "application/json" });
              return res.end(JSON.stringify({ error: String(err.message || err) }));
            }
            // deploy to proot + restart bitrouter so the new provider is live
            execFile("bash", [HOME + "/zesrouter/dash-ctl.sh", "zesrouter", "stop"], { timeout: 30000 }, () => {
              execFile("bash", [HOME + "/zesrouter/dash-ctl.sh", "zesrouter", "start"], { timeout: 60000 }, () => {
                res.writeHead(200, { "content-type": "application/json" });
                res.end(stdout);
              });
            });
          });
      });
      return;
    }
    res.writeHead(405, { "content-type": "application/json" });
    return res.end(JSON.stringify({ error: "method_not_allowed" }));
  }

  // provider management by id (delete / enable / disable)
  if (p.startsWith("/api/providers/")) {
    const m = p.match(/^\/api\/providers\/([\w.-]+)$/);
    if (!m) {
      res.writeHead(400, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: "bad_id" }));
    }
    const pid = m[1];
    const restart = (cb) => {
      execFile("bash", [HOME + "/zesrouter/dash-ctl.sh", "zesrouter", "stop"], { timeout: 30000 }, () => {
        execFile("bash", [HOME + "/zesrouter/dash-ctl.sh", "zesrouter", "start"], { timeout: 60000 }, cb);
      });
    };
    if (req.method === "DELETE") {
      execFile("python3", [HOME + "/zesrouter/dash_provider.py", "delete", pid], { timeout: 20000 },
        (err, stdout) => {
          if (err) { res.writeHead(500, { "content-type": "application/json" }); return res.end(JSON.stringify({ error: String(err.message) })); }
          restart(() => { res.writeHead(200, { "content-type": "application/json" }); res.end(stdout); });
        });
      return;
    }
    if (req.method === "PATCH") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        let enabled = true;
        try { enabled = JSON.parse(body).enabled !== false; } catch {}
        execFile("python3", [HOME + "/zesrouter/dash_provider.py", enabled ? "enable" : "disable", pid], { timeout: 20000 },
          (err, stdout) => {
            if (err) { res.writeHead(500, { "content-type": "application/json" }); return res.end(JSON.stringify({ error: String(err.message) })); }
            restart(() => { res.writeHead(200, { "content-type": "application/json" }); res.end(stdout); });
          });
      });
      return;
    }
    res.writeHead(405, { "content-type": "application/json" });
    return res.end(JSON.stringify({ error: "method_not_allowed" }));
  }

  // topology schematic page - serve archify-generated diagram
  if (p === "/topo" || p === "/schematic" || p === "/zesrouter.html") {
    const topoFile = path.join(DIST, "zesrouter.html");
    fs.readFile(topoFile, (err, data) => {
      if (err) { res.writeHead(502, { "content-type": "text/plain" }); res.end("topo unavailable"); }
      else { res.writeHead(200, { "content-type": "text/html" }); res.end(data); }
    });
    return;
  }

  // static files with SPA fallback
  let file = path.join(DIST, p === "/" ? "index.html" : decodeURIComponent(p));
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) {
      return fs.readFile(path.join(DIST, "index.html"), (e2, d2) => {
        if (e2) { res.writeHead(404); return res.end("not found"); }
        res.writeHead(200, { "content-type": "text/html" });
        res.end(d2);
      });
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, "127.0.0.1", () => console.log(`[dash] listening on :${PORT}`));
