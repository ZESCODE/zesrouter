"""
arena2api - Arena.ai to OpenAI API Proxy
=========================================

极简设计：Chrome 扩展提供 reCAPTCHA token 和 cookies，
本服务器负责 OpenAI 格式转换和 arena.ai API 调用。

使用方式：
  1. pip install -r requirements.txt
  2. python server.py
  3. 安装 Chrome 扩展，打开 arena.ai
  4. 在 OpenAI 客户端中配置 http://localhost:9090/v1
"""

import asyncio
import base64
import json
import logging
import os
import re
import secrets
import time
import uuid
from typing import Optional

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import StreamingResponse, JSONResponse

# ============================================================
# 日志
# ============================================================
logging.basicConfig(
    level=logging.DEBUG if os.environ.get("DEBUG") else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("arena2api")

# ============================================================
# 配置
# ============================================================
PORT = int(os.environ.get("PORT", "9090"))
API_KEY = os.environ.get("API_KEY", "").strip()
ARENA_BASE = "https://arena.ai"
ARENA_CREATE_EVAL = f"{ARENA_BASE}/nextjs-api/stream/create-evaluation"
ARENA_POST_EVAL = f"{ARENA_BASE}/nextjs-api/stream/post-to-evaluation"  # + /{id}

# reCAPTCHA
RECAPTCHA_V3_SITEKEY = "6LeTGMcsAAAAALuIlkVwIxaAuZA8VledA6d3Nnb0"

# ============================================================
# 静态模型目录（arena.ai 页面已不再暴露 initialModels）
# 数据来源: OmniRoute directModels.ts 2026-07-09 抓取
# ============================================================
CATALOG_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_CATALOG = []  # [{name, display, arenaId, vision, search}]
for _f, _search in (("catalog_chat.json", False), ("catalog_image.json", True)):
    _p = os.path.join(CATALOG_DIR, _f)
    if os.path.exists(_p):
        for _m in json.load(open(_p)):
            STATIC_CATALOG.append({
                "name": _m.get("publicName") or _m.get("catalogId"),
                "display": _m.get("displayName") or _m.get("publicName"),
                "arenaId": _m.get("arenaId"),
                "vision": bool(_m.get("vision")),
                "search": _search,
            })
log.info(f"Static catalog loaded: {len(STATIC_CATALOG)} models")

# ============================================================
# UUIDv7
# ============================================================
def uuid7() -> str:
    ts = int(time.time() * 1000)
    ra = secrets.randbits(12)
    rb = secrets.randbits(62)
    u = ts << 80 | (0x7000 | ra) << 64 | (0x8000000000000000 | rb)
    h = f"{u:032x}"
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:]}"


