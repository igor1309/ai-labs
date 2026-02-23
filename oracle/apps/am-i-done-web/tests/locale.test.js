import assert from "node:assert/strict"
import test from "node:test"

import * as app from "../src/app.js"

test("test_resolveEffectiveLocale_shouldReturnRu_onRuRu", () => {
  assert.equal(app.resolveEffectiveLocale?.("ru-RU"), "ru")
})

test("test_resolveEffectiveLocale_shouldReturnRu_onRuUaWithUnderscore", () => {
  assert.equal(app.resolveEffectiveLocale?.("ru_UA"), "ru")
})

test("test_resolveEffectiveLocale_shouldReturnRu_onRawRu", () => {
  assert.equal(app.resolveEffectiveLocale?.("ru"), "ru")
})

test("test_resolveEffectiveLocale_shouldReturnEn_onRawEnUs", () => {
  assert.equal(app.resolveEffectiveLocale?.("en-US"), "en")
})

test("test_resolveEffectiveLocale_shouldReturnEn_onRawFrFr", () => {
  assert.equal(app.resolveEffectiveLocale?.("fr-FR"), "en")
})

test("test_resolveEffectiveLocale_shouldReturnEn_onEmptyString", () => {
  assert.equal(app.resolveEffectiveLocale?.(""), "en")
})

test("test_resolveEffectiveLocale_shouldReturnEn_onInvalidRuPrefix", () => {
  assert.equal(app.resolveEffectiveLocale?.("ruua"), "en")
})

test("test_readBrowserLocale_shouldReturnEmptyString_onMissingNavigator", () => {
  withNavigator(undefined, () => {
    assert.equal(app.readBrowserLocale?.(), "")
  })
})

test("test_readBrowserLocale_shouldReturnNavigatorLanguage_onStringLanguage", () => {
  withNavigator({
    language: "ru-RU"
  }, () => {
    assert.equal(app.readBrowserLocale?.(), "ru-RU")
  })
})

function withNavigator(navigatorValue, body) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator")

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    enumerable: true,
    value: navigatorValue,
    writable: true
  })

  try {
    body()
  } finally {
    Object.defineProperty(globalThis, "navigator", originalDescriptor)
  }
}
