import assert from "node:assert/strict";
import { test } from "node:test";
import { createAgonaraClient } from "../src/agonara-client.js";

const baseUrl = "https://agonara.example";
const login = "student";
const password = "private-password";
const cookie = "session=private-cookie";
const response = (value, status = 200, headers = {}) =>
  new Response(JSON.stringify({ status: "accepted", value }), { status, headers });
const signedIn = (value = cookie) => response({}, 200, { "Set-Cookie": `${value}; Path=/; HttpOnly; Secure` });

function setup(responses) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, ...options });
    assert.ok(responses.length, "unexpected request");
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return { calls, client: createAgonaraClient({ baseUrl, login, password, fetch }) };
}

test("signs in as the student, keeps only cookie pairs, and reads each public route", async () => {
  const programs = { programs: [{ programId: "p", title: "Program" }] };
  const navigation = { navigation: { topics: [], ungroupedConcepts: [], ungroupedMaterials: [] } };
  const entity = { navigationNode: { title: "Entity" } };
  const { calls, client } = setup([signedIn(), response(programs), response(navigation), response(entity)]);
  assert.deepEqual(await client.listPrograms(), programs);
  assert.deepEqual(await client.navigation("p/id"), navigation);
  assert.deepEqual(await client.entity("e/id"), entity);
  assert.deepEqual(calls[0], {
    url: `${baseUrl}/identity/sessions`, method: "POST",
    headers: { "content-type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ login, password }), redirect: "error",
  });
  assert.deepEqual(calls.slice(1).map(({ url, method, headers, body }) => ({ url, method, headers, body })), [
    "/programs", "/programs/p%2Fid/navigation", "/navigation/entities/e%2Fid",
  ].map((route) => ({ url: `${baseUrl}${route}`, method: "GET", headers: { Cookie: cookie }, body: undefined })));
});

for (const [name, route, read] of [
  ["programs", "/programs", (client) => client.listPrograms()],
  ["navigation", "/programs/p/navigation", (client) => client.navigation("p")],
  ["entity", "/navigation/entities/e", (client) => client.entity("e")],
]) {
  test(`${name}: a 401 signs in once again and retries with the new cookie`, async () => {
    const { calls, client } = setup([signedIn(), response({}, 401), signedIn("session=new"), response({ result: "retried" })]);
    assert.deepEqual(await read(client), { result: "retried" });
    assert.deepEqual(calls.map((call) => call.url), [
      `${baseUrl}/identity/sessions`, `${baseUrl}${route}`,
      `${baseUrl}/identity/sessions`, `${baseUrl}${route}`,
    ]);
    assert.equal(calls[3].headers.Cookie, "session=new");
  });

  test(`${name}: a second 401 throws without another sign-in`, async () => {
    const { calls, client } = setup([signedIn(), response({}, 401), signedIn(), response({}, 401)]);
    await assert.rejects(read(client), (error) => {
      assert.ok(error.message.includes(`GET ${route}`));
      assert.match(error.message, /HTTP 401/);
      assert.ok(!error.message.includes(password));
      assert.ok(!error.message.includes(cookie));
      return true;
    });
    assert.equal(calls.length, 4);
  });
}

for (const [name, replies, route, httpStatus] of [
  ["sign-in rejection", [response({ password, cookie }, 403)], "POST /identity/sessions", "403"],
  ["non-accepted sign-in", [new Response(JSON.stringify({ status: "rejected", password, cookie }))], "POST /identity/sessions", "200"],
  ["missing cookie", [response({})], "POST /identity/sessions", "200"],
  ["read rejection", [signedIn(), response({ password, cookie }, 503)], "GET /programs", "503"],
  ["non-accepted read", [signedIn(), new Response(JSON.stringify({ status: "rejected", password, cookie }))], "GET /programs", "200"],
  ["null envelope", [signedIn(), new Response("null")], "GET /programs", "200"],
  ["invalid JSON", [signedIn(), new Response(password)], "GET /programs", "200"],
  ["sign-in transport failure", [new Error(`${password} ${cookie}`)], "POST /identity/sessions", "unavailable"],
  ["read transport failure", [signedIn(), new Error(`${password} ${cookie}`)], "GET /programs", "unavailable"],
  ["re-sign-in failure", [signedIn(), response({}, 401), response({}, 403)], "POST /identity/sessions", "403"],
]) {
  test(`${name} names the route and HTTP status without secrets`, async () => {
    const { client } = setup([...replies]);
    await assert.rejects(client.listPrograms(), (error) => {
      assert.ok(error.message.includes(route));
      assert.ok(error.message.includes(`HTTP ${httpStatus}`));
      assert.ok(!String(error).includes(password));
      assert.ok(!String(error).includes(cookie));
      return true;
    });
  });
}