# ============================================================
# Token / Cookie Store（从扩展接收）
# ============================================================
class Store:
    def __init__(self):
        self.cookies: dict = {}
        self.auth_token: str = ""
        self.cf_clearance: str = ""
        self.v3_tokens: list = []  # [{token, action, ts}]
        self.v2_token: Optional[dict] = None
        self.need_v2: bool = False
        self.last_push: float = 0
        self.models: list = []
        self.text_models: dict = {}  # publicName -> id
        self.image_models: dict = {}
        self.vision_models: list = []
        self.next_actions: dict = {}  # action name -> hash

    @property
    def active(self) -> bool:
        return self.last_push > 0 and (time.time() - self.last_push < 120)

    def user_id(self) -> str:
        return self._decode_jwt().get("sub", "")

    def _decode_jwt(self) -> dict:
        if not self.auth_token:
            return {}
        try:
            raw = self.auth_token
            if raw.startswith("base64-"):
                raw = raw[len("base64-"):]
            outer = json.loads(base64.b64decode(raw + "==").decode())
            jwt = outer.get("access_token", "") or outer.get("id_token", "")
            payload = jwt.split(".")[1]
            payload += "=" * (-len(payload) % 4)
            return json.loads(base64.urlsafe_b64decode(payload))
        except Exception as e:
            return {"_decode_error": str(e)[:200]}

    def push(self, data: dict):
        self.last_push = time.time()
        self.token_error = data.get("token_error", "")
        if data.get("cookies"):
            self.cookies = data["cookies"]
        if data.get("auth_token"):
            self.auth_token = data["auth_token"]
        if data.get("cf_clearance"):
            self.cf_clearance = data["cf_clearance"]
        # V3 tokens
        if data.get("v3_tokens"):
            for t in data["v3_tokens"]:
                tok = t.get("token", "")
                if not tok or len(tok) < 20:
                    continue
                age = t.get("age_ms", 0)
                if age > 120000:
                    continue
                if any(x["token"] == tok for x in self.v3_tokens):
                    continue
                self.v3_tokens.append({
                    "token": tok,
                    "action": t.get("action", "chat_submit"),
                    "ts": time.time() - age / 1000,
                })
            while len(self.v3_tokens) > 10:
                self.v3_tokens.pop(0)
        # V2 token
        if data.get("v2_token"):
            v2 = data["v2_token"]
            if v2.get("token") and v2.get("age_ms", 0) < 120000:
                self.v2_token = {
                    "token": v2["token"],
                    "ts": time.time() - v2.get("age_ms", 0) / 1000,
                }
        # Models
        if data.get("models"):
            self._update_models(data["models"])
        # Next actions
        if data.get("next_actions"):
            self.next_actions.update(data["next_actions"])

    def _update_models(self, models: list):
        self.models = models
        self.text_models = {}
        self.image_models = {}
        self.vision_models = []
        for m in models:
            name = m.get("publicName", "")
            mid = m.get("id", "")
            caps = m.get("capabilities", {})
            out_caps = caps.get("outputCapabilities", [])
            in_caps = caps.get("inputCapabilities", [])
            if "text" in out_caps:
                self.text_models[name] = mid
            if "image" in out_caps:
                self.image_models[name] = mid
            if "image" in in_caps:
                self.vision_models.append(name)

    def pop_v3_token(self) -> Optional[str]:
        now = time.time()
        self.v3_tokens = [t for t in self.v3_tokens if now - t["ts"] < 120]
        if not self.v3_tokens:
            return None
        return self.v3_tokens.pop(0)["token"]

    def pop_v2_token(self) -> Optional[str]:
        if not self.v2_token:
            return None
        if time.time() - self.v2_token["ts"] > 120:
            self.v2_token = None
            return None
        tok = self.v2_token["token"]
        self.v2_token = None
        return tok

    def build_cookie_header(self) -> str:
        parts = []
        auth_name = "arena-auth-prod-v1"
        chunks = {}
        for k, v in self.cookies.items():
            if k == auth_name:
                chunks[0] = v
            elif k.startswith(auth_name + "."):
                idx = k[len(auth_name) + 1:]
                if idx.isdigit():
                    chunks[int(idx)] = v
        merged = ""
        i = 0
        while i in chunks:
            merged += chunks[i]
            i += 1
        sent_names = set()
        if merged:
            parts.append(f"{auth_name}={merged}")
            sent_names.add(auth_name)
            for k in self.cookies:
                if k.startswith(auth_name + "."):
                    sent_names.add(k)
        for k, v in self.cookies.items():
            if k in sent_names:
                continue
            parts.append(f"{k}={v}")
        return "; ".join(parts)

    def status(self) -> dict:
        now = time.time()
        valid_v3 = [t for t in self.v3_tokens if now - t["ts"] < 120]
        return {
            "active": self.active,
            "last_push_ago": round(now - self.last_push, 1) if self.last_push else None,
            "v3_tokens": len(valid_v3),
            "has_v2": bool(self.v2_token and now - self.v2_token["ts"] < 120),
            "has_auth": bool(self.auth_token),
            "has_cf": bool(self.cf_clearance),
            "text_models": len(self.text_models),
            "image_models": len(self.image_models),
            "next_actions": list(self.next_actions.keys()),
            "token_error": getattr(self, "token_error", ""),
            "cookies": list(self.cookies.keys()),
        }


store = Store()

