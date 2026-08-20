import type { RequestRecord } from "./types";

export function withinHours(requests: RequestRecord[], hours: number): RequestRecord[] {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return requests.filter((r) => new Date(r.created_at).getTime() >= cutoff);
}

export function withinRange(requests: RequestRecord[], fromMs: number, toMs: number): RequestRecord[] {
  return requests.filter((r) => {
    const t = new Date(r.created_at).getTime();
    return t >= fromMs && t <= toMs;
  });
}

export function costSum(requests: RequestRecord[]): number {
  return requests.reduce((s, r) => s + r.estimated_charge_micro_usd, 0);
}

export function avgLatency(requests: RequestRecord[]): number {
  if (requests.length === 0) return 0;
  return Math.round(requests.reduce((s, r) => s + r.latency_ms, 0) / requests.length);
}

export function errorRate(requests: RequestRecord[]): number {
  if (requests.length === 0) return 0;
  const errs = requests.filter((r) => r.error).length;
  return (errs / requests.length) * 100;
}

export function groupByModel(requests: RequestRecord[]): Map<string, RequestRecord[]> {
  const m = new Map<string, RequestRecord[]>();
  for (const r of requests) {
    const arr = m.get(r.model_id) ?? [];
    arr.push(r);
    m.set(r.model_id, arr);
  }
  return m;
}

export function groupByProvider(requests: RequestRecord[]): Map<string, RequestRecord[]> {
  const m = new Map<string, RequestRecord[]>();
  for (const r of requests) {
    const arr = m.get(r.provider_id) ?? [];
    arr.push(r);
    m.set(r.provider_id, arr);
  }
  return m;
}

export function hourlyBuckets(requests: RequestRecord[], hours: number): number[] {
  const buckets = new Array(hours).fill(0);
  const now = Date.now();
  for (const r of requests) {
    const age = now - new Date(r.created_at).getTime();
    const idx = hours - 1 - Math.floor(age / (60 * 60 * 1000));
    if (idx >= 0 && idx < hours) buckets[idx]++;
  }
  return buckets;
}
