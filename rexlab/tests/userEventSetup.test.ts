import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

const TESTS = resolve(import.meta.dirname);

// user-event waits on a real timer between the steps of each action
// unless told not to. The tests drive the app through events only, so
// the waits add idle time and nothing else.
it("sets up user-event with no wait between its steps in every test", () => {
  const setups = readdirSync(TESTS, { recursive: true, encoding: "utf8" })
    .filter((file) => /\.tsx?$/.test(file))
    .flatMap((file) => [...readFileSync(join(TESTS, file), "utf8").matchAll(/userEvent\.setup\(([^)]*)\)/g)].map((match) => `${file}: ${match[1]}`));
  expect(setups.length).toBeGreaterThan(0);
  expect(setups.filter((setup) => !setup.endsWith(": { delay: null }"))).toEqual([]);
});