# ============================================================
# FastAPI
# ============================================================
app = FastAPI(title="arena2api", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def verify_api_key(request: Request):
    """Optional API key auth for OpenAI endpoints.

    If API_KEY is set, require: Authorization: Bearer <API_KEY>
    """
    if not API_KEY:
        return

    auth_header = request.headers.get("authorization", "")
    expected = f"Bearer {API_KEY}"
    if auth_header != expected:
        raise HTTPException(status_code=401, detail="Invalid API key")


# ============================================================
# 扩展端点
# ============================================================
@app.post("/v1/extension/push")
async def extension_push(request: Request):
    """接收扩展推送的 token、cookies、models"""
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON")
    store.push(data)
    need = len([t for t in store.v3_tokens if time.time() - t["ts"] < 120]) < 3
    need_v2 = store.need_v2
    store.need_v2 = False
    return {
        "status": "ok",
        "need_tokens": need,
        "need_v2": need_v2,
        "v3_count": len(store.v3_tokens),
    }


@app.get("/v1/extension/status")
async def extension_status():
    return store.status()


@app.get("/debug")
async def debug():
    info = store.status()
    info["auth_token_len"] = len(store.auth_token) if store.auth_token else 0
    info["auth_token_preview"] = (store.auth_token[:80] + "...") if store.auth_token else ""
    info["user_id"] = store.user_id()
    info["jwt_payload"] = store._decode_jwt()
    info["cookie_header"] = store.build_cookie_header()[:200]
    return info


# ============================================================
# OpenAI 兼容端点
# ============================================================
@app.get("/v1/models")
async def list_models(request: Request):
    """列出可用模型"""
    verify_api_key(request)
    data = []
    seen = set()
    for m in STATIC_CATALOG:
        if m["name"] in seen:
            continue
        seen.add(m["name"])
        data.append({
            "id": m["name"],
            "object": "model",
            "created": 0,
            "owned_by": "arena.ai",
        })
    for name in sorted(set(store.text_models) | set(store.image_models)):
        if name in seen:
            continue
        seen.add(name)
        data.append({
            "id": name,
            "object": "model",
            "created": 0,
            "owned_by": "arena.ai",
        })
    if not data:
        # 返回一个占位模型
        data.append({
            "id": "waiting-for-extension",
            "object": "model",
            "created": 0,
            "owned_by": "arena.ai",
        })
    return {"object": "list", "data": data}


def detect_client(request: Request) -> str:
    """检测客户端类型"""
    ua = request.headers.get("user-agent", "").lower()
    if "claude" in ua or "anthropic" in ua:
        return "claude"
    if "gemini" in ua or "google" in ua:
        return "gemini"
    if "codex" in ua:
        return "codex"
    if "opencode" in ua:
        return "opencode"
    # NewAPI/OneAPI 通常使用标准 OpenAI 格式
    return "openai"


@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    """OpenAI 兼容的聊天补全"""
    verify_api_key(request)
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON")

    client_type = detect_client(request)
    model_name = body.get("model", "")
    messages = body.get("messages", [])
    stream = body.get("stream", False)

    if not messages:
        raise HTTPException(400, "messages is required")

    # 检查扩展是否连接
    if not store.active:
        raise HTTPException(503, "Extension not connected. Please open arena.ai in Chrome with the extension installed.")

    # 解析模型（静态目录优先，页面推送兜底）
    model_id = None
    model_entry = None
    for m in STATIC_CATALOG:
        if m["name"] == model_name or m["display"] == model_name:
            model_entry = m
            model_id = m["arenaId"]
            break
    if not model_id:
        model_id = store.text_models.get(model_name) or store.image_models.get(model_name)
    if not model_id:
        # 尝试模糊匹配
        for m in STATIC_CATALOG:
            if model_name.lower() in m["name"].lower() or m["name"].lower() in model_name.lower():
                model_entry = m
                model_id = m["arenaId"]
                model_name = m["name"]
                break
    if not model_id:
        for name, mid in {**store.text_models, **store.image_models}.items():
            if model_name.lower() in name.lower() or name.lower() in model_name.lower():
                model_id = mid
                model_name = name
                break
    if not model_id:
        available = [m["name"] for m in STATIC_CATALOG] + list(store.text_models.keys()) + list(store.image_models.keys())
        raise HTTPException(404, f"Model '{model_name}' not found. Available: {available[:20]}")

    # 构建 prompt（与 OmniRoute formatArenaPrompt 一致）
    def _content_to_text(c):
        if isinstance(c, str):
            return c
        if isinstance(c, list):
            return "\n".join(p.get("text", "") for p in c if p.get("type") == "text")
        return ""

    rendered = []
    for msg in messages:
        text = _content_to_text(msg.get("content", "")).strip()
        if not text:
            continue
        role = msg.get("role", "user")
        label = {"system": "System", "assistant": "Assistant",
                 "developer": "Developer"}.get(role, "User")
        rendered.append(f"{label}: {text}")

    if len(rendered) == 1 and messages[0].get("role") == "user":
        prompt = _content_to_text(messages[0].get("content", "")).strip()
    else:
        prompt = "\n\n".join(rendered)

    # 获取 reCAPTCHA token
    v3_token = store.pop_v3_token()
    v2_token = store.pop_v2_token() if not v3_token else None

    is_image = bool(model_entry and model_entry["vision"]) or model_name in store.image_models
    modality = "image" if is_image else "chat"

    # 构建 arena.ai 请求
    eval_id = uuid7()
    user_msg_id = uuid7()
    model_a_msg_id = uuid7()

    # 从 cookies 或 auth JWT 中提取 userId
    user_id = store.cookies.get("arena-user-id", "")
    if not user_id:
        # 尝试从其他 cookie 中提取
        for key, value in store.cookies.items():
            if "user" in key.lower() and len(value) > 20:
                user_id = value
                break
    if not user_id:
        user_id = store.user_id()

    arena_payload = {
        "id": eval_id,
        "mode": "direct-battle",
        "modelAId": model_id,
        "userMessageId": user_msg_id,
        "modelAMessageId": model_a_msg_id,
        "userMessage": {
            "content": prompt,
            "experimental_attachments": [],
            "metadata": {},
        },
        "modality": modality,
    }

    # 添加 userId（如果有）
    if user_id:
        arena_payload["userId"] = user_id

    if v2_token:
        arena_payload["recaptchaV2Token"] = v2_token
        arena_payload["recaptchaV3Token"] = None
    elif v3_token:
        arena_payload["recaptchaV3Token"] = v3_token
    else:
        log.warning("No reCAPTCHA token available, sending without token")

    # 构建 headers（browser-like，无 Bearer auth —— arena.ai 仅用 cookie 认证）
    headers = {
        "accept": "text/event-stream, application/json, text/plain, */*",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
        "pragma": "no-cache",
        "content-type": "application/json",
        "origin": ARENA_BASE,
        "referer": f"{ARENA_BASE}/?mode=direct",
        "sec-ch-ua": '"Chromium";v="150", "Google Chrome";v="150", "Not-A.Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
        "cookie": store.build_cookie_header(),
    }

    url = ARENA_CREATE_EVAL
    log.info(f"Sending to arena.ai: model={model_name}, eval_id={eval_id}, has_v3={bool(v3_token)}, has_v2={bool(v2_token)}")

    # 与 arena.ai 官方一致：prompt failed / recaptcha failed 时用新 token 重试（escalation）
    # Model not found 时先切换 modality（chat -> webdev，部分模型仅 webdev 可用）
    max_retries = 6
    modality_escalated = False
    v2_requested = False
    last_retryable = None
    for attempt in range(max_retries):
        if attempt > 0:
            v3_token = store.pop_v3_token()
            v2_token = store.pop_v2_token() if not v3_token else None
            if v3_token:
                arena_payload["recaptchaV3Token"] = v3_token
                arena_payload.pop("recaptchaV2Token", None)
            elif v2_token:
                arena_payload["recaptchaV2Token"] = v2_token
                arena_payload["recaptchaV3Token"] = None
            log.info(f"Retry {attempt}: new v3={bool(v3_token)}, v2={bool(v2_token)}")
            await asyncio.sleep(2 * attempt)

        if stream:
            resp = await stream_response(
                url, arena_payload, headers, model_name, eval_id, client_type, retryable=True)
            if isinstance(resp, tuple) and resp[0] == "RETRYABLE":
                last_retryable = resp
                if len(resp) > 3 and resp[3] and not modality_escalated:
                    modality_escalated = True
                    arena_payload["modality"] = "webdev"
                    log.info("Model not found in chat modality, switching to webdev modality")
                    continue
                # prompt failed 持续时请求 V2 token（与官方 app 一致）
                if not v2_requested and store.v2_token is None:
                    store.need_v2 = True
                    v2_requested = True
                    log.info("Prompt failed persisted, requesting V2 token from extension")
                    for _ in range(25):
                        await asyncio.sleep(1)
                        if store.v2_token:
                            break
                    if store.v2_token:
                        v2_token = store.pop_v2_token()
                        if v2_token:
                            arena_payload["recaptchaV2Token"] = v2_token
                            arena_payload["recaptchaV3Token"] = None
                            log.info("Got V2 token, retrying with V2")
                            continue
                continue
            return StreamingResponse(
                resp,
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no",
                },
            )
        else:
            resp = await non_stream_response(
                url, arena_payload, headers, model_name, eval_id, client_type, retryable=True)
            if isinstance(resp, tuple) and resp[0] == "RETRYABLE":
                last_retryable = resp
                if len(resp) > 3 and resp[3] and not modality_escalated:
                    modality_escalated = True
                    arena_payload["modality"] = "webdev"
                    log.info("Model not found in chat modality, switching to webdev modality")
                    continue
                if not v2_requested and store.v2_token is None:
                    store.need_v2 = True
                    v2_requested = True
                    log.info("Prompt failed persisted, requesting V2 token from extension")
                    for _ in range(25):
                        await asyncio.sleep(1)
                        if store.v2_token:
                            break
                    if store.v2_token:
                        v2_token = store.pop_v2_token()
                        if v2_token:
                            arena_payload["recaptchaV2Token"] = v2_token
                            arena_payload["recaptchaV3Token"] = None
                            log.info("Got V2 token, retrying with V2")
                            continue
                continue
            return resp

    if last_retryable:
        raise HTTPException(int(last_retryable[1]), f"Arena API error: {last_retryable[2]}")
    raise HTTPException(429, "Arena API error: retries exhausted")


