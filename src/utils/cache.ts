/**
 * Simple in-memory cache with TTL
 */
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class MemoryCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private defaultTTL: number;

  constructor(defaultTTLSeconds = 60) {
    this.defaultTTL = defaultTTLSeconds * 1000;
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlSeconds?: number): void {
    const ttl = (ttlSeconds ?? this.defaultTTL / 1000) * 1000;
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttl,
    });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  deletePattern(pattern: string): void {
    const regex = new RegExp(pattern);
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

// Singleton cache instance (60 second default TTL)
export const cache = new MemoryCache(60);

// Helper for cached async operations
export async function cached<T>(
  key: string,
  fn: () => Promise<T>,
  ttlSeconds?: number
): Promise<T> {
  const cachedValue = cache.get<T>(key);
  if (cachedValue !== null) {
    return cachedValue;
  }

  const result = await fn();
  cache.set(key, result, ttlSeconds);
  return result;
}
