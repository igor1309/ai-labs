export function createCloudflareKvJsonCacheAdapter({ kv } = {}) {
  return {
    async read(key) {
      const value = await kv.get(key)

      if (value === null) {
        return null
      }

      return JSON.parse(value)
    },
    async write(key, value) {
      await kv.put(key, JSON.stringify(value))
    }
  }
}
