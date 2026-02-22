import { requestGuard } from "../../../../packages/worker-api/src/request-guard.js"
import { createWorkerApiEntrypointRouter, createWorkerFetchHandler } from "../../../../packages/worker-api/src/worker-api.js"

const CLARIFICATION_SUGGESTIONS = ["software engineer", "registered nurse", "electrician"]

export function makeDeterministicWorkerFetch({ delayMs = 0 } = {}) {
  const outlookHandler = createWorkerFetchHandler({
    popularityTracker: {
      async track() {}
    },
    makeProfessionNormalizer() {
      return {
        async normalize({ profession }) {
          await wait(delayMs)

          const normalizedProfession = normalizeProfession(profession)

          if (isAmbiguousProfession(normalizedProfession)) {
            return {
              clarification: {
                message: "Please clarify the profession so I can provide a useful outlook.",
                suggestions: CLARIFICATION_SUGGESTIONS
              },
              needsClarification: true
            }
          }

          return {
            canonicalProfession: resolveCanonicalProfession(normalizedProfession),
            category: "knowledge-work",
            categoryConfidence: 0.9,
            needsClarification: false
          }
        }
      }
    },
    makeProfessionOutlookService() {
      return {
        async getOutlook({ canonicalProfession }) {
          await wait(delayMs)

          return {
            assumptions: ["AI adoption continues at the current pace."],
            confidence: {
              label: "medium",
              rationale: "Deterministic test output for web E2E coverage."
            },
            headline: `${toTitleCase(canonicalProfession)} remains viable with evolving workflows.`,
            keyRisks: ["Routine tasks are increasingly automated."],
            timeHorizon: {
              explanation: "Automation pressure is rising, but role reinvention is ongoing.",
              label: "2-4 years"
            },
            whatToDoNext: ["Deepen domain expertise.", "Build AI-augmented delivery habits."]
          }
        }
      }
    },
    requestGuard,
    requestIdGenerator: () => "request-id",
    telemetry: makeTelemetrySpy()
  })

  return createWorkerApiEntrypointRouter({ outlookHandler })
}

function makeTelemetrySpy() {
  return {
    emitApiRequest() {},
    emitLlmCall() {}
  }
}

function isAmbiguousProfession(profession) {
  return ["help", "idk", "not sure", "unknown"].includes(profession)
}

function normalizeProfession(profession) {
  return profession.trim().replace(/\s+/g, " ").toLowerCase()
}

function resolveCanonicalProfession(profession) {
  if (profession === "software developer") {
    return "software engineer"
  }

  return profession
}

function toTitleCase(value) {
  return value
    .split(" ")
    .filter((part) => part !== "")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ")
}

function wait(delayMs) {
  if (delayMs <= 0) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    setTimeout(resolve, delayMs)
  })
}
