import assert from "node:assert/strict"
import test from "node:test"

import { stringsByLocale } from "../src/generated/strings.generated.js"
import * as app from "../src/app.js"

test("test_applyStrings_shouldApplyEnglishChrome_onEffectiveLocaleEn", () => {
  const document = makeDocumentStub()

  withNavigatorLanguage("en-US", () => {
    app.applyStrings({
      document,
      strings: stringsByLocale.en
    })
  })

  assert.deepEqual(readChromeState(document), {
    clarificationTitle: stringsByLocale.en.sections.clarification,
    confidenceTitle: stringsByLocale.en.sections.confidence,
    documentLang: "en",
    documentTitle: stringsByLocale.en.documentTitle,
    heroEyebrow: stringsByLocale.en.hero.eyebrow,
    heroIntro: stringsByLocale.en.hero.intro,
    heroTitle: stringsByLocale.en.hero.title,
    loading: stringsByLocale.en.states.loading,
    professionLabel: stringsByLocale.en.form.professionLabel,
    professionPlaceholder: stringsByLocale.en.form.professionPlaceholder,
    risksTitle: stringsByLocale.en.sections.risks,
    submitButton: stringsByLocale.en.form.submitButton,
    timeHorizonTitle: stringsByLocale.en.sections.timeHorizon,
    transportError: stringsByLocale.en.states.transportError,
    whatToDoNextTitle: stringsByLocale.en.sections.whatToDoNext,
    assumptionsTitle: stringsByLocale.en.sections.assumptions
  })
})

test("test_applyStrings_shouldApplyRussianChrome_onEffectiveLocaleRu", () => {
  const document = makeDocumentStub()

  withNavigatorLanguage("ru-RU", () => {
    app.applyStrings({
      document,
      strings: stringsByLocale.ru
    })
  })

  assert.deepEqual(readChromeState(document), {
    clarificationTitle: stringsByLocale.ru.sections.clarification,
    confidenceTitle: stringsByLocale.ru.sections.confidence,
    documentLang: "ru",
    documentTitle: stringsByLocale.ru.documentTitle,
    heroEyebrow: stringsByLocale.ru.hero.eyebrow,
    heroIntro: stringsByLocale.ru.hero.intro,
    heroTitle: stringsByLocale.ru.hero.title,
    loading: stringsByLocale.ru.states.loading,
    professionLabel: stringsByLocale.ru.form.professionLabel,
    professionPlaceholder: stringsByLocale.ru.form.professionPlaceholder,
    risksTitle: stringsByLocale.ru.sections.risks,
    submitButton: stringsByLocale.ru.form.submitButton,
    timeHorizonTitle: stringsByLocale.ru.sections.timeHorizon,
    transportError: stringsByLocale.ru.states.transportError,
    whatToDoNextTitle: stringsByLocale.ru.sections.whatToDoNext,
    assumptionsTitle: stringsByLocale.ru.sections.assumptions
  })
})

function makeDocumentStub() {
  const nodes = {
    "[data-testid='assumptions-title']": makeTextElement(),
    "[data-testid='clarification-title']": makeTextElement(),
    "[data-testid='confidence-title']": makeTextElement(),
    "[data-testid='hero-eyebrow']": makeTextElement(),
    "[data-testid='hero-intro']": makeTextElement(),
    "[data-testid='hero-title']": makeTextElement(),
    "[data-testid='loading']": makeTextElement(),
    "[data-testid='profession-input']": makeInputElement(),
    "[data-testid='profession-label']": makeTextElement(),
    "[data-testid='risks-title']": makeTextElement(),
    "[data-testid='submit-button']": makeTextElement(),
    "[data-testid='time-horizon-title']": makeTextElement(),
    "[data-testid='transport-error']": makeTextElement(),
    "[data-testid='what-to-do-next-title']": makeTextElement()
  }

  return {
    documentElement: {
      lang: ""
    },
    querySelector(selector) {
      return nodes[selector] ?? null
    },
    title: ""
  }
}

function makeTextElement() {
  return {
    textContent: ""
  }
}

function makeInputElement() {
  return {
    placeholder: ""
  }
}

function readChromeState(document) {
  return {
    clarificationTitle: document.querySelector("[data-testid='clarification-title']").textContent,
    confidenceTitle: document.querySelector("[data-testid='confidence-title']").textContent,
    documentLang: document.documentElement.lang,
    documentTitle: document.title,
    heroEyebrow: document.querySelector("[data-testid='hero-eyebrow']").textContent,
    heroIntro: document.querySelector("[data-testid='hero-intro']").textContent,
    heroTitle: document.querySelector("[data-testid='hero-title']").textContent,
    loading: document.querySelector("[data-testid='loading']").textContent,
    professionLabel: document.querySelector("[data-testid='profession-label']").textContent,
    professionPlaceholder: document.querySelector("[data-testid='profession-input']").placeholder,
    risksTitle: document.querySelector("[data-testid='risks-title']").textContent,
    submitButton: document.querySelector("[data-testid='submit-button']").textContent,
    timeHorizonTitle: document.querySelector("[data-testid='time-horizon-title']").textContent,
    transportError: document.querySelector("[data-testid='transport-error']").textContent,
    whatToDoNextTitle: document.querySelector("[data-testid='what-to-do-next-title']").textContent,
    assumptionsTitle: document.querySelector("[data-testid='assumptions-title']").textContent
  }
}

function withNavigatorLanguage(language, body) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator")

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    enumerable: true,
    value: {
      language
    },
    writable: true
  })

  try {
    body()
  } finally {
    Object.defineProperty(globalThis, "navigator", originalDescriptor)
  }
}

