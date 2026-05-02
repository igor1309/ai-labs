import { ChatOpenAI } from "@langchain/openai";
import { ProxyAgent, fetch as undiciFetch } from "undici";

import type { Config } from "./config.js";

export function defaultChatModel(config: Config): ChatOpenAI {
  const proxyFetch = fetchForShellProxy(config.baseURL, process.env);

  return new ChatOpenAI({
    apiKey: config.apiKey,
    model: config.model,
    configuration: {
      baseURL: config.baseURL,
      ...(proxyFetch ? { fetch: proxyFetch } : {}),
    },
  });
}

function fetchForShellProxy(baseURL: string, env: NodeJS.ProcessEnv): typeof fetch | undefined {
  if (isLocalBaseURL(baseURL)) {
    return undefined;
  }

  const proxyUrl = proxyUrlFromEnv(env);

  if (!proxyUrl) {
    return undefined;
  }

  const dispatcher = new ProxyAgent(proxyUrl);

  return async (input, init) => {
    const response = await undiciFetch(input as unknown as Parameters<typeof undiciFetch>[0], {
      ...(init as unknown as Parameters<typeof undiciFetch>[1]),
      dispatcher,
    });

    return response as unknown as Response;
  };
}

function isLocalBaseURL(baseURL: string): boolean {
  const { hostname } = new URL(baseURL);

  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function proxyUrlFromEnv(env: NodeJS.ProcessEnv): string | undefined {
  return env.HTTPS_PROXY
    ?? env.https_proxy
    ?? env.HTTP_PROXY
    ?? env.http_proxy
    ?? env.ALL_PROXY
    ?? env.all_proxy;
}
