import assert from "node:assert/strict";
import test from "node:test";

import { ChatOpenAI } from "@langchain/openai";

import { defaultChatModel } from "../src/model.js";

test("test_default_chat_model_is_pure_constructor", () => {
  const model = defaultChatModel({
    apiKey: "fake",
    baseURL: "https://example.test/v1",
    model: "fake",
    provider: "test",
  });

  assert.equal(model instanceof ChatOpenAI, true);
  assert.equal(chatOpenAIConfiguration(model).baseURL, "https://example.test/v1");
});

test("test_default_chat_model_shouldUseShellProxy_onHttpsProxyConfigured", (t) => {
  const originalProxyEnv = proxyEnv();
  t.after(() => restoreProxyEnv(originalProxyEnv));
  delete process.env.ALL_PROXY;
  delete process.env.HTTP_PROXY;
  process.env.HTTPS_PROXY = "http://proxy.example:3128";

  const model = defaultChatModel({
    apiKey: "fake",
    baseURL: "https://example.test/v1",
    model: "fake",
    provider: "test",
  });

  assert.equal(typeof chatOpenAIConfiguration(model).fetch, "function");
});

test("test_default_chat_model_shouldBypassShellProxy_onLocalNomosBaseURL", (t) => {
  const originalProxyEnv = proxyEnv();
  t.after(() => restoreProxyEnv(originalProxyEnv));
  delete process.env.ALL_PROXY;
  delete process.env.HTTP_PROXY;
  process.env.HTTPS_PROXY = "http://proxy.example:3128";

  const model = defaultChatModel({
    apiKey: "fake",
    baseURL: "http://localhost:8080/v1",
    model: "fake",
    provider: "nomos",
  });

  assert.equal(chatOpenAIConfiguration(model).fetch, undefined);
});

function chatOpenAIConfiguration(model: ChatOpenAI): { baseURL?: string; fetch?: unknown } {
  const lcKwargs = model.lc_kwargs as { configuration?: { baseURL?: string; fetch?: unknown } };

  return lcKwargs.configuration ?? {};
}

type ProxyEnv = {
  ALL_PROXY: string | undefined;
  HTTPS_PROXY: string | undefined;
  HTTP_PROXY: string | undefined;
};

function proxyEnv(): ProxyEnv {
  return {
    ALL_PROXY: process.env.ALL_PROXY,
    HTTPS_PROXY: process.env.HTTPS_PROXY,
    HTTP_PROXY: process.env.HTTP_PROXY,
  };
}

function restoreProxyEnv(env: ProxyEnv): void {
  setOrDeleteEnv("ALL_PROXY", env.ALL_PROXY);
  setOrDeleteEnv("HTTPS_PROXY", env.HTTPS_PROXY);
  setOrDeleteEnv("HTTP_PROXY", env.HTTP_PROXY);
}

function setOrDeleteEnv(name: keyof ProxyEnv, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
