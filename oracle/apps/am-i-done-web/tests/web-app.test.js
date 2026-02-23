import assert from "node:assert/strict"
import test from "node:test"

import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  OUTLOOK_ENDPOINT_PATH,
  requestOutlook,
  resolveAppConfig,
  startApp
} from "../src/app.js"

const mockDocument = {
  createElement(tagName) {
    return {
      tagName,
      textContent: ""
    }
  }
}

if (globalThis.document === undefined) {
  globalThis.document = mockDocument
}

test("test_resolveAppConfig_shouldReturnDefaultTimeout_onMissingQueryValue", () => {
  const config = resolveAppConfig(new URL("https://am-i-done-web.pages.dev/"))

  assert.equal(config.requestTimeoutMs, 60000)
})

test("test_defaultRequestTimeout_shouldBe60000_onCurrentConfiguration", () => {
  assert.equal(DEFAULT_REQUEST_TIMEOUT_MS, 60000)
})

test("test_resolveAppConfig_shouldReturnQueryTimeout_onPositiveNumericValue", () => {
  const config = resolveAppConfig(new URL("https://am-i-done-web.pages.dev/?timeoutMs=25"))

  assert.equal(config.requestTimeoutMs, 25)
})

test("test_requestOutlook_shouldCallSameOriginEndpoint_onValidInput", async () => {
  const calls = []
  const fetchSpy = async (url, options) => {
    calls.push({
      options,
      url
    })

    return new Response(JSON.stringify({
      needsClarification: true
    }), {
      headers: {
        "content-type": "application/json"
      },
      status: 200
    })
  }

  await requestOutlook({
    fetchImplementation: fetchSpy,
    profession: "software developer",
    timeoutMs: 100
  })

  assert.equal(calls[0].url, OUTLOOK_ENDPOINT_PATH)
})

test("test_requestOutlook_shouldSendExpectedPayload_onValidInput", async () => {
  const calls = []
  const fetchSpy = async (url, options) => {
    calls.push({
      options,
      url
    })

    return new Response(JSON.stringify({
      needsClarification: true
    }), {
      headers: {
        "content-type": "application/json"
      },
      status: 200
    })
  }

  await withNavigatorLanguage("ru-RU", async () => {
    await requestOutlook({
      fetchImplementation: fetchSpy,
      profession: "software developer",
      timeoutMs: 100
    })
  })

  assert.deepEqual(JSON.parse(calls[0].options.body), {
    locale: "ru-RU",
    profession: "software developer",
    schemaVersion: "2"
  })
})

test("test_requestOutlook_shouldUsePostJsonRequest_onValidInput", async () => {
  const calls = []
  const fetchSpy = async (url, options) => {
    calls.push({
      options,
      url
    })

    return new Response(JSON.stringify({
      needsClarification: true
    }), {
      headers: {
        "content-type": "application/json"
      },
      status: 200
    })
  }

  await requestOutlook({
    fetchImplementation: fetchSpy,
    profession: "software developer",
    timeoutMs: 100
  })

  assert.deepEqual({
    contentType: calls[0].options.headers["content-type"],
    method: calls[0].options.method
  }, {
    contentType: "application/json",
    method: "POST"
  })
})

test("test_requestOutlook_shouldThrowTransportFailure_onNonOkResponse", async () => {
  const fetchSpy = async () => new Response("boom", {
    status: 500
  })

  await assert.rejects(() => requestOutlook({
    fetchImplementation: fetchSpy,
    profession: "software developer",
    timeoutMs: 100
  }), {
    message: "Transport failure"
  })
})

test("test_startApp_shouldHideDynamicSections_onInitialRender", () => {
  const { elements } = makeViewElements()

  startApp({
    elements,
    fetchImplementation: async () => new Response(),
    location: new URL("https://am-i-done-web.pages.dev/")
  })

  assert.deepEqual(readVisibilityState(elements), {
    answerHidden: true,
    clarificationHidden: true,
    loadingHidden: true,
    transportErrorHidden: true
  })
})

