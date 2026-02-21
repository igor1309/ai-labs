const UPSERT_STATEMENT = `
INSERT INTO profession_counters (canonical_profession, count, updated_at)
VALUES (?, 1, ?)
ON CONFLICT(canonical_profession)
DO UPDATE SET count = profession_counters.count + 1, updated_at = excluded.updated_at
`

export function createPopularityCountersStore({ db, now = () => new Date().toISOString() } = {}) {
  return {
    async increment(canonicalProfession) {
      const trimmedCanonicalProfession = canonicalProfession?.trim?.() ?? ""

      if (trimmedCanonicalProfession === "") {
        throw new Error("canonicalProfession must not be empty")
      }

      await db.prepare(UPSERT_STATEMENT).bind(trimmedCanonicalProfession, now()).run()
    }
  }
}
