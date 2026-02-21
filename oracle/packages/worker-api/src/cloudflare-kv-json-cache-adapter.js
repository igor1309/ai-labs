export function createCloudflareKvJsonCacheAdapter({ kv } = {}) {
  const validatedKv = requireDependency(kv, "kv")
  requireMethodDependency(validatedKv, "kv", "get")
  requireMethodDependency(validatedKv, "kv", "put")

  return {
    async read(key) {
      const storedValue = await validatedKv.get(key)

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
      await validatedKv.put(key, JSON.stringify(value))
    }
  }
}

function requireDependency(value, name) {
  if (value === undefined || value === null) {
    throw new Error(`Missing required dependency: ${name}`)
  }

  return value
}

function requireMethodDependency(value, name, methodName) {
  if (typeof value[methodName] !== "function") {
    throw new Error(`Invalid dependency: ${name}.${methodName}`)
  }
}