test("test_startApp_shouldRenderAnswer_onSuccessfulResponse", async () => {
  const deferredResponse = makeDeferredResponse()
  const { elements, formElement } = makeViewElements()

  startApp({
    elements,
    fetchImplementation: () => deferredResponse.promise,
    location: new URL("https://am-i-done-web.pages.dev/")
  })

  const submitPromise = formElement.submit()

  assert.equal(elements.loadingElement.hidden, false)

  deferredResponse.resolve(new Response(JSON.stringify({
    answer: {
      assumptions: ["No major market disruption."],
      confidence: {
        label: "medium",
        rationale: "Automation rises, but demand remains."
      },
      headline: "Software engineering remains relevant.",
      keyRisks: ["Routine coding tasks are automated."],
      timeHorizon: {
        explanation: "Role changes steadily over the next few years.",
        label: "2-4 years"
      },
      whatToDoNext: ["Focus on systems and product context."]
    },
    needsClarification: false
  }), {
    headers: {
      "content-type": "application/json"
    },
    status: 200
  }))
  await submitPromise

  assert.deepEqual({
    assumptions: readListValues(elements.answerAssumptionsElement),
    clarificationHidden: elements.clarificationElement.hidden,
    confidenceLabel: elements.answerConfidenceLabelElement.textContent,
    headline: elements.answerHeadlineElement.textContent,
    keyRisks: readListValues(elements.answerKeyRisksElement),
    loadingHidden: elements.loadingElement.hidden,
    transportErrorHidden: elements.transportErrorElement.hidden,
    whatToDoNext: readListValues(elements.answerWhatToDoNextElement)
  }, {
    assumptions: ["No major market disruption."],
    clarificationHidden: true,
    confidenceLabel: "medium",
    headline: "Software engineering remains relevant.",
    keyRisks: ["Routine coding tasks are automated."],
    loadingHidden: true,
    transportErrorHidden: true,
    whatToDoNext: ["Focus on systems and product context."]
  })
})

test("test_startApp_shouldRenderClarification_onClarificationResponse", async () => {
  const { elements, formElement } = makeViewElements()

  startApp({
    elements,
    fetchImplementation: async () => new Response(JSON.stringify({
      clarification: {
        message: "Please clarify the profession.",
        suggestions: ["software engineer", "registered nurse"]
      },
      needsClarification: true
    }), {
      headers: {
        "content-type": "application/json"
      },
      status: 200
    }),
    location: new URL("https://am-i-done-web.pages.dev/")
  })

  await formElement.submit()

  assert.deepEqual({
    answerHidden: elements.answerElement.hidden,
    clarificationHidden: elements.clarificationElement.hidden,
    loadingHidden: elements.loadingElement.hidden,
    message: elements.clarificationMessageElement.textContent,
    suggestions: readListValues(elements.clarificationSuggestionsElement),
    transportErrorHidden: elements.transportErrorElement.hidden
  }, {
    answerHidden: true,
    clarificationHidden: false,
    loadingHidden: true,
    message: "Please clarify the profession.",
    suggestions: ["software engineer", "registered nurse"],
    transportErrorHidden: true
  })
})

test("test_startApp_shouldRenderTransportFailure_onRequestError", async () => {
  const { elements, formElement } = makeViewElements()

  startApp({
    elements,
    fetchImplementation: async () => {
      throw new Error("Network down")
    },
    location: new URL("https://am-i-done-web.pages.dev/")
  })

  await formElement.submit()

  assert.deepEqual(readVisibilityState(elements), {
    answerHidden: true,
    clarificationHidden: true,
    loadingHidden: true,
    transportErrorHidden: false
  })
})

function makeViewElements() {
  const formElement = makeFormElement()

  return {
    elements: {
      answerAssumptionsElement: makeListElement(),
      answerConfidenceLabelElement: makeTextElement(),
      answerConfidenceRationaleElement: makeTextElement(),
      answerElement: makeVisibilityElement(),
      answerHeadlineElement: makeTextElement(),
      answerKeyRisksElement: makeListElement(),
      answerTimeHorizonExplanationElement: makeTextElement(),
      answerTimeHorizonLabelElement: makeTextElement(),
      answerWhatToDoNextElement: makeListElement(),
      clarificationElement: makeVisibilityElement(),
      clarificationMessageElement: makeTextElement(),
      clarificationSuggestionsElement: makeListElement(),
      formElement,
      loadingElement: makeVisibilityElement(),
      professionInputElement: {
        value: "software developer"
      },
      transportErrorElement: makeVisibilityElement()
    },
    formElement
  }
}

function makeFormElement() {
  let submitHandler = null

  return {
    addEventListener(eventType, handler) {
      if (eventType === "submit") {
        submitHandler = handler
      }
    },
    async submit() {
      assert.notEqual(submitHandler, null)
      await submitHandler({
        preventDefault() {}
      })
    }
  }
}

function makeDeferredResponse() {
  let resolve = null
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise
  })

  return {
    promise,
    resolve
  }
}

function makeListElement() {
  return {
    children: [],
    replaceChildren(...children) {
      this.children = children
    }
  }
}

function makeTextElement() {
  return {
    textContent: ""
  }
}

function makeVisibilityElement() {
  return {
    hidden: false
  }
}

function readListValues(listElement) {
  return listElement.children.map((childElement) => childElement.textContent)
}

function readVisibilityState(elements) {
  return {
    answerHidden: elements.answerElement.hidden,
    clarificationHidden: elements.clarificationElement.hidden,
    loadingHidden: elements.loadingElement.hidden,
    transportErrorHidden: elements.transportErrorElement.hidden
  }
}

async function withNavigatorLanguage(language, body) {
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
    await body()
  } finally {
    Object.defineProperty(globalThis, "navigator", originalDescriptor)
  }
}
