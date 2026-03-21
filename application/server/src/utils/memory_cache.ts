type CacheEntry = { body: string; expiresAt: number };

const store = new Map<string, CacheEntry>();

export function cacheGet(key: string): string | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return null;
  }
  return entry.body;
}

export function cacheSet(key: string, body: string, ttlMs: number): void {
  store.set(key, { body, expiresAt: Date.now() + ttlMs });
}

export function cacheInvalidatePrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
