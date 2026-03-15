// ---------------------------------------------------------------------------
// Simple in-memory rate limiter — 10 requests per user per minute
// ---------------------------------------------------------------------------

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

interface Entry {
  timestamps: number[];
}

const store = new Map<string, Entry>();

export function checkRateLimit(userId: string): {
  allowed: boolean;
  retryAfterMs: number;
} {
  const now = Date.now();
  const entry = store.get(userId) ?? { timestamps: [] };

  // Drop timestamps outside the rolling window
  entry.timestamps = entry.timestamps.filter((t) => now - t < WINDOW_MS);

  if (entry.timestamps.length >= MAX_REQUESTS) {
    const oldest = entry.timestamps[0];
    const retryAfterMs = WINDOW_MS - (now - oldest);
    store.set(userId, entry);
    return { allowed: false, retryAfterMs };
  }

  entry.timestamps.push(now);
  store.set(userId, entry);
  return { allowed: true, retryAfterMs: 0 };
}
