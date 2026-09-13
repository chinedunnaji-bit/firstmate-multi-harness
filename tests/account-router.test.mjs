import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  activateProfile,
  addProfile,
  defaultRegistry,
  setLowQuotaPercent,
  setRoutingEnabled,
  writeRegistry,
} from "../plugins/account-fleet/account-fleet.mjs";
import {
  leaseId,
  readState,
  releaseAccount,
  selectAccount,
} from "../scripts/account-router.mjs";

function withIsolatedEnvironment(callback) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "account-router-test."));
  const keys = [
    "HOME",
    "FM_ACCOUNT_FLEET_CONFIG",
    "FM_ACCOUNT_ROUTER_FIXTURES",
    "FM_ACCOUNT_ROUTER_QUOTA_BIN",
    "FM_ACCOUNT_ROUTER_STATE",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.HOME = temporary;
  process.env.FM_ACCOUNT_FLEET_CONFIG = path.join(temporary, "config", "accounts.json");
  process.env.FM_ACCOUNT_ROUTER_FIXTURES = path.join(temporary, "fixtures");
  process.env.FM_ACCOUNT_ROUTER_STATE = path.join(temporary, "state", "router.json");
  fs.mkdirSync(process.env.FM_ACCOUNT_ROUTER_FIXTURES, { recursive: true });

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

function addActive(registry, provider, label) {
  addProfile(registry, provider, label);
  activateProfile(registry, provider, label, { ready: true });
}

function profileDirectory(home, provider, label) {
  return label === "default"
    ? path.join(home, `.${provider}`)
    : path.join(home, `.${provider}-${label}`);
}

function quotaFixture(
  home,
  provider,
  label,
  {
    remaining = 80,
    runway = "through_reset",
    spendPriority = 1,
    state = "fresh",
    stale = false,
    identity = "private@example.invalid",
  } = {},
) {
  fs.mkdirSync(profileDirectory(home, provider, label), { recursive: true });
  const selection = spendPriority === null
    ? { status: "unknown", unmeasurableWindowIds: ["weekly"] }
    : { status: "known", spendPriority };
  const availability = {
    scope: "all_models",
    status: state === "fresh" && stale === false ? "known" : "unknown",
    runway: { status: runway },
    selection,
  };
  if (availability.status === "known") availability.effectivePercentRemaining = remaining;
  const payload = {
    generatedAt: "2026-09-12T12:00:00.000Z",
    schemaVersion: 5,
    providers: [
      {
        provider,
        account: { email: identity },
        state: { status: state, stale },
        quotaSemantics: { status: availability.status, effectiveAvailability: [availability] },
      },
    ],
  };
  fs.writeFileSync(
    path.join(process.env.FM_ACCOUNT_ROUTER_FIXTURES, `${provider}-${label}.json`),
    `${JSON.stringify(payload, null, 2)}\n`,
  );
}

test("selects the healthy primary without changing the harness", () => {
  withIsolatedEnvironment((home) => {
    writeRegistry(defaultRegistry());
    quotaFixture(home, "codex", "account1", { remaining: 60 });

    const result = selectAccount({ provider: "codex", taskId: "task-primary" });
    assert.equal(result.harness, "codex");
    assert.equal(result.profile, "account1");
    assert.equal(result.selector, "CODEX_HOME");
    assert.equal(result.reason, "primary_healthy");
    assert.doesNotMatch(JSON.stringify(result), /private@example\.invalid/);
  });
});

test("selects a same-provider alternate when the primary is exhausted", () => {
  withIsolatedEnvironment((home) => {
    const registry = defaultRegistry();
    addActive(registry, "codex", "account2");
    writeRegistry(registry);
    quotaFixture(home, "codex", "account1", { remaining: 0, runway: "exhausted_now" });
    quotaFixture(home, "codex", "account2", { remaining: 70, spendPriority: 4 });

    const result = selectAccount({ provider: "codex", taskId: "task-rotate" });
    assert.equal(result.harness, "codex");
    assert.equal(result.profile, "account2");
    assert.equal(result.reason, "primary_unavailable_alternate_selected");
  });
});

test("keeps a healthy task lease instead of oscillating back to primary", () => {
  withIsolatedEnvironment((home) => {
    const registry = defaultRegistry();
    addActive(registry, "codex", "account2");
    writeRegistry(registry);
    quotaFixture(home, "codex", "account1", { remaining: 0, runway: "exhausted_now" });
    quotaFixture(home, "codex", "account2", { remaining: 70 });
    assert.equal(
      selectAccount({ provider: "codex", taskId: "task-sticky" }).profile,
      "account2",
    );

    quotaFixture(home, "codex", "account1", { remaining: 95, spendPriority: 10 });
    const second = selectAccount({ provider: "codex", taskId: "task-sticky" });
    assert.equal(second.profile, "account2");
    assert.equal(second.reason, "existing_task_lease");
  });
});

test("ranks multiple ready alternates by spendPriority", () => {
  withIsolatedEnvironment((home) => {
    const registry = defaultRegistry();
    addActive(registry, "claude", "account2");
    addActive(registry, "claude", "account3");
    writeRegistry(registry);
    quotaFixture(home, "claude", "account1", { remaining: 0, runway: "exhausted_now" });
    quotaFixture(home, "claude", "account2", { remaining: 80, spendPriority: -2 });
    quotaFixture(home, "claude", "account3", { remaining: 65, spendPriority: 7 });

    const result = selectAccount({ provider: "claude", taskId: "task-priority" });
    assert.equal(result.harness, "claude");
    assert.equal(result.profile, "account3");
    assert.equal(result.selector, "CLAUDE_CONFIG_DIR");
  });
});

test("fails closed on ties, stale evidence, and exhausted single-account providers", () => {
  withIsolatedEnvironment((home) => {
    const registry = defaultRegistry();
    addActive(registry, "codex", "account2");
    addActive(registry, "codex", "account3");
    writeRegistry(registry);
    quotaFixture(home, "codex", "account1", { remaining: 0, runway: "exhausted_now" });
    quotaFixture(home, "codex", "account2", { remaining: 80, spendPriority: 3 });
    quotaFixture(home, "codex", "account3", { remaining: 70, spendPriority: 3 });
    assert.throws(
      () => selectAccount({ provider: "codex", taskId: "task-tie" }),
      /tied_profiles/,
    );

    quotaFixture(home, "claude", "account1", { state: "stale", stale: true });
    assert.throws(
      () => selectAccount({ provider: "claude", taskId: "task-stale" }),
      /account1:stale/,
    );
  });
});

test("keeps projected exhaustion eligible until the explicit quota floor is crossed", () => {
  withIsolatedEnvironment((home) => {
    writeRegistry(defaultRegistry());
    quotaFixture(home, "codex", "account1", {
      remaining: 50,
      runway: "projected_exhaustion",
    });
    const result = selectAccount({ provider: "codex", taskId: "task-runway" });
    assert.equal(result.profile, "account1");
    assert.equal(result.reason, "primary_healthy");
    assert.equal(result.evidence[0].status, "ready");
    assert.equal(result.evidence[0].runway, "projected_exhaustion");
  });
});

test("never crosses from an exhausted Codex profile into Claude", () => {
  withIsolatedEnvironment((home) => {
    writeRegistry(defaultRegistry());
    quotaFixture(home, "codex", "account1", { remaining: 0, runway: "exhausted_now" });
    quotaFixture(home, "claude", "account1", { remaining: 100, spendPriority: 99 });
    assert.throws(
      () => selectAccount({ provider: "codex", taskId: "task-no-cross" }),
      /codex account routing stopped/,
    );
  });
});

test("supports the optional bare default profile after explicit activation", () => {
  withIsolatedEnvironment((home) => {
    const registry = defaultRegistry();
    addActive(registry, "codex", "default");
    writeRegistry(registry);
    quotaFixture(home, "codex", "account1", { remaining: 0, runway: "exhausted_now" });
    quotaFixture(home, "codex", "default", { remaining: 50 });

    const result = selectAccount({ provider: "codex", taskId: "task-default" });
    assert.equal(result.profile, "default");
    assert.equal(result.directory, path.join(home, ".codex"));
  });
});

test("honors a configured quota floor and supports disabled automatic routing", () => {
  withIsolatedEnvironment((home) => {
    const registry = defaultRegistry();
    addActive(registry, "codex", "account2");
    setLowQuotaPercent(registry, "codex", 25);
    writeRegistry(registry);
    quotaFixture(home, "codex", "account1", { remaining: 25 });
    quotaFixture(home, "codex", "account2", { remaining: 40 });
    assert.equal(
      selectAccount({ provider: "codex", taskId: "task-floor" }).profile,
      "account2",
    );

    setRoutingEnabled(registry, "codex", false);
    writeRegistry(registry);
    const disabled = selectAccount({ provider: "codex", taskId: "task-disabled" });
    assert.equal(disabled.profile, "account1");
    assert.equal(disabled.reason, "routing_disabled_primary");
  });
});

test("defaults to no invented percentage floor", () => {
  withIsolatedEnvironment(() => {
    const registry = defaultRegistry();
    assert.equal(registry.providers.codex.routing.lowQuotaPercent, 0);
    assert.equal(registry.providers.claude.routing.lowQuotaPercent, 0);
  });
});

test("releases task leases without touching account profiles", () => {
  withIsolatedEnvironment((home) => {
    writeRegistry(defaultRegistry());
    quotaFixture(home, "codex", "account1");
    selectAccount({ provider: "codex", taskId: "task-release", scope: "home-a" });
    const key = leaseId("task-release", "home-a");
    assert.equal(readState().leases[key].profile, "account1");
    assert.deepEqual(releaseAccount("task-release", "home-a"), {
      released: true,
      taskId: "task-release",
      leaseId: key,
    });
    assert.equal(readState().leases[key], undefined);
  });
});

test("isolates equal task ids from different FirstMate homes", () => {
  withIsolatedEnvironment((home) => {
    writeRegistry(defaultRegistry());
    quotaFixture(home, "codex", "account1");
    selectAccount({ provider: "codex", taskId: "same-id", scope: "home-a" });
    selectAccount({ provider: "codex", taskId: "same-id", scope: "home-b" });
    assert.notEqual(leaseId("same-id", "home-a"), leaseId("same-id", "home-b"));
    assert.equal(Object.keys(readState().leases).length, 2);
  });
});

test("does not hold the lease lock while probing provider capacity", () => {
  withIsolatedEnvironment((home) => {
    writeRegistry(defaultRegistry());
    fs.mkdirSync(profileDirectory(home, "codex", "account1"), { recursive: true });
    delete process.env.FM_ACCOUNT_ROUTER_FIXTURES;
    const probe = path.join(home, "quota-probe");
    fs.writeFileSync(
      probe,
      `#!/bin/sh
if [ -d "$FM_ACCOUNT_ROUTER_STATE.lock" ]; then exit 23; fi
printf '%s\\n' '{"schemaVersion":5,"providers":[{"provider":"codex","state":{"status":"fresh","stale":false},"quotaSemantics":{"effectiveAvailability":[{"scope":"all_models","status":"known","effectivePercentRemaining":80,"runway":{"status":"through_reset"},"selection":{"spendPriority":1}}]}}]}'
`,
      { mode: 0o755 },
    );
    process.env.FM_ACCOUNT_ROUTER_QUOTA_BIN = probe;

    const result = selectAccount({ provider: "codex", taskId: "task-lock-scope" });
    assert.equal(result.profile, "account1");
  });
});
