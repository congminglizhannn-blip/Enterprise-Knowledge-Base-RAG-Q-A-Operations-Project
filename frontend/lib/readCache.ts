// Browser-only, short-lived snapshots. Never persist authenticated data to disk.
export function createReadCache(ttlMs = 5000) {
  let generation = 0;
  const entries = new Map<string, { expires: number; promise: Promise<Response> }>();
  return {
    clear() { generation++; entries.clear(); },
    async read(key: string, load: () => Promise<Response>): Promise<Response> {
      const existing = entries.get(key);
      if (existing && existing.expires > Date.now()) return (await existing.promise).clone();
      const version = generation;
      const entry = { expires: Infinity, promise: Promise.resolve(null as unknown as Response) };
      entry.promise = load().then(response => {
        if (version === generation && entries.get(key) === entry) entry.expires = Date.now() + ttlMs;
        return response;
      }).catch(error => {
        if (entries.get(key) === entry) entries.delete(key);
        throw error;
      });
      entries.set(key, entry);
      // Limit retained Response bodies when many knowledge bases are visited.
      if (entries.size > 100) entries.delete(entries.keys().next().value!);
      return (await entry.promise).clone();
    },
  };
}
