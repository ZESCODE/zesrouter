export type WireFormat = "openai-chat" | "openai-responses" | "anthropic" | "gemini";

export function detectFormat(raw: string): WireFormat | "unknown" {
  try {
    const j = JSON.parse(raw);
    if (Array.isArray(j.contents) || j.generationConfig) return "gemini";
    if (Array.isArray(j.messages) && j.messages.some((m: { role?: string }) => m.role === "system" || m.role === "assistant" || m.role === "user") && (j.max_tokens !== undefined || j.model)) {
      if (j.system || (typeof j.messages?.[0]?.content === "string" && j.anthropic_version)) return "anthropic";
    }
    if (j.input || j.type === "response") return "openai-responses";
    if (Array.isArray(j.system) || j.anthropic_version || (Array.isArray(j.messages) && j.messages.some((m: { role?: string }) => m.role === "system") && j.max_tokens && !j.temperature === false && "system" in j))
      return "anthropic";
    if (j.system && Array.isArray(j.messages)) return "anthropic";
    if (Array.isArray(j.messages)) return "openai-chat";
    return "unknown";
  } catch {
    return "unknown";
  }
}

function asText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => {
        if (typeof p === "string") return p;
        if (p?.text) return p.text;
        if (p?.type === "text") return p.text ?? "";
        return "";
      })
      .join("");
  }
  return JSON.stringify(content ?? "");
}

export function translate(raw: string, to: WireFormat): { ok: boolean; out: string; from: string } {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(raw);
  } catch (e) {
    return { ok: false, out: String(e), from: "invalid" };
  }
  const from = detectFormat(raw);
  const model = String(j.model ?? "zesrouter");
  let messages: { role: string; content: string }[] = [];
  let system = "";

  if (from === "openai-chat") {
    const msgs = (j.messages as { role: string; content: unknown }[]) || [];
    for (const m of msgs) {
      if (m.role === "system") system += asText(m.content) + "\n";
      else messages.push({ role: m.role, content: asText(m.content) });
    }
  } else if (from === "openai-responses") {
    const input = j.input;
    if (typeof input === "string") messages = [{ role: "user", content: input }];
    else if (Array.isArray(input)) messages = input.map((x: { role?: string; content?: unknown }) => ({ role: x.role ?? "user", content: asText(x.content) }));
  } else if (from === "anthropic") {
    system = asText(j.system);
    messages = ((j.messages as { role: string; content: unknown }[]) || []).map((m) => ({ role: m.role, content: asText(m.content) }));
  } else if (from === "gemini") {
    const contents = (j.contents as { role?: string; parts?: { text?: string }[] }[]) || [];
    messages = contents.map((c) => ({
      role: c.role === "model" ? "assistant" : "user",
      content: (c.parts || []).map((p) => p.text ?? "").join(""),
    }));
    const inst = (j.systemInstruction as { parts?: { text?: string }[] })?.parts;
    if (inst) system = inst.map((p) => p.text ?? "").join("");
  } else {
    messages = [{ role: "user", content: JSON.stringify(j) }];
  }

  let out: unknown;
  if (to === "openai-chat") {
    const msgs = [...(system ? [{ role: "system", content: system.trim() }] : []), ...messages];
    out = { model, messages: msgs, stream: false };
  } else if (to === "openai-responses") {
    out = { model, input: messages.map((m) => ({ role: m.role, content: m.content })) };
  } else if (to === "anthropic") {
    out = { model, system: system.trim() || undefined, max_tokens: 1024, messages: messages.filter((m) => m.role !== "system") };
  } else {
    out = {
      contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      systemInstruction: system.trim() ? { parts: [{ text: system.trim() }] } : undefined,
    };
  }
  return { ok: true, out: JSON.stringify(out, null, 2), from };
}
