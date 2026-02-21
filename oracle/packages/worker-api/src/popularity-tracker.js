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

      try {
        await validatedRawInputCountersStore.increment(normalizedRawProfession)
      } catch (error) {
        throw markCounterWriteFailure(error)
      }

      if (needsClarification) {
        return
      }

      const canonicalProfession = normalizeWhitespace(
        input?.normalizerResult?.canonicalProfession
      )

      if (canonicalProfession === "") {
        throw new Error("canonicalProfession must not be empty")
      }

      try {
        await validatedPopularityCountersStore.increment(canonicalProfession)
      } catch (error) {
        throw markCounterWriteFailure(error)
      }
    }
  }
}

function markCounterWriteFailure(error) {
  if (isTaggableError(error)) {
    if (trySetCounterWriteFailed(error)) {
      return error
    }
  }

  const wrappedError = new Error("Counter write failed")
  wrappedError.counterWriteFailed = true
  wrappedError.cause = error
  return wrappedError
}

function isTaggableError(value) {
  return (typeof value === "object" && value !== null) || typeof value === "function"
}

function trySetCounterWriteFailed(error) {
  try {
    error.counterWriteFailed = true
    return true
  } catch {
    return false
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
