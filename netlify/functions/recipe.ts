/**
 * /api/recipe — freeform recipe → macros (§9).
 *
 * Limits per spec:
 *   - 3 requests/min/IP   (in-memory token bucket; per-instance, best-effort)
 *   - $0.25/day cap       (Netlify Blobs counter keyed by UTC date)
 *
 * The cost cap is approximate: gpt-4o-mini ≈ $0.15/1M input + $0.60/1M output.
 * We bill ~1¢ per call as a conservative shorthand and stop at $0.25.
 */
import { getStore } from "@netlify/blobs";
import { getEstimator, sanityCheck, type EstimatedRecipe } from "./lib/estimator";

const RPM = 3;
const COST_PER_CALL_USD = 0.01;
const DAILY_CAP_USD = 0.25;

const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || b.resetAt < now) {
    buckets.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (b.count >= RPM) return false;
  b.count++;
  return true;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

async function spendBudget(): Promise<boolean> {
  try {
    const store = getStore({ name: "recipe-budget" });
    const key = todayKey();
    const current = Number((await store.get(key)) ?? "0");
    if (current + COST_PER_CALL_USD > DAILY_CAP_USD) return false;
    await store.set(key, String(current + COST_PER_CALL_USD));
    return true;
  } catch {
    // If Blobs is unavailable (local dev without netlify dev), allow the call.
    return true;
  }
}

function clientIp(headers: Headers): string {
  return (
    headers.get("x-nf-client-connection-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const ip = clientIp(req.headers);
  if (!rateLimit(ip)) {
    return json(429, { error: "rate_limit", message: "3 requests per minute. Try again shortly." });
  }
  if (!(await spendBudget())) {
    return json(429, {
      error: "daily_cap",
      message: "Recipe estimator hit the daily cap. Try again tomorrow.",
    });
  }

  let payload: { text?: string };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }
  const text = (payload.text ?? "").trim();
  if (!text) return json(400, { error: "empty_input" });
  if (text.length > 2000) return json(400, { error: "too_long" });

  const estimator = getEstimator();

  let result: EstimatedRecipe;
  try {
    result = await estimator.estimate(text);
  } catch (e) {
    // Spec: retry once with stricter prompt; here we just retry once.
    try {
      result = await estimator.estimate(text + "\nReturn ONLY strict JSON, no prose.");
    } catch (e2) {
      return json(502, {
        error: "llm_unavailable",
        message: e2 instanceof Error ? e2.message : String(e),
      });
    }
  }

  if (result.error === "not_a_recipe") {
    return json(200, result);
  }

  const sanityErr = sanityCheck(result);
  if (sanityErr) {
    return json(422, { error: "sanity_check_failed", message: sanityErr });
  }
  return json(200, result);
}
