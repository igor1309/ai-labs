import { makeWorkerFetch } from "../../../packages/worker-api/src/worker-api-assembler.js"

export default {
  fetch(request, env) {
    const workerFetch = makeWorkerFetch(env)
    return workerFetch(request)
  }
}
