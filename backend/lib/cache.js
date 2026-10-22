// Cache utility with TTL for GadgetVerse

export const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function isCacheValid(cachedAt, ttlMs = DEFAULT_CACHE_TTL_MS, now = Date.now()) {
  if (!cachedAt || typeof cachedAt !== "number") return false;
  return now - cachedAt < ttlMs;
}

export function createCacheEntry(data, now = Date.now()) {
  return {
    timestamp: now,
    data
  };
}

export function readStorageCache(storage, key, ttlMs = DEFAULT_CACHE_TTL_MS, now = Date.now()) {
  try {
    if (!storage) return null;
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.timestamp || !isCacheValid(parsed.timestamp, ttlMs, now)) {
      storage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeStorageCache(storage, key, data, now = Date.now()) {
  try {
    if (!storage) return;
    const entry = createCacheEntry(data, now);
    storage.setItem(key, JSON.stringify(entry));
  } catch {
    // Storage quota exceeded or disabled
  }
}

// Universal browser export
if (typeof window !== "undefined") {
  window.GadgetCache = {
    DEFAULT_CACHE_TTL_MS,
    isCacheValid,
    createCacheEntry,
    readStorageCache,
    writeStorageCache
  };
}
