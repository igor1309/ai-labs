export const requestGuard = {
  async validate(input) {
    if (!isObject(input)) {
      return makeInvalidResult(resolveSchemaVersion(input))
    }

    if (!isNonEmptyString(input.profession)) {
      return makeInvalidResult(resolveSchemaVersion(input))
    }

    if (!isNonEmptyString(input.locale)) {
      return makeInvalidResult(resolveSchemaVersion(input))
    }

    return {
      isValid: true,
      value: {
        locale: input.locale,
        profession: input.profession,
        schemaVersion: resolveSchemaVersion(input)
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
