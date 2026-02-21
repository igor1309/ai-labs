const UPSERT_STATEMENT = `
INSERT INTO profession_counters (canonical_profession, count, updated_at)
VALUES (?, 1, ?)
ON CONFLICT(canonical_profession)
DO UPDATE SET count = profession_counters.count + 1, updated_at = excluded.updated_at
`

export function createPopularityCountersStore({ db, now = () => new Date().toISOString() } = {}) {
  const validatedDatabase = requireDependency(db, "db")
  requireMethodDependency(validatedDatabase, "db", "prepare")

  return {
    async increment(canonicalProfession) {
      const trimmedCanonicalProfession = canonicalProfession?.trim?.() ?? ""

      if (trimmedCanonicalProfession === "") {
        throw new Error("canonicalProfession must not be empty")
      }

      await validatedDatabase.prepare(UPSERT_STATEMENT).bind(trimmedCanonicalProfession, now()).run()
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
