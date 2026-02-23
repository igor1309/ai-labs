import assert from "node:assert/strict"
import test from "node:test"

import { stringsByLocale } from "../src/generated/strings.generated.js"
import { localizeConfidenceLabel } from "../src/app.js"

test("test_localizeConfidenceLabel_shouldReturnEnglishLabel_onMedium", () => {
  assert.equal(localizeConfidenceLabel({
    label: "medium",
    strings: stringsByLocale.en
  }), stringsByLocale.en.confidenceLabels.medium)
})

test("test_localizeConfidenceLabel_shouldReturnRussianLabel_onMedium", () => {
  assert.equal(localizeConfidenceLabel({
    label: "medium",
    strings: stringsByLocale.ru
  }), stringsByLocale.ru.confidenceLabels.medium)
})

