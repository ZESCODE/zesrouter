const FILLER = /\b(just|really|very|actually|basically|literally|kind of|sort of|you know|please note that|it is important to|in order to)\b/gi;
const ARTICLES = /\b(the|a|an|um|uh)\b/gi;
const SYNONYMS: [RegExp, string][] = [
  [/\butilize\b/gi, "use"],
  [/\bapproximately\b/gi, "~"],
  [/\badditional\b/gi, "more"],
  [/\binformation\b/gi, "info"],
  [/\bapplication\b/gi, "app"],
  [/\bfunctionality\b/gi, "features"],
];

function whitespace(s: string) {
  return s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
function rtk(s: string) {
  return whitespace(s.replace(FILLER, " ").replace(/\s{2,}/g, " "));
}
function caveman(s: string) {
  return whitespace(s.replace(ARTICLES, " ").replace(/[.!?]{2,}/g, ".").replace(/\s{2,}/g, " "));
}
function dedupe(s: string) {
  const seen = new Set<string>();
  return s
    .split(/(?<=[.!?\n])/)
    .filter((p) => {
      const k = p.trim().toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .join("");
}
function abbreviate(s: string) {
  return s.replace(/\bfor example\b/gi, "e.g.").replace(/\bthat is\b/gi, "i.e.").replace(/\band so on\b/gi, "etc");
}
function jsonMinify(s: string) {
  try {
    return JSON.stringify(JSON.parse(s));
  } catch {
    return s.replace(/\s+/g, " ");
  }
}
function commentStrip(s: string) {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "").replace(/(^|\s)#.*$/gm, "$1");
}
function synonym(s: string) {
  return SYNONYMS.reduce((acc, [re, to]) => acc.replace(re, to), s);
}
function bulletFold(s: string) {
  return s.replace(/^\s*[-*•]\s+/gm, "• ").replace(/\n• /g, " · ");
}
function systemTrim(s: string) {
  return s.replace(/^(you are|you will|your role is|as an ai)[^\n]*\n?/gim, "").trim();
}

export function compressText(engine: string, text: string, level = 2): { out: string; savedPct: number; inTok: number; outTok: number } {
  let out = text;
  const run = (fn: (s: string) => string, times = 1) => {
    for (let i = 0; i < times; i++) out = fn(out);
  };
  const n = Math.max(1, Math.min(3, level));
  switch (engine) {
    case "rtk":
      run(rtk, n);
      break;
    case "caveman":
      run(caveman);
      run(rtk, n - 1);
      break;
    case "whitespace":
      run(whitespace);
      break;
    case "dedupe":
      run(dedupe);
      run(whitespace);
      break;
    case "abbreviate":
      run(abbreviate);
      run(whitespace);
      break;
    case "json-minify":
      out = jsonMinify(text);
      break;
    case "comment-strip":
      run(commentStrip);
      run(whitespace);
      break;
    case "synonym-short":
      run(synonym);
      run(whitespace);
      break;
    case "bullet-fold":
      run(bulletFold);
      run(whitespace);
      break;
    case "system-trim":
      run(systemTrim);
      run(rtk);
      break;
    case "multiphase":
      run(whitespace);
      run(commentStrip);
      run(dedupe);
      run(synonym);
      run(rtk);
      break;
    case "hybrid":
    default:
      run(systemTrim);
      run(commentStrip);
      run(dedupe);
      run(synonym);
      run(caveman);
      run(rtk, n);
      run(bulletFold);
      run(whitespace);
      break;
  }
  const inTok = Math.ceil(text.length / 4);
  const outTok = Math.ceil(out.length / 4);
  const savedPct = inTok ? Math.max(0, Math.round((1 - outTok / inTok) * 1000) / 10) : 0;
  return { out, savedPct, inTok, outTok };
}
