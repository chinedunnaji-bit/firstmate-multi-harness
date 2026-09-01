import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  activateProfile,
  addProfile,
  defaultRegistry,
  promoteProfile,
  readRegistry,
  removeProfile,
  retireProfile,
  sanitizedSnapshot,
  setupCommands,
  verifyProfile,
  writeRegistry,
} from "../plugins/account-fleet/account-fleet.mjs";

function withIsolatedEnvironment(callback) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "account-fleet-test."));
  const previous = {
    HOME: process.env.HOME,
    PATH: process.env.PATH,
    FM_ACCOUNT_FLEET_CONFIG: process.env.FM_ACCOUNT_FLEET_CONFIG,
  };
  process.env.HOME = temporary;
  process.env.PATH = `${path.join(temporary, "bin")}:${previous.PATH ?? ""}`;
  process.env.FM_ACCOUNT_FLEET_CONFIG = path.join(temporary, "config", "accounts.json");
  fs.mkdirSync(path.join(temporary, "bin"), { recursive: true });

  try {
    callback(temporary);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function executable(file, body) {
  fs.writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
}

function installReadyFixtures(home, provider, number) {
  const label = `account${number}`;
  const directory = path.join(home, `.${provider}-${label}`);
  const wrapper = path.join(home, ".local", "bin", `${provider}${number}`);
  fs.mkdirSync(directory, { recursive: true });
  fs.mkdirSync(path.dirname(wrapper), { recursive: true });
  executable(wrapper, "exit 0");
}

function installFakeTools(home) {
  const bin = path.join(home, "bin");
  executable(path.join(bin, "codex"), 'printf "%s\\n" "Logged in as private@example.invalid"; exit 0');
  executable(path.join(bin, "claude"), 'printf "%s\\n" \'{"loggedIn":true,"email":"private@example.invalid"}\'; exit 0');
  executable(
    path.join(bin, "herdr"),
    'printf "%s\\n" "codex: current (v8) (/tmp/codex-hook)" "claude: current (v8) (/tmp/claude-hook)"; exit 0',
  );
  executable(
    path.join(bin, "quota-axi"),
    'printf "%s\\n" \'{"providers":[{"state":{"status":"fresh","stale":false},"quotaAmount":99}]}\'; exit 0',
  );
}

test("defaults to one active primary profile per provider", () => {
  withIsolatedEnvironment(() => {
    const registry = readRegistry();
    assert.deepEqual(registry, defaultRegistry());
    assert.equal(fs.existsSync(process.env.FM_ACCOUNT_FLEET_CONFIG), false);
  });
});

test("supports planned, active, promoted, retired, and forgotten lifecycle", () => {
  withIsolatedEnvironment(() => {
    const registry = defaultRegistry();
    addProfile(registry, "codex", "account2");
    assert.equal(registry.providers.codex.profiles[1].state, "planned");

    assert.throws(
      () => activateProfile(registry, "codex", "account2", { ready: false }),
      /not ready/,
    );
    activateProfile(registry, "codex", "account2", { ready: true });
    promoteProfile(registry, "codex", "account2");
    assert.equal(registry.providers.codex.primary, "account2");

    retireProfile(registry, "codex", "account1");
    removeProfile(registry, "codex", "account1");
    assert.deepEqual(registry.providers.codex.profiles, [
      { label: "account2", state: "active" },
    ]);

    writeRegistry(registry);
    assert.deepEqual(readRegistry(), registry);
    assert.equal(fs.statSync(process.env.FM_ACCOUNT_FLEET_CONFIG).mode & 0o777, 0o600);
  });
});

test("does not retire or forget a primary account", () => {
  const registry = defaultRegistry();
  assert.throws(() => retireProfile(registry, "claude", "account1"), /promote another/);
  assert.throws(() => removeProfile(registry, "claude", "account1"), /primary/);
});

test("live verification returns booleans without command output or identity", () => {
  withIsolatedEnvironment((home) => {
    installFakeTools(home);
    installReadyFixtures(home, "codex", 1);
    installReadyFixtures(home, "claude", 1);

    const codex = verifyProfile("codex", "account1");
    const claude = verifyProfile("claude", "account1");
    assert.equal(codex.ready, true);
    assert.equal(claude.ready, true);

    const serialized = JSON.stringify(sanitizedSnapshot(defaultRegistry(), true));
    assert.doesNotMatch(serialized, /private@example\.invalid/);
    assert.doesNotMatch(serialized, /quotaAmount/);
  });
});

test("setup commands keep credentials out of the plugin and preserve generic paths", () => {
  const commands = setupCommands("claude", "account3").join("\n");
  assert.match(commands, /\$HOME\/\.claude-account3/);
  assert.match(commands, /claude3 auth login/);
  assert.match(commands, /--allow-keychain-prompt --no-credential-refresh/);
  assert.match(commands, /gh-axi setup hooks/);
  assert.match(commands, /chrome-devtools-axi setup hooks/);
  assert.match(commands, /lavish-axi setup hooks/);
  assert.doesNotMatch(commands, /Users\//);
  assert.doesNotMatch(commands, /password|bearer|api[_-]?key/i);
});

test("the FirstMate launcher consumes the selected primary profiles", () => {
  withIsolatedEnvironment((home) => {
    const registry = defaultRegistry();
    addProfile(registry, "codex", "account2");
    activateProfile(registry, "codex", "account2", { ready: true });
    promoteProfile(registry, "codex", "account2");
    addProfile(registry, "claude", "account3");
    activateProfile(registry, "claude", "account3", { ready: true });
    promoteProfile(registry, "claude", "account3");
    writeRegistry(registry);

    const firstmateHome = path.join(home, "firstmate");
    fs.mkdirSync(firstmateHome);
    fs.mkdirSync(path.join(home, ".codex-account2"));
    fs.mkdirSync(path.join(home, ".claude-account3"));
    executable(
      path.join(home, "bin", "pi"),
      'printf \'{"codex":"%s","claude":"%s","cwd":"%s","arg":"%s"}\\n\' "$CODEX_HOME" "$CLAUDE_CONFIG_DIR" "$PWD" "$1"',
    );

    const repository = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
    const result = spawnSync(path.join(repository, "scripts", "launch-firstmate.sh"), ["probe"], {
      encoding: "utf8",
      env: {
        ...process.env,
        FM_FIRSTMATE_HOME: firstmateHome,
        FM_ACCOUNT_FLEET_CONFIG: process.env.FM_ACCOUNT_FLEET_CONFIG,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      codex: path.join(home, ".codex-account2"),
      claude: path.join(home, ".claude-account3"),
      cwd: firstmateHome,
      arg: "probe",
    });

    const invalid = structuredClone(registry);
    invalid.providers.codex.profiles.find(
      (profile) => profile.label === invalid.providers.codex.primary,
    ).state = "retired";
    fs.writeFileSync(
      process.env.FM_ACCOUNT_FLEET_CONFIG,
      `${JSON.stringify(invalid, null, 2)}\n`,
    );
    const rejected = spawnSync(path.join(repository, "scripts", "launch-firstmate.sh"), [], {
      encoding: "utf8",
      env: {
        ...process.env,
        FM_FIRSTMATE_HOME: firstmateHome,
        FM_ACCOUNT_FLEET_CONFIG: process.env.FM_ACCOUNT_FLEET_CONFIG,
      },
    });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /invalid Account Fleet registry/);
  });
});
