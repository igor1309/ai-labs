const UPSERT_STATEMENT = `
INSERT INTO raw_input_counters (raw_profession_key, count, updated_at)
VALUES (?, 1, ?)
ON CONFLICT(raw_profession_key)
DO UPDATE SET count = raw_input_counters.count + 1, updated_at = excluded.updated_at
`

export function createRawInputCountersStore({ db, now = () => new Date().toISOString() } = {}) {
  const validatedDatabase = requireDependency(db, "db")
  requireMethodDependency(validatedDatabase, "db", "prepare")

  return {
    async increment(rawProfessionKey) {
      const trimmedRawProfessionKey = rawProfessionKey?.trim?.() ?? ""

      if (trimmedRawProfessionKey === "") {
        throw new Error("rawProfessionKey must not be empty")
      }

      await validatedDatabase.prepare(UPSERT_STATEMENT).bind(trimmedRawProfessionKey, now()).run()
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
