const APP_STATES = {
  FAILED: "failed",
  IDLE: "idle",
  RECEIVED: "received",
  SUBMITTING: "submitting"
}
export const DEFAULT_REQUEST_TIMEOUT_MS = 12000
export const OUTLOOK_ENDPOINT_PATH = "/api/outlook"

if (canBootstrapInBrowser()) {
  startApp({
    elements: resolveViewElements(document),
    fetchImplementation: window.fetch.bind(window),
    location: window.location
  })
}

function canBootstrapInBrowser() {
  return typeof document !== "undefined" && typeof window !== "undefined"
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
  setText(elements.answerConfidenceLabelElement, answer?.confidence?.label ?? "")
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
        locale: "en-US",
        profession,
        schemaVersion: "1"
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
