import { stringsByLocale } from "./generated/strings.generated.js"

let activeStrings = stringsByLocale.en

const APP_STATES = {
  FAILED: "failed",
  IDLE: "idle",
  RECEIVED: "received",
  SUBMITTING: "submitting"
}
export const DEFAULT_REQUEST_TIMEOUT_MS = 12000
export const OUTLOOK_ENDPOINT_PATH = "/api/outlook"

if (canBootstrapInBrowser()) {
  const rawLocale = readBrowserLocale()
  const effectiveLocale = resolveEffectiveLocale(rawLocale)
  const strings = stringsByLocale[effectiveLocale] ?? stringsByLocale.en

  activeStrings = strings
  applyStrings({
    document,
    strings
  })

  startApp({
    elements: resolveViewElements(document),
    fetchImplementation: window.fetch.bind(window),
    location: window.location
  })
}

function canBootstrapInBrowser() {
  return typeof document !== "undefined" && typeof window !== "undefined"
}

export function readBrowserLocale() {
  const language = globalThis.navigator?.language

  return typeof language === "string" ? language : ""
}

export function resolveEffectiveLocale(rawLocale) {
  const normalized = typeof rawLocale === "string"
    ? rawLocale.trim().toLowerCase().split("_").join("-")
    : ""

  return normalized === "ru" || normalized.startsWith("ru-") ? "ru" : "en"
}

export function applyStrings({ document, strings }) {
  if (document === undefined || document === null || strings === undefined || strings === null) {
    return
  }

  document.title = strings.documentTitle ?? ""

  if (document.documentElement) {
    document.documentElement.lang = resolveEffectiveLocale(readBrowserLocale())
  }

  setText(document.querySelector("[data-testid='hero-eyebrow']"), strings.hero?.eyebrow ?? "")
  setText(document.querySelector("[data-testid='hero-title']"), strings.hero?.title ?? "")
  setText(document.querySelector("[data-testid='hero-intro']"), strings.hero?.intro ?? "")
  setText(document.querySelector("[data-testid='profession-label']"), strings.form?.professionLabel ?? "")
  setInputPlaceholder(document.querySelector("[data-testid='profession-input']"), strings.form?.professionPlaceholder ?? "")
  setText(document.querySelector("[data-testid='submit-button']"), strings.form?.submitButton ?? "")
  setText(document.querySelector("[data-testid='loading']"), strings.states?.loading ?? "")
  setText(document.querySelector("[data-testid='transport-error']"), strings.states?.transportError ?? "")
  setText(document.querySelector("[data-testid='clarification-title']"), strings.sections?.clarification ?? "")
  setText(document.querySelector("[data-testid='time-horizon-title']"), strings.sections?.timeHorizon ?? "")
  setText(document.querySelector("[data-testid='confidence-title']"), strings.sections?.confidence ?? "")
  setText(document.querySelector("[data-testid='risks-title']"), strings.sections?.risks ?? "")
  setText(document.querySelector("[data-testid='what-to-do-next-title']"), strings.sections?.whatToDoNext ?? "")
  setText(document.querySelector("[data-testid='assumptions-title']"), strings.sections?.assumptions ?? "")
}

export function localizeConfidenceLabel({ label, strings }) {
  const rawLabel = typeof label === "string" ? label : ""

  if (rawLabel === "") {
    return ""
  }

  const confidenceLabels = typeof strings?.confidenceLabels === "object" && strings.confidenceLabels !== null
    ? strings.confidenceLabels
    : null

  if (confidenceLabels === null) {
    return rawLabel
  }

  return Object.prototype.hasOwnProperty.call(confidenceLabels, rawLabel)
    ? confidenceLabels[rawLabel]
    : rawLabel
}

export function startApp({ elements, fetchImplementation, location }) {
  if (elements === undefined || elements.formElement === null || elements.professionInputElement === null) {
    return
  }

  const appConfig = resolveAppConfig(location)
  const requestFetcher = fetchImplementation ?? fetch
  let state = createIdleState()

  renderState({
    elements,
    state
  })

  elements.formElement.addEventListener("submit", async (event) => {
    event.preventDefault()

    const profession = elements.professionInputElement.value.trim()

    if (profession === "") {
      return
    }

    state = createSubmittingState()
    renderState({
      elements,
      state
    })

    try {
      const response = await requestOutlook({
        fetchImplementation: requestFetcher,
        profession,
        timeoutMs: appConfig.requestTimeoutMs
      })

      state = createReceivedState(response)
    } catch {
      state = createFailedState()
    }

    renderState({
      elements,
      state
    })
  })
}

export function resolveAppConfig(currentLocation) {
  const searchParams = new URLSearchParams(currentLocation.search)
  const timeoutMs = Number.parseInt(searchParams.get("timeoutMs") ?? "", 10)

  return {
    requestTimeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : DEFAULT_REQUEST_TIMEOUT_MS
  }
}

function createIdleState() {
  return {
    response: null,
    status: APP_STATES.IDLE
  }
}