async def stream_response(url, payload, headers, model_name, eval_id, client_type="openai", retryable=False):
    """流式响应生成器"""
    chat_id = f"chatcmpl-{eval_id}"
    created = int(time.time())

    try:
        async with httpx.AsyncClient(timeout=300, follow_redirects=True) as client:
            async with client.stream("POST", url, json=payload, headers=headers) as resp:
                if resp.status_code != 200:
                    body = await resp.aread()
                    log.error(f"Arena API error: {resp.status_code} {body[:500]}")
                    if retryable and (
                        b"prompt failed" in body or b"recaptcha validation failed" in body
                        or b"Model not found" in body
                    ):
                        yield ("RETRYABLE", str(resp.status_code), body[:200],
                               b"Model not found" in body)
                        return
                    error_chunk = {
                        "id": chat_id,
                        "object": "chat.completion.chunk",
                        "created": created,
                        "model": model_name,
                        "choices": [{
                            "index": 0,
                            "delta": {"content": f"[Error: Arena API returned {resp.status_code}]"},
                            "finish_reason": "stop",
                        }],
                    }
                    yield f"data: {json.dumps(error_chunk)}\n\n"
                    yield "data: [DONE]\n\n"
                    return

                async for line in resp.aiter_lines():
                    if not line.strip():
                        continue

                    content = None
                    reasoning = None
                    finish = None

                    if line.startswith("a0:"):
                        # 文本内容
                        try:
                            content = json.loads(line[3:])
                            if content == "hasArenaError":
                                content = "[Arena Error]"
                                finish = "stop"
                        except json.JSONDecodeError:
                            continue
                    elif line.startswith("ag:"):
                        # 推理内容
                        try:
                            reasoning = json.loads(line[3:])
                        except json.JSONDecodeError:
                            continue
                    elif line.startswith("ad:"):
                        # 完成
                        finish = "stop"
                        try:
                            data = json.loads(line[3:])
                            if data.get("finishReason"):
                                finish = data["finishReason"]
                        except json.JSONDecodeError:
                            pass
                    elif line.startswith("a2:"):
                        # heartbeat 或图片
                        if "heartbeat" in line:
                            continue
                        try:
                            data = json.loads(line[3:])
                            images = [img.get("image") for img in data if img.get("image")]
                            if images:
                                content = "\n".join(f"![image]({url})" for url in images)
                        except json.JSONDecodeError:
                            continue
                    elif line.startswith("a3:"):
                        # 错误
                        try:
                            content = f"[Error: {json.loads(line[3:])}]"
                        except:
                            content = f"[Error: {line[3:]}]"
                        finish = "stop"
                    else:
                        continue

                    if content is not None:
                        chunk = {
                            "id": chat_id,
                            "object": "chat.completion.chunk",
                            "created": created,
                            "model": model_name,
                            "choices": [{
                                "index": 0,
                                "delta": {"content": content},
                                "finish_reason": None,
                            }],
                        }
                        # Claude/Anthropic 格式兼容
                        if client_type == "claude":
                            chunk["type"] = "content_block_delta"
                        yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"

                    if reasoning is not None:
                        # 将推理内容作为普通内容输出（或可以用 reasoning_content）
                        chunk = {
                            "id": chat_id,
                            "object": "chat.completion.chunk",
                            "created": created,
                            "model": model_name,
                            "choices": [{
                                "index": 0,
                                "delta": {"reasoning_content": reasoning},
                                "finish_reason": None,
                            }],
                        }
                        yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"

                    if finish:
                        chunk = {
                            "id": chat_id,
                            "object": "chat.completion.chunk",
                            "created": created,
                            "model": model_name,
                            "choices": [{
                                "index": 0,
                                "delta": {},
                                "finish_reason": finish if finish != "stop" else "stop",
                            }],
                        }
                        yield f"data: {json.dumps(chunk)}\n\n"
                        yield "data: [DONE]\n\n"
                        return

    except Exception as e:
        log.error(f"Stream error: {e}")
        error_chunk = {
            "id": chat_id,
            "object": "chat.completion.chunk",
            "created": created,
            "model": model_name,
            "choices": [{
                "index": 0,
                "delta": {"content": f"[Stream Error: {e}]"},
                "finish_reason": "stop",
            }],
        }
        yield f"data: {json.dumps(error_chunk)}\n\n"
        yield "data: [DONE]\n\n"


