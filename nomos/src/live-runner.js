/**
 * LiveRunner — real vendor HTTP calls.
 *
 * Conforms to the Runner protocol defined by chat-completions.js:
 *   execute(request)        → Promise<object>
 *   executeStream(request)  → AsyncIterable<event>
 */

export function createLiveRunner({ baseUrl, timeoutMs, headers = {} }) {
  return {
    async execute(request) {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify({ ...request, stream: false }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!res.ok) {
        const body = await res.text();
        let msg;
        try {
          msg = JSON.parse(body).error?.message;
        } catch {
          // not JSON
        }
        throw new Error(msg || `upstream ${res.status}`);
      }

      return res.json();
    },

    async *executeStream(request) {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify({ ...request, stream: true }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!res.ok) {
        const body = await res.text();
        let msg;
        try {
          msg = JSON.parse(body).error?.message;
        } catch {
          // not JSON
        }
        yield { type: "error", data: { message: msg || `upstream ${res.status}`, code: `${res.status}` } };
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const payload = trimmed.slice(6);
          if (payload === "[DONE]") {
            yield { type: "end" };
            return;
          }
          try {
            yield { type: "chunk", data: JSON.parse(payload) };
          } catch {
            // skip malformed SSE lines
          }
        }
      }

      yield { type: "end" };
    },
  };
}