function createSubmittingState() {
  return {
    response: null,
    status: APP_STATES.SUBMITTING
  }
}

function createFailedState() {
  return {
    response: null,
    status: APP_STATES.FAILED
  }
}

function createReceivedState(response) {
  return {
    response,
    status: APP_STATES.RECEIVED
  }
}

function resolveViewElements(documentNode) {
  return {
    answerAssumptionsElement: documentNode.querySelector("[data-testid='answer-assumptions']"),
    answerConfidenceLabelElement: documentNode.querySelector("[data-testid='answer-confidence-label']"),
    answerConfidenceRationaleElement: documentNode.querySelector("[data-testid='answer-confidence-rationale']"),
    answerElement: documentNode.querySelector("[data-testid='answer']"),
    answerHeadlineElement: documentNode.querySelector("[data-testid='answer-headline']"),
    answerKeyRisksElement: documentNode.querySelector("[data-testid='answer-key-risks']"),
    answerTimeHorizonExplanationElement: documentNode.querySelector("[data-testid='answer-time-horizon-explanation']"),
    answerTimeHorizonLabelElement: documentNode.querySelector("[data-testid='answer-time-horizon-label']"),
    answerWhatToDoNextElement: documentNode.querySelector("[data-testid='answer-what-to-do-next']"),
    clarificationElement: documentNode.querySelector("[data-testid='clarification']"),
    clarificationMessageElement: documentNode.querySelector("[data-testid='clarification-message']"),
    clarificationSuggestionsElement: documentNode.querySelector("[data-testid='clarification-suggestions']"),
    formElement: documentNode.querySelector("[data-testid='outlook-form']"),
    loadingElement: documentNode.querySelector("[data-testid='loading']"),
    professionInputElement: documentNode.querySelector("[data-testid='profession-input']"),
    transportErrorElement: documentNode.querySelector("[data-testid='transport-error']")
  }
}

function renderState({ elements, state }) {
  setHidden(elements.loadingElement, state.status !== APP_STATES.SUBMITTING)
  setHidden(elements.transportErrorElement, state.status !== APP_STATES.FAILED)

  if (state.status === APP_STATES.RECEIVED && state.response?.needsClarification === true) {
    renderClarification(elements, state.response.clarification)
    setHidden(elements.answerElement, true)
    setHidden(elements.clarificationElement, false)
    return
  }

  if (state.status === APP_STATES.RECEIVED) {
    renderAnswer(elements, state.response?.answer)
    setHidden(elements.clarificationElement, true)
    setHidden(elements.answerElement, false)
    return
  }

  setHidden(elements.clarificationElement, true)
  setHidden(elements.answerElement, true)
}

function setHidden(element, hidden) {
  if (element === null) {
    return
  }

  element.hidden = hidden
}

function renderClarification(elements, clarification) {
  setText(elements.clarificationMessageElement, clarification?.message ?? "")
  renderList(elements.clarificationSuggestionsElement, clarification?.suggestions ?? [])
}

function renderAnswer(elements, answer) {
  setText(elements.answerHeadlineElement, answer?.headline ?? "")
  setText(elements.answerTimeHorizonLabelElement, answer?.timeHorizon?.label ?? "")
  setText(elements.answerTimeHorizonExplanationElement, answer?.timeHorizon?.explanation ?? "")
  setText(elements.answerConfidenceLabelElement, localizeConfidenceLabel({
    label: answer?.confidence?.label,
    strings: activeStrings
  }))
  setText(elements.answerConfidenceRationaleElement, answer?.confidence?.rationale ?? "")
  renderList(elements.answerKeyRisksElement, answer?.keyRisks ?? [])
  renderList(elements.answerWhatToDoNextElement, answer?.whatToDoNext ?? [])
  renderList(elements.answerAssumptionsElement, answer?.assumptions ?? [])
}

function setText(element, value) {
  if (element === null) {
    return
  }

  element.textContent = value
}

function setInputPlaceholder(element, value) {
  if (element === null) {
    return
  }

  element.placeholder = value
}

function renderList(listElement, values) {
  if (listElement === null) {
    return
  }

  listElement.replaceChildren(
    ...values.map((value) => {
      const itemElement = document.createElement("li")
      itemElement.textContent = value
      return itemElement
    })
  )
}

export async function requestOutlook({
  fetchImplementation = fetch,
  profession,
  timeoutMs
}) {
  const abortController = new AbortController()
  const timeoutId = setTimeout(() => {
    abortController.abort()
  }, timeoutMs)

  try {
    const response = await fetchImplementation(OUTLOOK_ENDPOINT_PATH, {
      body: JSON.stringify({
        locale: readBrowserLocale(),
        profession,
        schemaVersion: "2"
      }),
      headers: {
        "content-type": "application/json"
      },
      method: "POST",
      signal: abortController.signal
    })

    if (!response.ok) {
      throw new Error("Transport failure")
    }

    return response.json()
  } finally {
    clearTimeout(timeoutId)
  }
}
