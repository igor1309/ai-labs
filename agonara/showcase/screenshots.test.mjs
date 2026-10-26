import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { createCorpusCommands } from "../src/corpus.js";
import { createCuratorWorkspaceCommands } from "../src/curator-workspace.js";
import { createIdentityCommands } from "../src/identity.js";
import { createProgramCommands } from "../src/program.js";
import { createServer } from "../src/server.js";
import { initializeIdentityStorage, openIdentityDatabase } from "../src/storage.js";
import { createStudentWorkspaceCommands } from "../src/student-workspace.js";
import { capture, createApi, seed } from "./screenshots.mjs";

test("seeding rejects HTTP and application failures with the step and reason", async () => {
  for (const [status, body] of [
    [403, { status: "rejected", reason: "csrf_token_invalid" }],
    [200, { status: "rejected", reason: "participation_required" }],
    [500, { status: "fault", reason: "storage_fault" }],
  ]) {
    const api = createApi("http://showcase.test", async () => Response.json(body, { status }));
    await assert.rejects(api("accept Sample space", "/candidate/acceptance"), error => {
      assert.match(error.message, /accept Sample space: POST \/candidate\/acceptance/);
      assert.ok(error.message.includes(`HTTP ${status}`));
      assert.ok(error.message.includes(body.reason));
      return true;
    });
  }
});

test("a missing UI element names the screenshot and selector", async t => {
  const directory = await mkdtemp(join(tmpdir(), "agonara-showcase-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const page = {
    setDefaultTimeout() {},
    async goto() {},
    locator(selector) {
      return {
        locator(child) {
          return { async fill() { throw new Error(`Missing element: ${selector} ${child}`); } };
        },
      };
    },
  };
  const browser = { async newContext() { return { async newPage() { return page; } }; } };
  await assert.rejects(capture(browser, "http://showcase.test", "program", directory),
    /learn-student-navigation\.png: Missing element: #signin-form input\[name='login'\]/);
});

test("the demo seeds accepted navigation, readable content, a student attempt and coverage gaps through HTTP handlers", async t => {
  const database = openIdentityDatabase();
  t.after(() => database.close());
  initializeIdentityStorage(database);
  const dependencies = { database, generateId: randomUUID, now: () => new Date() };
  const programCommands = createProgramCommands(dependencies);
  const participation = { ...dependencies, getEffectiveParticipation: programCommands.getEffectiveParticipation };
  const corpusCommands = createCorpusCommands(participation);
  const server = createServer({
    identityCommands: createIdentityCommands({ ...dependencies, bootstrapSecret: "showcase-bootstrap-secret" }),
    programCommands, corpusCommands,
    curatorWorkspaceCommands: createCuratorWorkspaceCommands({ ...participation, corpusCommands }),
    studentWorkspaceCommands: createStudentWorkspaceCommands(participation), log() {},
  });
  const api = createApi("http://showcase.test", handlerFetch(server));
  const programId = await seed(api);
  const ada = await api("sign in Ada", "/identity/sessions", {
    body: { login: "ada@example.test", password: "Ada demo password" },
  });
  const sam = await api("sign in Sam", "/identity/sessions", {
    body: { login: "sam@example.test", password: "Sam demo password" },
  });
  const identities = await api("read identities", "/identity/identities", { session: ada, method: "GET" });
  assert.deepEqual(identities.identities.map(identity => identity.displayName).sort(), ["Ada Curator", "Sam Student"]);
  assert.equal(identities.identities.find(identity => identity.displayName === "Ada Curator").isAdmin, true);
  const read = path => api(`read ${path}`, path, { session: sam, method: "GET" });
  const navigation = await api("read navigation", `/programs/${programId}/navigation`, { session: sam, method: "GET" });
  assert.deepEqual(navigation.navigation.topics.map(topic => topic.title).sort(), ["Conditional probability", "Events and outcomes"]);
  const events = navigation.navigation.topics.find(topic => topic.title === "Events and outcomes");
  const { navigationNode: topic } = await read(`/navigation/entities/${events.entityId}`);
  const sampleSpace = topic.relationships.outgoing.find(link => link.toTitle === "Sample space");
  assert.ok(topic.relationships.outgoing.some(link => link.toTitle === "Independent events"));
  const { navigationNode: concept } = await read(`/navigation/entities/${sampleSpace.toEntityId}`);
  assert.match(concept.body, /all possible outcomes/);
  const material = concept.relationships.outgoing.find(link => link.toTitle === "A first look at probability");
  const content = await read(`/materials/${material.toEntityId}/content`);
  assert.match(content.content, /probability of this event is 3\/6, or one half/);
  const conditional = navigation.navigation.topics.find(topic => topic.title === "Conditional probability");
  const { navigationNode: conditionalTopic } = await read(`/navigation/entities/${conditional.entityId}`);
  assert.ok(conditionalTopic.relationships.outgoing.some(link => link.toTitle === "Bayes' rule"));
  const attempts = await api("read attempts", `/programs/${programId}/quick-check-attempts`, { session: sam, method: "GET" });
  assert.equal(attempts.quickCheckAttempts.length, 1);
  assert.equal(attempts.quickCheckAttempts[0].matched, true);
  const { quickCheckDelivery } = await read(`/quick-checks/revisions/${attempts.quickCheckAttempts[0].checkRevisionId}`);
  assert.equal(quickCheckDelivery.options.find(option => option.optionId === attempts.quickCheckAttempts[0].selectedOptionId).text,
    "1/2 — three of the six outcomes");
  const gaps = await api("read gaps", `/programs/${programId}/coverage-gaps`, { session: ada, method: "GET" });
  assert.ok(gaps.report.gaps.some(gap => gap.targetTitle === "Conditional probability"));
});

// The real HTTP handlers and commands run here; the transport stays in process.
function handlerFetch(server) {
  return (url, options) => new Promise((resolve, reject) => {
    const request = Readable.from(options.body ? [Buffer.from(options.body)] : []);
    request.url = new URL(url).pathname;
    request.method = options.method;
    request.headers = options.headers;
    request.socket = { encrypted: false, remoteAddress: "127.0.0.1" };
    const headers = new Headers();
    const response = new EventEmitter();
    response.setHeader = (name, value) => headers.set(name, value);
    response.writeHead = (status, extra) => {
      response.statusCode = status;
      for (const [name, value] of Object.entries(extra)) headers.set(name, value);
    };
    response.end = body => {
      response.emit("finish");
      resolve(new Response(body, { status: response.statusCode, headers }));
    };
    Promise.resolve(server.listeners("request")[0](request, response)).catch(reject);
  });
}
