#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  orderedActiveProfiles,
  profilePaths,
  readRegistry,
} from "../plugins/account-fleet/account-fleet.mjs";

const STATE_SCHEMA = "firstmate.account-router-state.v1";
const RESULT_SCHEMA = "firstmate.account-router-selection.v1";
const PROVIDERS = ["codex", "claude"];
const TASK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const PROFILE_PATTERN = /^(default|account[1-9][0-9]*)$/;
const LOCK_WAIT_MS = 5_000;
const LOCK_STALE_MS = 30_000;

function statePath() {
  return path.resolve(
    process.env.FM_ACCOUNT_ROUTER_STATE ||
      path.join(os.homedir(), ".local", "state", "firstmate-account-router", "state.json"),
  );
}

function defaultState() {
  return { schema: STATE_SCHEMA, leases: {} };
}

function validateState(state) {
  if (!state || state.schema !== STATE_SCHEMA || !state.leases || typeof state.leases !== "object") {
    throw new Error(`router state must use schema ${STATE_SCHEMA}`);
  }
  for (const [leaseId, lease] of Object.entries(state.leases)) {
    if (!/^(?:[a-f0-9]{16}:)?[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(leaseId)) {
      throw new Error("router state contains an invalid lease id");
    }
    if (
      !lease ||
      !PROVIDERS.includes(lease.provider) ||
      !PROFILE_PATTERN.test(lease.profile) ||
      (lease.taskId !== undefined && !TASK_ID_PATTERN.test(lease.taskId))
    ) {
      throw new Error(`router state contains an invalid lease for ${leaseId}`);
    }
  }
  return state;
}

function readState() {
  const file = statePath();
  if (!fs.existsSync(file)) return defaultState();
  try {
    return validateState(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`could not parse router state: ${file}`);
    throw error;
  }
}

function writeState(state) {
  validateState(state);
  const file = statePath();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.renameSync(temporary, file);
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // The atomic write already requested 0600.
  }
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function withStateLock(callback) {
  const file = statePath();
  const lock = `${file}.lock`;
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + LOCK_WAIT_MS;
  while (true) {
    try {
      fs.mkdirSync(lock, { mode: 0o700 });
      break;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      try {
        const age = Date.now() - fs.statSync(lock).mtimeMs;
        if (age > LOCK_STALE_MS) {
          fs.rmdirSync(lock);
          continue;
        }
      } catch (inspectionError) {
        if (inspectionError?.code !== "ENOENT") throw inspectionError;
        continue;
      }
      if (Date.now() >= deadline) throw new Error("timed out waiting for account-router state lock");
      sleep(50);
    }
  }
  try {
    return callback();
  } finally {
    try {
      fs.rmdirSync(lock);
    } catch {
      // A missing lock during cleanup does not invalidate the completed write.
    }
  }
}

function selectorEnvironment(provider, directory) {
  return provider === "codex"
    ? { CODEX_HOME: directory }
    : { CLAUDE_CONFIG_DIR: directory };
}

function leaseId(taskId, scope = "default") {
  if (!TASK_ID_PATTERN.test(taskId)) throw new Error("task id contains unsupported characters");
  if (typeof scope !== "string" || scope.length === 0) throw new Error("scope must not be empty");
  const digest = crypto.createHash("sha256").update(scope).digest("hex").slice(0, 16);
  return `${digest}:${taskId}`;
}

function quotaFixturePath(provider, profile) {
  const directory = process.env.FM_ACCOUNT_ROUTER_FIXTURES;
  return directory ? path.join(directory, `${provider}-${profile}.json`) : null;
}

function quotaPayload(provider, profile, directory) {
  const fixture = quotaFixturePath(provider, profile);
  if (fixture) {
    try {
      return { payload: JSON.parse(fs.readFileSync(fixture, "utf8")), error: null };
    } catch {
      return { payload: null, error: "fixture_unavailable" };
    }
  }

  const quotaBin = process.env.FM_ACCOUNT_ROUTER_QUOTA_BIN || "quota-axi";
  const result = spawnSync(
    quotaBin,
    ["--provider", provider, "--json", "--no-credential-refresh"],
    {
      encoding: "utf8",
      env: { ...process.env, ...selectorEnvironment(provider, directory) },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 20_000,
      maxBuffer: 1024 * 1024,
    },
  );
  if (result.status !== 0) return { payload: null, error: "quota_probe_failed" };
  try {
    return { payload: JSON.parse(result.stdout), error: null };
  } catch {
    return { payload: null, error: "quota_response_invalid" };
  }
}

function directoryExists(directory) {
  try {
    return fs.statSync(directory).isDirectory();
  } catch {
    return false;
  }
}

function selectionPriority(availability) {
  const value = availability?.selection?.spendPriority;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function evaluateProfile(provider, profile, thresholdPercent) {
  const paths = profilePaths(provider, profile.label);
  const base = {
    profile: profile.label,
    status: "unknown",
    effectivePercentRemaining: null,
    runway: "unknown",
    spendPriority: null,
  };
  if (!directoryExists(paths.directory)) {
    return { ...base, status: "missing_directory" };
  }

  const quota = quotaPayload(provider, profile.label, paths.directory);
  if (!quota.payload) return { ...base, status: quota.error };
  if (quota.payload.schemaVersion !== 5 || !Array.isArray(quota.payload.providers)) {
    return { ...base, status: "quota_schema_unsupported" };
  }
  const report = quota.payload.providers.find((candidate) => candidate.provider === provider);
  if (!report) return { ...base, status: "provider_missing" };
  if (report.state?.status !== "fresh" || report.state?.stale !== false) {
    return { ...base, status: report.state?.status || "stale" };
  }
  const availability = report.quotaSemantics?.effectiveAvailability;
  if (!Array.isArray(availability)) return { ...base, status: "quota_unknown" };
  const scope = availability.find((candidate) => candidate.scope === "all_models") ||
    availability.find((candidate) => candidate.scope === "all_products");
  if (!scope || scope.status !== "known") return { ...base, status: "quota_unknown" };
  const remaining = scope.effectivePercentRemaining;
  if (typeof remaining !== "number" || !Number.isFinite(remaining)) {
    return { ...base, status: "quota_unknown" };
  }
  const runway = scope.runway?.status || "unknown";
  const priority = selectionPriority(scope);
  const evidence = {
    ...base,
    effectivePercentRemaining: remaining,
    runway,
    spendPriority: priority,
  };
  if (runway === "exhausted_now" || remaining <= 0) return { ...evidence, status: "exhausted" };
  if (remaining <= thresholdPercent) return { ...evidence, status: "low" };
  if (runway === "unknown") return { ...evidence, status: "runway_unknown" };
  // Projected exhaustion is advisory: it says the current cycle-average burn
  // would reach zero before reset, not that the profile is unavailable now.
  // Rotation is owned by actual exhaustion or the captain's explicit floor.
  if (runway !== "through_reset" && runway !== "projected_exhaustion") {
    return { ...evidence, status: "runway_unsupported" };
  }
  return { ...evidence, status: "ready" };
}

function pickAlternate(evidence, orderedLabels) {
  const ready = evidence.filter((candidate) => candidate.status === "ready");
  if (ready.length === 0) return { selected: null, error: "no_usable_profile" };
  if (ready.length === 1) return { selected: ready[0], error: null };

  const known = ready.filter((candidate) => candidate.spendPriority !== null);
  if (known.length === 0) return { selected: null, error: "unrankable_profiles" };
  const bestPriority = Math.max(...known.map((candidate) => candidate.spendPriority));
  const best = known.filter((candidate) => candidate.spendPriority === bestPriority);
  if (best.length !== 1) return { selected: null, error: "tied_profiles" };

  // Keep the registry order visible in the evidence even though spendPriority
  // is the only comparator among non-primary alternatives.
  evidence.sort(
    (left, right) => orderedLabels.indexOf(left.profile) - orderedLabels.indexOf(right.profile),
  );
  return { selected: best[0], error: null };
}

function selectAccount({ provider, taskId, scope = "default", persist = true }) {
  if (!PROVIDERS.includes(provider)) throw new Error("provider must be codex or claude");
  if (!TASK_ID_PATTERN.test(taskId)) throw new Error("task id contains unsupported characters");

  const registry = readRegistry();
  const entry = registry.providers[provider];
  const ordered = orderedActiveProfiles(registry, provider);
  if (ordered.length === 0) throw new Error(`${provider} has no active account profiles`);

  const taskLeaseId = leaseId(taskId, scope);
  const snapshot = readState();
  const previous = snapshot.leases[taskLeaseId] || snapshot.leases[taskId];
  let evidence = [];
  let readyByLabel = new Map();
  let chosen;
  let reason;

  // Quota probes deliberately run outside the state lock. They can wait on a
  // vendor CLI, while the lock protects only the small atomic lease update.
  if (!entry.routing.enabled) {
    const primary = ordered.find((profile) => profile.label === entry.primary);
    if (!primary) throw new Error(`${provider} primary profile is not active`);
    const directory = profilePaths(provider, primary.label).directory;
    if (!directoryExists(directory)) throw new Error(`${provider} ${primary.label} directory is missing`);
    chosen = { profile: primary.label };
    reason = "routing_disabled_primary";
  } else {
    evidence = ordered.map((profile) =>
      evaluateProfile(provider, profile, entry.routing.lowQuotaPercent),
    );
    readyByLabel = new Map(
      evidence
        .filter((candidate) => candidate.status === "ready")
        .map((candidate) => [candidate.profile, candidate]),
    );
    if (previous?.provider === provider && readyByLabel.has(previous.profile)) {
      chosen = readyByLabel.get(previous.profile);
      reason = "existing_task_lease";
    } else if (readyByLabel.has(entry.primary)) {
      chosen = readyByLabel.get(entry.primary);
      reason = "primary_healthy";
    } else {
      const alternatives = evidence.filter((candidate) => candidate.profile !== entry.primary);
      const picked = pickAlternate(alternatives, ordered.map((profile) => profile.label));
      if (!picked.selected) {
        const summary = evidence.map((candidate) => `${candidate.profile}:${candidate.status}`).join(", ");
        throw new Error(
          `${provider} account routing stopped (${picked.error}); ${summary || "no evidence"}`,
        );
      }
      chosen = picked.selected;
      reason = "primary_unavailable_alternate_selected";
    }
  }

  if (persist) {
    withStateLock(() => {
      const state = readState();
      const latest = state.leases[taskLeaseId] || state.leases[taskId];
      if (entry.routing.enabled && latest?.provider === provider && readyByLabel.has(latest.profile)) {
        chosen = readyByLabel.get(latest.profile);
        reason = "existing_task_lease";
      }
      delete state.leases[taskId];
      state.leases[taskLeaseId] = {
        taskId,
        provider,
        profile: chosen.profile,
        assignedAt: new Date().toISOString(),
      };
      writeState(state);
    });
  }

  const directory = profilePaths(provider, chosen.profile).directory;
  const selector = provider === "codex" ? "CODEX_HOME" : "CLAUDE_CONFIG_DIR";
  return {
    schema: RESULT_SCHEMA,
    provider,
    harness: provider,
    taskId,
    leaseId: taskLeaseId,
    profile: chosen.profile,
    selector,
    directory,
    reason,
    thresholdPercent: entry.routing.lowQuotaPercent,
    evidence,
  };
}

function releaseAccount(taskId, scope = "default") {
  const taskLeaseId = leaseId(taskId, scope);
  return withStateLock(() => {
    const state = readState();
    const existed = Boolean(state.leases[taskLeaseId] || state.leases[taskId]);
    delete state.leases[taskLeaseId];
    delete state.leases[taskId];
    writeState(state);
    return { released: existed, taskId, leaseId: taskLeaseId };
  });
}

function usage() {
  process.stdout.write(`Usage:
  account-router.mjs select --provider codex|claude --task-id ID [--scope VALUE] [--no-lease]
  account-router.mjs release --task-id ID [--scope VALUE]
  account-router.mjs status

Selection never changes the FirstMate harness. It only selects an active account
profile inside the requested provider and never prints credential contents.
`);
}

function option(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
}

function runCommandLine(args) {
  const command = args[0];
  if (!command || command === "--help" || command === "-h") {
    usage();
    return;
  }
  if (command === "select") {
    const result = selectAccount({
      provider: option(args, "--provider"),
      taskId: option(args, "--task-id"),
      scope: option(args, "--scope") || "default",
      persist: !args.includes("--no-lease"),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (command === "release") {
    process.stdout.write(`${JSON.stringify(releaseAccount(
      option(args, "--task-id"),
      option(args, "--scope") || "default",
    ))}\n`);
    return;
  }
  if (command === "status") {
    process.stdout.write(`${JSON.stringify(readState(), null, 2)}\n`);
    return;
  }
  throw new Error(`unknown command: ${command}`);
}

const invokedAsMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsMain) {
  try {
    runCommandLine(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`account-router: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

export {
  defaultState,
  evaluateProfile,
  leaseId,
  readState,
  releaseAccount,
  selectAccount,
  validateState,
  writeState,
};
