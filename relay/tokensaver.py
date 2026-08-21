#!/usr/bin/env python3
import hashlib
import html as html_mod
import json
import os
import re
import threading
import time
from urllib.parse import urlparse, parse_qs

ENABLED = os.environ.get("TOKENSAVER_ENABLED", "1") not in ("0", "false", "no")
MIN_BYTES = int(os.environ.get("TOKENSAVER_MIN_BYTES", "2048"))
CCR_MIN_TOKENS = int(os.environ.get("TOKENSAVER_CCR_MIN_TOKENS", "500"))
MAX_ENTRIES = int(os.environ.get("TOKENSAVER_MAX_ENTRIES", "256"))
MAX_CACHE_BYTES = int(os.environ.get("TOKENSAVER_MAX_CACHE_BYTES", str(64 * 1024 * 1024)))
DISK_TIER = os.environ.get("TOKENSAVER_DISK", "1") not in ("0", "false", "no")
STATS_PATH = os.environ.get("TOKENSAVER_STATS", os.path.expanduser("~/.zesrouter/tokensaver_stats.json"))
CCR_DIR = os.environ.get("TOKENSAVER_CCR_DIR", os.path.expanduser("~/.zesrouter/ccr"))

_LOCK = threading.Lock()
_STORE = {}
_STORE_BYTES = 0
_STATS = {
    "started_at": time.time(),
    "requests_seen": 0,
    "messages_compressed": 0,
    "messages_passed": 0,
    "chars_in": 0,
    "chars_out": 0,
    "tokens_in": 0,
    "tokens_out": 0,
    "ccr_stored": 0,
    "ccr_retrieved": 0,
    "by_kind": {},
}
_LAST_FLUSH = 0.0

_ERROR_RE = re.compile(r"\b(error|ERROR|Error|FATAL|fatal|PANIC|panic|exception|Exception|Traceback|FAIL|failed|FAILURE|warning|WARN|Warning)\b")
_STACK_RE = re.compile(r"^\s+(at\s|File\s\"|raise\s|from\s)|^\s*Traceback|^\s*\.\.\.\s+\d+\s+more")
_SIG_RE = re.compile(r"^\s*(def |class |function |func |fn |async def |public |private |protected |static |export |interface |type |struct |impl |trait |@)")
_KEEP_CODE_RE = re.compile(r"(TODO|FIXME|XXX|HACK|BUG:|error|Error|ERROR|panic!|unwrap\(\)|throw |raise )")
_IMPORT_RE = re.compile(r"^\s*(import |from .* import|require\(|#include|use |using |package |extern crate)")
_GREP_RE = re.compile(r"^([^:\s]+?):(\d+):(.*)$", re.MULTILINE)
_DIFF_HEAD_RE = re.compile(r"^(diff --git |Index: |\+\+\+ |--- )", re.MULTILINE)
_LOCKFILE_RE = re.compile(r"(package-lock\.json|yarn\.lock|Cargo\.lock|poetry\.lock|pnpm-lock\.yaml|composer\.lock|Gemfile\.lock)$")
_NOISE_LOG_RE = re.compile(r"^(GET |POST |PUT |DELETE |\d{1,3}(\.\d{1,3}){3} - -|::1 - -|127\.0\.0\.1 - -)")


