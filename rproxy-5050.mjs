import http from "node:http";
import net from "node:net";

const LISTEN = Number(process.env.LISTEN_PORT || 5050);
const API = process.env.API_TARGET || "127.0.0.1:5051"; // BitRouter
const DASH = process.env.DASH_TARGET || "127.0.0.1:8090"; // Frost Control Panel

function targetFor(req) {
  const p = req.url || "/";
  return p.startsWith("/v1/") || p === "/v1" ? API : DASH;
}

function proxyHttpRequest(req, res) {
  const [host, port] = targetFor(req).split(":");
  const opts = {
    host,
    port: Number(port),
    method: req.method,
    path: req.url,
    headers: req.headers,
  };
  const up = http.request(opts, (r) => {
    res.writeHead(r.statusCode || 502, r.headers);
    r.pipe(res);
  });
  up.on("error", (e) => {
    res.writeHead(502, { "content-type": "text/plain" });
    res.end("rproxy upstream error: " + e.message);
  });
  req.pipe(up);
}

function proxyUpgrade(req, socket, head) {
  const [host, port] = targetFor(req).split(":");
  const c = net.connect(Number(port), host, () => {
    c.write(head);
    c.pipe(socket);
    socket.pipe(c);
  });
  c.on("error", () => socket.destroy());
  socket.on("error", () => c.destroy());
}

const server = http.createServer(proxyHttpRequest);
server.on("upgrade", proxyUpgrade);
server.listen(LISTEN, "0.0.0.0", () => {
  console.log(`rproxy on :${LISTEN}  /v1/* -> ${API}   rest -> ${DASH}`);
});
