export function createCloudflareKvJsonCacheAdapter({ kv } = {}) {
  return {
    async read(key) {
      const storedValue = await kv.get(key)

      if (storedValue === null) {
        return null
      }

      try {
        return JSON.parse(storedValue)
      } catch {
        return null
      }
    },
    async write(key, value) {
      await kv.put(key, JSON.stringify(value))
    }
  }
}
