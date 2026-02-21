export const requestGuard = {
  async validate(input) {
    if (!isObject(input)) {
      return makeInvalidResult(resolveSchemaVersion(input))
    }

    const schemaVersion = resolveSchemaVersion(input)
    const profession = readProperty(input, "profession")
    const locale = readProperty(input, "locale")

    if (!isNonEmptyString(profession)) {
      return makeInvalidResult(schemaVersion)
    }

    if (!isNonEmptyString(locale)) {
      return makeInvalidResult(schemaVersion)
    }

    return {
      isValid: true,
      value: {
        locale,
        profession,
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
  const schemaVersion = readProperty(input, "schemaVersion")

  return isNonEmptyString(schemaVersion) ? schemaVersion : "1"
}

function readProperty(input, key) {
  try {
    return input?.[key]
  } catch {
    return undefined
  }
}
