import { makeWorkerFetch } from "./worker-fetch-assembler.js"

export default {
  fetch(request, env, ctx) {
    const workerFetch = makeWorkerFetch(env, {
      waitUntil: typeof ctx?.waitUntil === "function" ? ctx.waitUntil.bind(ctx) : undefined
    })
    return workerFetch(request)
  }
}
