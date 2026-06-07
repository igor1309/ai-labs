import assert from "node:assert/strict";
import test from "node:test";
import { runPublicProdRouteSmoke } from "../scripts/smoke-public-prod-routes.mjs";

test("runPublicProdRouteSmoke_shouldAcceptPublicLearnAndAdminGate_onExpectedVersion", async () => {
  const requestedUrls = [];

  const result = await runPublicProdRouteSmoke({
    baseUrl: "https://agonara.example.test/",
    expectedVersion: "0.1.0",
    fetchImpl: async url => {
      requestedUrls.push(url);
      if (url === "https://agonara.example.test/learn") {
        return response(200, "Agonara Learn");
      }
      if (url === "https://agonara.example.test/admin") {
        return response(403, "operator access required");
      }
      if (url === "https://agonara.example.test/operations/health") {
        return response(200, { status: "ok", version: "0.1.0" });
      }
      return response(404, "not found");
    },
  });

  assert.deepEqual(
    {
      requestedUrls,
      result,
    },
    {
      requestedUrls: [
        "https://agonara.example.test/learn",
        "https://agonara.example.test/admin",
        "https://agonara.example.test/operations/health",
      ],
      result: {
        adminStatusCode: 403,
        healthVersion: "0.1.0",
        learnStatusCode: 200,
      },
    },
  );
});

test("runPublicProdRouteSmoke_shouldRejectAdminAppBody_onPublicAdminRoute", async () => {
  await assert.rejects(
    runPublicProdRouteSmoke({
      fetchImpl: async url => {
        if (url.endsWith("/learn")) {
          return response(200, "Agonara Learn");
        }
        if (url.endsWith("/admin")) {
          return response(200, '<main id="admin-app">');
        }
        return response(200, { status: "ok", version: "0.1.0" });
      },
    }),
    /admin_gate_failed/,
  );
});

test("runPublicProdRouteSmoke_shouldReportRouteUrl_onFetchFailure", async () => {
  await assert.rejects(
    runPublicProdRouteSmoke({
      fetchImpl: async () => {
        throw new Error("network down");
      },
    }),
    /fetch_failed:https:\/\/agonara\.enoa\.ai\/learn:network down/,
  );
});

test("runPublicProdRouteSmoke_shouldRejectMalformedHealthBody_onPublicHealthRoute", async () => {
  await assert.rejects(
    runPublicProdRouteSmoke({
      fetchImpl: async url => {
        if (url.endsWith("/learn")) {
          return response(200, "Agonara Learn");
        }
        if (url.endsWith("/admin")) {
          return response(403, "operator access required");
        }
        return response(200, null);
      },
    }),
    /health_route_failed/,
  );
});

function response(status, body) {
  return {
    json: async () => body,
    status,
    text: async () => typeof body === "string" ? body : JSON.stringify(body),
  };
}
