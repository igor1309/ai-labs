export function resolveEffectiveLocale({ rawLocale, schemaVersion }) {
  const trimmedLocale = typeof rawLocale === "string" ? rawLocale.trim() : ""

  if (schemaVersion !== "2") {
    return trimmedLocale
  }

  const normalizedLocale = trimmedLocale.replaceAll("_", "-").toLowerCase()

  return normalizedLocale === "ru" || normalizedLocale.startsWith("ru-") ? "ru" : "en"
}
