import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const install = fileURLToPath(new URL("../../audelin/macos/scripts/install.sh", import.meta.url));

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, { mode: 0o755 });
}

function setup({ running, tmpdir }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "audelin-install-"));
  const macos = path.join(dir, "macos");
  const calls = path.join(dir, "calls");
  write(path.join(macos, "scripts/install.sh"), fs.readFileSync(install, "utf8"));
  write(path.join(macos, "scripts/bundle.sh"),
    `#!/bin/sh\necho "bundle TMPDIR=$TMPDIR" >> "${calls}"\nmkdir -p .build/Audelin.app/Contents\necho new > .build/Audelin.app/Contents/marker\n`);
  const log = (name) => `#!/bin/sh\necho "${name} $*" >> "${calls}"\n`;
  write(path.join(dir, "bin/pgrep"), running
    ? `#!/bin/sh\necho "pgrep $*" >> "${calls}"\n[ -f "${dir}/quit" ] && exit 1\nexit 0\n`
    : `#!/bin/sh\necho "pgrep $*" >> "${calls}"\nexit 1\n`);
  write(path.join(dir, "bin/pkill"), `${log("pkill")}touch "${dir}/quit"\n`);
  write(path.join(dir, "bin/ditto"), `${log("ditto")}cp -R "$1" "$2"\n`);
  write(path.join(dir, "bin/getconf"), `#!/bin/sh\necho "${dir}/usertmp"\n`);
  for (const name of ["plutil", "launchctl", "open", "sleep"]) write(path.join(dir, "bin", name), log(name));
  const apps = path.join(dir, "Applications");
  write(path.join(apps, "Audelin.app/Contents/marker"), "old\n");
  const env = {
    ...process.env,
    PATH: `${path.join(dir, "bin")}:${process.env.PATH}`,
    AUDELIN_INSTALL_DIR: apps,
    AUDELIN_LAUNCH_AGENTS_DIR: path.join(dir, "LaunchAgents"),
    TMPDIR: tmpdir ?? os.tmpdir(),
  };
  const run = (...args) => execFileSync("sh", [path.join(macos, "scripts/install.sh"), ...args], { cwd: dir, encoding: "utf8", env });
  return { dir, apps, calls, run, read: () => fs.readFileSync(calls, "utf8") };
}

test("install replaces the app, writes the login agent and opens the app", () => {
  const s = setup({ running: false });
  const output = s.run();
  const target = path.join(s.apps, "Audelin.app");

  assert.equal(output.trim(), target);
  assert.equal(fs.readFileSync(path.join(target, "Contents/marker"), "utf8"), "new\n");
  const plist = fs.readFileSync(path.join(s.dir, "LaunchAgents/dev.igor1309.audelin.login.plist"), "utf8");
  assert.match(plist, /<string>\/usr\/bin\/open<\/string>/);
  assert.ok(plist.includes(`<string>${target}</string>`));
  assert.match(plist, /<key>RunAtLoad<\/key><true\/>/);
  const calls = s.read();
  assert.doesNotMatch(calls, /pkill/);
  assert.match(calls, /launchctl enable gui\/\d+\/dev\.igor1309\.audelin\.login/);
  assert.ok(calls.trim().endsWith(`open ${target}`));
});

test("install quits a running Audelin before replacing it", () => {
  const s = setup({ running: true });
  s.run();
  const calls = s.read();
  assert.ok(calls.indexOf("pkill -TERM -x Audelin") < calls.indexOf("ditto"));
});

test("install stops when Audelin does not quit", () => {
  const s = setup({ running: true });
  fs.writeFileSync(path.join(s.dir, "bin/pkill"), "#!/bin/sh\n", { mode: 0o755 });
  assert.throws(s.run, /did not quit/);
  assert.equal(fs.readFileSync(path.join(s.apps, "Audelin.app/Contents/marker"), "utf8"), "old\n");
});

test("install builds with the default temp folder when TMPDIR is gone", () => {
  const s = setup({ running: false, tmpdir: "/tmp/multica-task-gone" });
  s.run();
  assert.ok(s.read().includes(`bundle TMPDIR=${s.dir}/usertmp`));
});

test("install keeps a TMPDIR that exists", () => {
  const s = setup({ running: false });
  s.run();
  assert.ok(s.read().includes(`bundle TMPDIR=${os.tmpdir()}`));
});

test("update replaces a running app's bundle without quitting or opening it", () => {
  const s = setup({ running: true });
  const output = s.run("--update");
  const target = path.join(s.apps, "Audelin.app");

  assert.equal(output.trim(), target);
  assert.equal(fs.readFileSync(path.join(target, "Contents/marker"), "utf8"), "new\n");
  assert.deepEqual(fs.readdirSync(s.apps), ["Audelin.app"]);
  const calls = s.read();
  assert.doesNotMatch(calls, /pkill/);
  assert.doesNotMatch(calls, /^open /m);
  assert.ok(fs.existsSync(path.join(s.dir, "LaunchAgents/dev.igor1309.audelin.login.plist")));
});

test("install rejects an unknown option", () => {
  const s = setup({ running: false });
  assert.throws(() => s.run("--bogus"), /usage: install.sh \[--update\]/);
});
