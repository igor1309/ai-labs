const DEFAULT_REQUEST_TIMEOUT_MS = 4000

const formElement = document.querySelector("[data-testid='outlook-form']")
const professionInputElement = document.querySelector("[data-testid='profession-input']")
const loadingElement = document.querySelector("[data-testid='loading']")
const transportErrorElement = document.querySelector("[data-testid='transport-error']")
const clarificationElement = document.querySelector("[data-testid='clarification']")
const clarificationMessageElement = document.querySelector("[data-testid='clarification-message']")
const clarificationSuggestionsElement = document.querySelector("[data-testid='clarification-suggestions']")
const answerElement = document.querySelector("[data-testid='answer']")
const answerHeadlineElement = document.querySelector("[data-testid='answer-headline']")
const answerTimeHorizonLabelElement = document.querySelector("[data-testid='answer-time-horizon-label']")
const answerTimeHorizonExplanationElement = document.querySelector("[data-testid='answer-time-horizon-explanation']")
const answerConfidenceLabelElement = document.querySelector("[data-testid='answer-confidence-label']")
const answerConfidenceRationaleElement = document.querySelector("[data-testid='answer-confidence-rationale']")
const answerKeyRisksElement = document.querySelector("[data-testid='answer-key-risks']")
const answerWhatToDoNextElement = document.querySelector("[data-testid='answer-what-to-do-next']")
const answerAssumptionsElement = document.querySelector("[data-testid='answer-assumptions']")

const appConfig = resolveAppConfig(window.location)

formElement?.addEventListener("submit", async (event) => {
  event.preventDefault()

  const profession = professionInputElement?.value?.trim() ?? ""

  if (profession === "") {
    return
  }

  renderSubmittingState()

  try {
    const response = await requestOutlook({
      profession,
      timeoutMs: appConfig.requestTimeoutMs
    })

    renderReceivedState(response)
  } catch {
    renderTransportFailureState()
  }
})

function resolveAppConfig(currentLocation) {
  const searchParams = new URLSearchParams(currentLocation.search)
  const timeoutMs = Number.parseInt(searchParams.get("timeoutMs") ?? "", 10)

  return {
    requestTimeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : DEFAULT_REQUEST_TIMEOUT_MS
  }
}

function renderSubmittingState() {
  loadingElement.hidden = false
  transportErrorElement.hidden = true
  clarificationElement.hidden = true
  answerElement.hidden = true
}

function renderTransportFailureState() {
  loadingElement.hidden = true
  transportErrorElement.hidden = false
  clarificationElement.hidden = true
  answerElement.hidden = true
}

function renderReceivedState(response) {
  loadingElement.hidden = true
  transportErrorElement.hidden = true

  if (response.needsClarification) {
    renderClarification(response.clarification)
    answerElement.hidden = true
    clarificationElement.hidden = false
    return
  }

  renderAnswer(response.answer)
  clarificationElement.hidden = true
  answerElement.hidden = false
}

function renderClarification(clarification) {
  clarificationMessageElement.textContent = clarification?.message ?? ""
  renderList(clarificationSuggestionsElement, clarification?.suggestions ?? [])
}

function renderAnswer(answer) {
  answerHeadlineElement.textContent = answer?.headline ?? ""
  answerTimeHorizonLabelElement.textContent = answer?.timeHorizon?.label ?? ""
  answerTimeHorizonExplanationElement.textContent = answer?.timeHorizon?.explanation ?? ""
  answerConfidenceLabelElement.textContent = answer?.confidence?.label ?? ""
  answerConfidenceRationaleElement.textContent = answer?.confidence?.rationale ?? ""
  renderList(answerKeyRisksElement, answer?.keyRisks ?? [])
  renderList(answerWhatToDoNextElement, answer?.whatToDoNext ?? [])
  renderList(answerAssumptionsElement, answer?.assumptions ?? [])
}

function renderList(listElement, values) {
  listElement.replaceChildren(
    ...values.map((value) => {
      const itemElement = document.createElement("li")
      itemElement.textContent = value
      return itemElement
    })
  )
}

async function requestOutlook({ profession, timeoutMs }) {
  const abortController = new AbortController()
  const timeoutId = setTimeout(() => {
    abortController.abort()
  }, timeoutMs)

  try {
    const response = await fetch("/api/outlook", {
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