async def non_stream_response(url, payload, headers, model_name, eval_id, client_type="openai", retryable=False):
    """非流式响应"""
    content_parts = []
    reasoning_parts = []
    finish_reason = "stop"
    usage = {}

    try:
        async with httpx.AsyncClient(timeout=300, follow_redirects=True) as client:
            async with client.stream("POST", url, json=payload, headers=headers) as resp:
                if resp.status_code != 200:
                    body = await resp.aread()
                    log.error(f"Arena API error: {resp.status_code} {body[:500]}")
                    if retryable and (
                        b"prompt failed" in body or b"recaptcha validation failed" in body
                        or b"Model not found" in body
                    ):
                        return ("RETRYABLE", str(resp.status_code), body[:200],
                                b"Model not found" in body)
                    raise HTTPException(resp.status_code, f"Arena API error: {body[:200]}")

                async for line in resp.aiter_lines():
                    if not line.strip():
                        continue
                    if line.startswith("a0:"):
                        try:
                            text = json.loads(line[3:])
                            if isinstance(text, str) and text != "hasArenaError":
                                content_parts.append(text)
                        except json.JSONDecodeError:
                            pass
                    elif line.startswith("ag:"):
                        try:
                            text = json.loads(line[3:])
                            if isinstance(text, str):
                                reasoning_parts.append(text)
                        except json.JSONDecodeError:
                            pass
                    elif line.startswith("ad:"):
                        try:
                            data = json.loads(line[3:])
                            if data.get("finishReason"):
                                finish_reason = data["finishReason"]
                            if data.get("usage"):
                                usage = data["usage"]
                        except json.JSONDecodeError:
                            pass
                    elif line.startswith("a2:"):
                        if "heartbeat" in line:
                            continue
                        try:
                            data = json.loads(line[3:])
                            images = [img.get("image") for img in data if img.get("image")]
                            for img_url in images:
                                content_parts.append(f"![image]({img_url})")
                        except json.JSONDecodeError:
                            pass
                    elif line.startswith("a3:"):
                        try:
                            content_parts.append(f"[Error: {json.loads(line[3:])}]")
                        except:
                            content_parts.append(f"[Error: {line[3:]}]")

    except HTTPException:
        raise
    except Exception as e:
        log.error(f"Non-stream error: {e}")
        raise HTTPException(500, str(e))

    full_content = "".join(content_parts)
    full_reasoning = "".join(reasoning_parts)

    message = {"role": "assistant", "content": full_content}
    if full_reasoning:
        message["reasoning_content"] = full_reasoning

    response = {
        "id": f"chatcmpl-{eval_id}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model_name,
        "choices": [{
            "index": 0,
            "message": message,
            "finish_reason": finish_reason,
        }],
        "usage": usage or {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
        },
    }

    # Claude 格式兼容
    if client_type == "claude":
        response["type"] = "message"
        response["role"] = "assistant"
        response["content"] = [{"type": "text", "text": full_content}]

    return response


# ============================================================
# 健康检查
# ============================================================
@app.get("/health")
@app.get("/")
async def health():
    return {
        "status": "ok",
        "version": "1.0.0",
        "extension": store.status(),
    }


# ============================================================
# 启动
# ============================================================
if __name__ == "__main__":
    log.info(f"Starting arena2api on port {PORT}")
    log.info(f"OpenAI API: http://localhost:{PORT}/v1")
    log.info("Waiting for Chrome extension to connect...")
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")
