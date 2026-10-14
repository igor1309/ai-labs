import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

const script = new URL("../../agister/scripts/slow-packages.sh", import.meta.url).pathname;

function slow(output, budget = "60") {
  return execFileSync("sh", [script, budget], { encoding: "utf8", input: output });
}

test("slowPackages_shouldNameEachPackageOverTheBudget_onGoTestOutput", () => {
  const output = [
    "ok  \texample.com/m/fast\t1.610s",
    "ok  \texample.com/m/slow\t61.250s\tcoverage: 80.1% of statements",
    "FAIL\texample.com/m/hung\t120.004s",
    "?   \texample.com/m/none\t[no test files]",
    "ok  \texample.com/m/cached\t(cached)"
  ].join("\n");

  assert.equal(
    slow(output),
    "slow: example.com/m/slow took 61.250s, over the 60s budget: make its tests cheaper\n" +
      "slow: example.com/m/hung took 120.004s, over the 60s budget: make its tests cheaper\n"
  );
});

test("slowPackages_shouldSayNothing_onPackagesWithinTheBudget", () => {
  assert.equal(slow("ok  \texample.com/m/edge\t60.000s\nok  \texample.com/m/fast\t0.9s\n"), "");
});
