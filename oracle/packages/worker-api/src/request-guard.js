export const requestGuard = {
  async validate(input) {
    if (!isObject(input)) {
      return makeInvalidResult(resolveSchemaVersion(input))
    }

    const schemaVersion = resolveSchemaVersion(input)

    if (!isNonEmptyString(input.profession)) {
      return makeInvalidResult(schemaVersion)
    }

    if (!isNonEmptyString(input.locale)) {
      return makeInvalidResult(schemaVersion)
    }

    return {
      isValid: true,
      value: {
        locale: input.locale,
        profession: input.profession,
        schemaVersion
      }
    }
  }
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== ""
}

function makeInvalidResult(schemaVersion) {
  return {
    clarification: {
      message: "Please provide a valid profession and locale.",
      suggestions: []
    },
    isValid: false,
    schemaVersion
  }
}

function resolveSchemaVersion(input) {
  return isNonEmptyString(input?.schemaVersion) ? input.schemaVersion : "1"
}
