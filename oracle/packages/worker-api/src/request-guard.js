import { resolveEffectiveLocale } from "./effective-locale.js"
import { backendMessages } from "./generated/localized-resources.generated.js"

export const requestGuard = {
  async validate(input) {
    if (!isObject(input)) {
      return makeInvalidResult({
        rawLocale: "",
        schemaVersion: resolveSchemaVersion(input)
      })
    }

    const schemaVersion = resolveSchemaVersion(input)
    const profession = readProperty(input, "profession")
    const locale = readProperty(input, "locale")

    if (!isNonEmptyString(profession)) {
      return makeInvalidResult({
        rawLocale: locale,
        schemaVersion
      })
    }

    if (!isNonEmptyString(locale)) {
      return makeInvalidResult({
        rawLocale: locale,
        schemaVersion
      })
    }

    const trimmedProfession = profession.trim()
    const trimmedLocale = locale.trim()
    const effectiveLocale = resolveEffectiveLocale({
      rawLocale: trimmedLocale,
      schemaVersion
    })

    return {
      isValid: true,
      value: {
        effectiveLocale,
        locale: trimmedLocale,
        profession: trimmedProfession,
        requestedLocale: trimmedLocale,
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
function makeInvalidResult({ rawLocale, schemaVersion }) {
  const effectiveLocale = resolveEffectiveLocale({ rawLocale, schemaVersion })
  const messageLocale = schemaVersion === "2" ? effectiveLocale : "en"
  const messages = backendMessages[messageLocale] ?? backendMessages.en

  return {
    clarification: {
      message: messages.invalid_profession_or_locale,
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
