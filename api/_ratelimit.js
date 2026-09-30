// Shared rate limiter. Files starting with "_" are not exposed as routes on Vercel.
// Uses Upstash Redis when its env vars exist. If they do not exist (or Redis is down)
// it lets the request through, so the app keeps working but is NOT rate limited.
const limiters = {};

export async function limited(req, name, max, window, key) {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return false;
  try {
    if (!limiters[name]) {
      const { Ratelimit } = await import("@upstash/ratelimit");
      const { Redis } = await import("@upstash/redis");
      limiters[name] = new Ratelimit({
        redis: new Redis({ url, token }),
        limiter: Ratelimit.slidingWindow(max, window),
        prefix: `nexusflow:${name}`,
      });
    }
    const id = key || String(req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
    const { success } = await limiters[name].limit(id);
    return !success;
  } catch (e) {
    console.error("rate limiter error", e);
    return false;
  }
}
