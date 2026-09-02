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

  // topology schematic page
  if (p === "/topo" || p === "/schematic") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(TOPO_HTML);
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

const TOPO_HTML = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>ZESRouter — Topology Schematic</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#050b16; color:#c8d6e5; font-family:'SF Mono','Fira Code','Consolas',monospace; padding:24px; line-height:1.6; }
  h1 { color:#5dade2; font-size:1.4rem; margin-bottom:4px; }
  h2 { color:#5dade2; font-size:1.1rem; margin:20px 0 8px; border-bottom:1px solid #1a3a5c; padding-bottom:4px; }
  .sub { color:#7f8c8d; font-size:0.85rem; margin-bottom:16px; }
  .box { border:1px solid #1a3a5c; border-radius:6px; padding:10px 14px; margin:6px 0; background:#0a1929; }
  .box:hover { border-color:#5dade2; }
  .port { color:#f39c12; font-weight:bold; }
  .up { color:#2ecc71; }
  .arrow { color:#5dade2; text-align:center; margin:4px 0; }
  .layer { margin-left:24px; border-left:2px solid #1a3a5c; padding-left:16px; }
  table { border-collapse:collapse; width:100%; margin:8px 0; }
  th, td { border:1px solid #1a3a5c; padding:6px 10px; text-align:left; font-size:0.85rem; }
  th { background:#0a1929; color:#5dade2; }
  code { background:#1a3a5c; padding:1px 5px; border-radius:3px; color:#f39c12; font-size:0.85rem; }
  .tag { display:inline-block; background:#1a3a5c; color:#2ecc71; padding:2px 8px; border-radius:10px; font-size:0.75rem; margin:2px; }
  pre { background:#0a1929; border:1px solid #1a3a5c; padding:12px; border-radius:6px; overflow-x:auto; font-size:0.8rem; white-space:pre-wrap; }
  a { color:#5dade2; text-decoration:none; }
</style>
</head>
<body>
<h1>ZESRouter — Topology Schematic</h1>
<p class="sub">rproxy :5050 &middot; BitRouter :5051 &middot; Zen :7077 &middot; NVIDIA :9456 &middot; 9Router :20128 &middot; Pollinations :7079 &middot; Frost :8090</p>

<h2>Layer 1 — Client</h2>
<div class="box">CLI / Codex / Hermes agents &rarr; <code>http://127.0.0.1:5050</code></div>

<h2>Layer 2 — rproxy :5050 (Frost Control Panel)</h2>
<div class="box">Node.js HTTP server &middot; path-based routing</div>
<div class="layer">
  <div class="box"><span class="tag">/v1/*</span> &rarr; <span class="up">BitRouter :5051</span> (all /v1 API routes)</div>
  <div class="box"><span class="tag">/up/{port}</span> &rarr; upstream probe/proxy</div>
  <div class="box"><span class="tag">/api/control</span> &rarr; service start/stop</div>
  <div class="box"><span class="tag">/api/providers</span> &rarr; provider CRUD</div>
  <div class="box"><span class="tag">/topo</span> &rarr; this schematic</div>
  <div class="box"><span class="tag">* (rest)</span> &rarr; Frost UI (index.html)</div>
</div>

<h2>Layer 3 — BitRouter :5051 (policy router)</h2>
<div class="box">Policy table &middot; tiered routing &middot; OTel observability</div>
<div class="layer">
  <div class="box">tiers: <span class="tag">cheap</span> &rarr; <code>opencode/muse-spark-1.2-contributor-free</code></div>
  <div class="box">tiers: <span class="tag">flagship</span> &rarr; <code>anthropic/claude-sonnet-5</code></div>
  <div class="box">tiers: <span class="tag">tool_safe</span> &rarr; [flagship]</div>
</div>

<h2>Layer 4 — Relays downstream</h2>
<div class="layer">
  <div class="box"><span class="port">Zen relay :7077</span> &rarr; <span class="up">opencode.ai/zen/v1</span> (keyless free pool)</div>
  <div class="box"><span class="port">NVIDIA bridge :9456</span> &rarr; <span class="up">integrate.api.nvidia.com/v1</span> (20 models, NVIDIA_API_KEY)</div>
  <div class="box"><span class="port">9Router :20128</span> &rarr; local LLM pool (auto-zes, auto-best, auto-vision)</div>
  <div class="box"><span class="port">Pollinations :7079</span> &rarr; <span class="up">gen.pollinations.ai/v1</span> (keyless, 4 models)</div>
  <div class="box"><span class="port">AI Horde :8078</span> &rarr; anonymous pool</div>
</div>

<h2>Layer 5 — Upstream APIs</h2>
<div class="layer">
  <div class="box"><span class="up">https://opencode.ai/zen/v1</span> &mdash; models: muse-spark-1.2, hy3, mimo-v2.5, nemotron-3-ultra, laguna-s-2.1, deepseek-v4-flash-free, big-pickle</div>
  <div class="box"><span class="up">https://integrate.api.nvidia.com/v1</span> &mdash; models: glm-5.2, gemma-4-31b, gpt-oss-20b, nemotron-3-ultra, minimax-m3, llama-3.x, deepseek-v4-flash</div>
  <div class="box"><span class="up">local LLM pool</span> &mdash; 9Router auto-zes/auto-best/auto-vision</div>
</div>

<h2>Model Routing Map</h2>
<table>
<tr><th>Model</th><th>Tier</th><th>Route</th><th>Provider</th><th>Port</th></tr>
<tr><td><code>opencode/hy3-free</code></td><td>cheap</td><td>policy &rarr; zen</td><td>opencode-zen-relay</td><td>:7077</td></tr>
<tr><td><code>opencode/muse-spark-1.2-contributor-free</code></td><td>cheap</td><td>policy &rarr; zen</td><td>opencode-zen-relay</td><td>:7077</td></tr>
<tr><td><code>opencode/nemotron-3-ultra-free</code></td><td>cheap</td><td>policy &rarr; zen</td><td>opencode-zen-relay</td><td>:7077</td></tr>
<tr><td><code>anthropic/claude-sonnet-5</code></td><td>flagship</td><td>zen (muse-spark) + nvidia</td><td>opencode-zen-relay / nvidia</td><td>:7077/:9456</td></tr>
<tr><td><code>nvidia/nvidia/minimaxai/minimax-m3</code></td><td>nvidia</td><td>direct</td><td>nvidia</td><td>:9456</td></tr>
<tr><td><code>nvidia/z-ai/glm-5.2</code></td><td>nvidia</td><td>direct</td><td>nvidia</td><td>:9456</td></tr>
<tr><td><code>9router/auto-zes</code></td><td>explicit</td><td>direct</td><td>9Router</td><td>:20128</td></tr>
</table>

<h2>Quick Verify</h2>
<pre>curl -s http://127.0.0.1:5050/v1/models          | jq .data[].id
curl -s http://127.0.0.1:5050/topo              | this page
curl -s http://127.0.0.1:5050/up/7077/v1/models  | zen relay
curl -s http://127.0.0.1:5050/up/9456/v1/models  | nvidia bridge</pre>

<h2>Links</h2>
<p><a href="/">Frost UI</a> &middot; <a href="/topo">Topology</a> &middot; <a href="/v1/models">Models</a> &middot; <a href="/api/providers">Providers</a></p>
</body>
</html>`;

server.listen(PORT, "127.0.0.1", () => console.log(`[dash] listening on :${PORT}`));
