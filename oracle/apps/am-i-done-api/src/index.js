import { makeWorkerFetch } from "./worker-fetch-assembler.js"

export default {
  fetch(request, env) {
    const workerFetch = makeWorkerFetch(env)
    return workerFetch(request)
  }
}
