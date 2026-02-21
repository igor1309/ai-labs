export function createPopularityTracker({ popularityCountersStore, rawInputCountersStore } = {}) {
  const validatedPopularityCountersStore = requireMethodDependency(
    popularityCountersStore,
    "popularityCountersStore",
    "increment"
  )
  const validatedRawInputCountersStore = requireMethodDependency(
    rawInputCountersStore,
    "rawInputCountersStore",
    "increment"
  )

  return {
    async track(input) {
      const normalizedRawProfession = normalizeWhitespace(input?.rawProfession)
      const needsClarification = input?.normalizerResult?.needsClarification === true

      if (normalizedRawProfession === "") {
        throw new Error("rawProfession must not be empty")
      }

      await validatedRawInputCountersStore.increment(normalizedRawProfession)

      if (needsClarification) {
        return
      }

      const canonicalProfession = normalizeWhitespace(
        input?.normalizerResult?.canonicalProfession
      )

      if (canonicalProfession === "") {
        throw new Error("canonicalProfession must not be empty")
      }

      await validatedPopularityCountersStore.increment(canonicalProfession)
    }
  }
}

function normalizeWhitespace(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : ""
}

function requireDependency(value, name) {
  if (value === undefined || value === null) {
    throw new Error(`Missing required dependency: ${name}`)
  }

  return value
}

function requireMethodDependency(value, name, methodName) {
  const dependency = requireDependency(value, name)

  if (typeof dependency[methodName] !== "function") {
    throw new Error(`Invalid dependency: ${name}.${methodName}`)
  }

  return dependency
}