def est_tokens(text):
    return max(1, len(text) // 4)


def _bump(kind, cin, cout):
    k = _STATS["by_kind"].setdefault(kind, {"count": 0, "chars_in": 0, "chars_out": 0})
    k["count"] += 1
    k["chars_in"] += cin
    k["chars_out"] += cout


def _flush_stats(force=False):
    global _LAST_FLUSH
    now = time.time()
    if not force and now - _LAST_FLUSH < 30:
        return
    _LAST_FLUSH = now
    try:
        os.makedirs(os.path.dirname(STATS_PATH), exist_ok=True)
        tmp = STATS_PATH + ".tmp"
        with open(tmp, "w") as f:
            json.dump(_stats_snapshot(), f)
        os.replace(tmp, STATS_PATH)
    except Exception:
        pass


def _stats_snapshot():
    with _LOCK:
        s = dict(_STATS)
        s["by_kind"] = {k: dict(v) for k, v in _STATS["by_kind"].items()}
        s["uptime_secs"] = int(time.time() - _STATS["started_at"])
        saved = s["tokens_in"] - s["tokens_out"]
        s["tokens_saved"] = max(0, saved)
        s["reduction_pct"] = round(100.0 * saved / s["tokens_in"], 1) if s["tokens_in"] else 0.0
        s["cache_entries"] = len(_STORE)
        s["cache_bytes"] = _STORE_BYTES
        return s


def stats():
    return _stats_snapshot()


def reset_stats():
    with _LOCK:
        _STATS.update({
            "started_at": time.time(),
            "requests_seen": 0,
            "messages_compressed": 0,
            "messages_passed": 0,
            "chars_in": 0,
            "chars_out": 0,
            "tokens_in": 0,
            "tokens_out": 0,
            "ccr_stored": 0,
            "ccr_retrieved": 0,
            "by_kind": {},
        })
    _flush_stats(force=True)


def detect_kind(text):
    head = text[:4096].lstrip()
    if not head:
        return "plain"
    if head[0] in "[{" or head.startswith('"'):
        try:
            json.loads(text)
            return "json"
        except Exception:
            pass
    diff_hits = len(_DIFF_HEAD_RE.findall(text[:2048]))
    at_lines = len(re.findall(r"^@@ ", text[:2048], re.MULTILINE))
    if diff_hits >= 2 or (diff_hits >= 1 and at_lines >= 1):
        return "diff"
    grep_hits = len(_GREP_RE.findall(text[:4096]))
    if grep_hits >= 5:
        return "search"
    stripped = text.lstrip()[:512].lower()
    if stripped.startswith("<!doctype html") or stripped.startswith("<html") or (
        "<body" in stripped or "<div" in stripped or "<p>" in stripped
    ):
        return "html"
    code_sigs = sum(1 for line in text.splitlines()[:80] if _SIG_RE.match(line))
    imports = sum(1 for line in text.splitlines()[:80] if _IMPORT_RE.match(line))
    if code_sigs + imports >= 4:
        return "code"
    err_density = len(_ERROR_RE.findall(text[:4096]))
    noise = sum(1 for line in text.splitlines()[:60] if _NOISE_LOG_RE.match(line))
    if err_density >= 2 or noise >= 5:
        return "log"
    return "plain"


def _store_original(original, compressed):
    global _STORE_BYTES
    if est_tokens(original) < CCR_MIN_TOKENS:
        return None
    token = hashlib.sha256(original.encode("utf-8", "replace")).hexdigest()
    short = token[:16]
    with _LOCK:
        if short not in _STORE:
            need = len(original.encode("utf-8", "replace"))
            while _STORE and (_STORE_BYTES + need > MAX_CACHE_BYTES or len(_STORE) >= MAX_ENTRIES):
                evict_short, evict_val = next(iter(_STORE.items()))
                _STORE_BYTES -= len(evict_val.encode("utf-8", "replace"))
                del _STORE[evict_short]
            _STORE[short] = original
            _STORE_BYTES += need
            _STATS["ccr_stored"] += 1
    if DISK_TIER:
        try:
            os.makedirs(CCR_DIR, exist_ok=True)
            path = os.path.join(CCR_DIR, short + ".txt")
            if not os.path.exists(path):
                with open(path, "w") as f:
                    f.write(original)
        except Exception:
            pass
    return short


def retrieve(token):
    token = token.strip()[:16]
    with _LOCK:
        val = _STORE.get(token)
    if val is not None:
        with _LOCK:
            _STATS["ccr_retrieved"] += 1
        return val
    if DISK_TIER:
        try:
            path = os.path.join(CCR_DIR, token + ".txt")
            if os.path.exists(path):
                with open(path) as f:
                    val = f.read()
                with _LOCK:
                    _STATS["ccr_retrieved"] += 1
                return val
        except Exception:
            pass
    return None


def compress_json(text):
    try:
        data = json.loads(text)
    except Exception:
        return None
    MAX_ROWS = 40

    def rows_table(items):
        n = len(items)
        keys = []
        for obj in items[:20]:
            for k in obj.keys():
                if k not in keys:
                    keys.append(k)
        lines = ["| " + " | ".join(keys) + " |"]
        idxs = list(range(n))
        if n > MAX_ROWS:
            keep = set(range(10)) | set(range(n - 10, n))
            for i, obj in enumerate(items):
                joined = json.dumps(obj).lower()
                if "error" in joined or "fail" in joined or "exception" in joined:
                    keep.add(i)
            for i, obj in enumerate(items):
                for k in ("id", "count", "total", "size", "bytes"):
                    v = obj.get(k)
                    if isinstance(v, (int, float)):
                        vals = [o.get(k) for o in items if isinstance(o.get(k), (int, float))]
                        if vals and (v >= sorted(vals)[int(len(vals) * 0.95)] or v <= sorted(vals)[max(0, int(len(vals) * 0.05))]):
                            keep.add(i)
            idxs = sorted(keep)
        for i in idxs:
            obj = items[i]
            cells = [str(obj.get(k, ""))[:60] for k in keys]
            lines.append("| " + " | ".join(cells) + " |")
        if n > MAX_ROWS:
            omitted = n - len(idxs)
            lines.append(f"[+{omitted} rows omitted · {n} total]")
        return "\n".join(lines)

    changed = False
    if isinstance(data, list) and data and all(isinstance(x, dict) for x in data):
        return rows_table(data)
    if isinstance(data, dict):
        out = {}
        for k, v in data.items():
            if isinstance(v, list) and v and all(isinstance(x, dict) for x in v) and len(v) > MAX_ROWS:
                out[k] = rows_table(v)
                changed = True
            else:
                out[k] = v
        if not changed:
            compact = json.dumps(data, separators=(",", ":"))
            if len(compact) < len(text) * 0.9:
                return compact
            return None
        return json.dumps(out, indent=1, ensure_ascii=False)
    return None


def compress_diff(text):
    lines = text.splitlines()
    out = []
    ctx_run = 0
    lockfile_mode = False
    plus = minus = 0
    for ln in lines:
        if _LOCKFILE_RE.search(ln) and (ln.startswith("+++") or ln.startswith("---") or ln.startswith("diff")):
            lockfile_mode = True
            out.append(ln)
            continue
        if lockfile_mode:
            if ln.startswith("+"):
                plus += 1
            elif ln.startswith("-"):
                minus += 1
            elif ln.startswith("@@") or _DIFF_HEAD_RE.match(ln):
                if plus or minus:
                    out.append(f"[lockfile hunk collapsed: +{plus}/-{minus}]")
                plus = minus = 0
                out.append(ln)
                if not (_DIFF_HEAD_RE.match(ln)):
                    lockfile_mode = False
            continue
        if ln.startswith("@@") or _DIFF_HEAD_RE.match(ln):
            if ctx_run > 6:
                out.append(f"[… {ctx_run} unchanged lines …]")
            ctx_run = 0
            out.append(ln)
        elif ln.startswith(("+", "-")):
            if ctx_run > 6:
                out.append(f"[… {ctx_run} unchanged lines …]")
            ctx_run = 0
            out.append(ln)
        else:
            ctx_run += 1
    if lockfile_mode and (plus or minus):
        out.append(f"[lockfile hunk collapsed: +{plus}/-{minus}]")
    if ctx_run > 6:
        out.append(f"[… {ctx_run} unchanged lines …]")
    return "\n".join(out)


def compress_search(text):
    groups = {}
    order = []
    unmatched = []
    total_hits = 0
    for ln in text.splitlines():
        m = _GREP_RE.match(ln)
        if m:
            path = m.group(1)
            if path not in groups:
                groups[path] = []
                order.append(path)
            groups[path].append((m.group(2), m.group(3)))
            total_hits += 1
        elif ln.strip():
            unmatched.append(ln)
    out = []
    for path in order:
        hits = groups[path]
        shown = hits[:5]
        for lineno, body in shown:
            out.append(f"{path}:{lineno}:{body}")
        if len(hits) > 5:
            out.append(f"[{path}: +{len(hits) - 5} more hits]")
    if len(out) > max(20, total_hits // 2):
        out = []
        for path in order[:15]:
            for lineno, body in groups[path][:3]:
                out.append(f"{path}:{lineno}:{body}")
        rest_files = len(order) - 15
        rest_hits = total_hits - sum(min(3, len(groups[p])) for p in order[:15])
        if rest_files > 0:
            out.append(f"[+{rest_hits} more hits across {rest_files} files · {total_hits} total]")
    if unmatched:
        out.extend(unmatched[:10])
    return "\n".join(out)


def compress_log(text):
    lines = text.splitlines()
    kept = []
    last_line = None
    repeat = 0
    for i, ln in enumerate(lines):
        is_err = bool(_ERROR_RE.search(ln))
        is_stack = bool(_STACK_RE.match(ln))
        is_tail = i >= len(lines) - 5
        if is_err or is_stack or is_tail:
            if ln == last_line:
                repeat += 1
                kept[-1] = f"{ln} [x{repeat + 1}]"
            else:
                if last_line is not None and repeat:
                    pass
                last_line = ln
                repeat = 0
                kept.append(ln)
        elif _NOISE_LOG_RE.match(ln):
            continue
    if len(kept) > 120:
        head = kept[:40]
        tail = kept[-40:]
        mid = len(kept) - 80
        kept = head + [f"[… {mid} matched lines omitted …]"] + tail
    if not kept:
        return "\n".join(lines[-10:])
    return "\n".join(kept)


def compress_code(text):
    lines = text.splitlines()
    out = []
    body_run = 0
    for ln in lines:
        keep = bool(
            _SIG_RE.match(ln)
            or _IMPORT_RE.match(ln)
            or _KEEP_CODE_RE.search(ln)
            or ln.rstrip().endswith(("{", "}", "):", ":", ";"))
            and len(ln.strip()) < 120
        )
        if keep:
            if body_run > 3:
                out.append(f"    … {body_run} lines …")
            body_run = 0
            out.append(ln)
        else:
            body_run += 1
    if body_run > 3:
        out.append(f"    … {body_run} lines …")
    return "\n".join(out)


_TAG_RE = re.compile(r"<[^>]+>")
_SCRIPT_RE = re.compile(r"<(script|style)\b[^>]*>.*?</\1>", re.IGNORECASE | re.DOTALL)


def compress_html(text):
    t = _SCRIPT_RE.sub("", text)
    t = re.sub(r"<br\s*/?>|</p>|</div>|</li>|</h[1-6]>|</tr>", "\n", t, flags=re.IGNORECASE)
    t = _TAG_RE.sub("", t)
    t = html_mod.unescape(t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def compress_generic(text):
    lines = text.splitlines()
    if len(lines) <= 40:
        return None
    return "\n".join(lines[:15] + [f"[… {len(lines) - 30} middle lines omitted …]"] + lines[-15:])


_COMPRESSORS = {
    "json": compress_json,
    "diff": compress_diff,
    "search": compress_search,
    "log": compress_log,
    "code": compress_code,
    "html": compress_html,
}


def compact(text, hint=None):
    if not ENABLED or not text or len(text.encode("utf-8", "replace")) < MIN_BYTES:
        return text, None
    kind = hint if hint in _COMPRESSORS else detect_kind(text)
    compressed = None
    tried = []
    if kind in _COMPRESSORS:
        try:
            compressed = _COMPRESSORS[kind](text)
        except Exception:
            compressed = None
        tried.append(kind)
    if (compressed is None or len(compressed) >= len(text)):
        try:
            g = compress_generic(text)
            if g and len(g) < len(text):
                compressed = g
                kind = "generic"
        except Exception:
            pass
    if compressed is None or len(compressed) >= len(text):
        with _LOCK:
            _STATS["messages_passed"] += 1
        return text, {"kind": kind, "saved_pct": 0}
    orig_chars = len(text)
    new_chars = len(compressed)
    token = _store_original(text, compressed)
    footer = (
        f"\n\n[tokensaver · PARTIAL view · {kind} · {orig_chars}→{new_chars} chars "
        f"({round(100 - 100.0 * new_chars / orig_chars)}% smaller)"
        + (f" · full original: tokensaver.retrieve token={token}" if token else "")
        + "]"
    )
    result = compressed + footer
    tin, tout = est_tokens(text), est_tokens(result)
    with _LOCK:
        _STATS["messages_compressed"] += 1
        _STATS["chars_in"] += orig_chars
        _STATS["chars_out"] += new_chars
        _STATS["tokens_in"] += tin
        _STATS["tokens_out"] += tout
        _bump(kind, orig_chars, new_chars)
    _flush_stats()
    return result, {"kind": kind, "token": token, "saved_pct": round(100 - 100.0 * new_chars / orig_chars, 1)}


def _compact_content(content):
    if isinstance(content, str):
        out, meta = compact(content)
        return out, meta
    if isinstance(content, list):
        changed = False
        metas = []
        parts = []
        for part in content:
            if isinstance(part, dict) and part.get("type") == "text" and isinstance(part.get("text"), str):
                new_text, meta = compact(part["text"])
                parts.append({**part, "text": new_text})
                if meta:
                    metas.append(meta)
                    changed = True
            else:
                parts.append(part)
        return (parts, metas) if changed else (content, None)
    return content, None


def process_chat_payload(payload):
    if not ENABLED or not isinstance(payload, dict):
        return payload, []
    messages = payload.get("messages")
    if not isinstance(messages, list):
        return payload, []
    with _LOCK:
        _STATS["requests_seen"] += 1
    metas = []
    for msg in messages:
        if not isinstance(msg, dict):
            continue
        role = msg.get("role")
        if role not in ("tool", "tool_results"):
            continue
        new_content, meta = _compact_content(msg.get("content"))
        if meta:
            msg["content"] = new_content
            metas.extend(meta if isinstance(meta, list) else [meta])
    return payload, metas


def handle_api(path, query):
    if path.endswith("/tokensaver/stats"):
        return 200, stats()
    if path.endswith("/tokensaver/reset"):
        reset_stats()
        return 200, {"ok": True}
    if path.endswith("/tokensaver/retrieve"):
        token = (query.get("token") or [""])[0]
        val = retrieve(token) if token else None
        if val is None:
            return 404, {"error": "not found"}
        return 200, {"token": token, "content": val}
    return None


if __name__ == "__main__":
    demo_json = json.dumps([
        {"id": i, "name": f"item-{i}", "status": "ok" if i % 7 else "error: bad thing", "size": i * 137}
        for i in range(500)
    ])
    demo_log = "\n".join(
        ([f"2026-08-21 10:{m:02d}:00 GET /api/x 200 12ms" for m in range(30)])
        + [f"2026-08-21 10:31:00 ERROR upstream timeout after 30000ms attempt {i}" for i in range(12)]
        + ["Traceback (most recent call last):"]
        + [f'  File "/app/svc.py", line {i}, in handler' for i in range(20)]
        + ["ConnectionError: upstream refused", "done."]
    )
    demo_diff = "\n".join(
        ["diff --git a/package-lock.json b/package-lock.json", "--- a/package-lock.json", "+++ b/package-lock.json"]
        + [f"+\"resolved\": \"https://registry.npmjs.org/pkg{i}\"" for i in range(50)]
        + ["", "diff --git a/src/app.py b/src/app.py", "--- a/src/app.py", "+++ b/src/app.py", "@@ -10,7 +10,9 @@"]
        + [" context line %d" % i for i in range(20)]
        + ["+def new_feature():", "+    return True"]
        + [" more context %d" % i for i in range(20)]
    )
    for name, blob in (("json", demo_json), ("log", demo_log), ("diff", demo_diff)):
        out, meta = compact(blob)
        print(f"{name}: detected={meta['kind'] if meta else '-'} saved={meta['saved_pct'] if meta else 0}% chars {len(blob)}->{len(out)}")
    print(json.dumps(stats(), indent=2))
