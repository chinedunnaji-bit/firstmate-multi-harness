#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const SCHEMA = "firstmate.account-fleet.v1";
const PROVIDERS = ["codex", "claude"];
const STATES = ["planned", "active", "retired"];
const ANSI = {
  clear: "\x1b[2J\x1b[H",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  reverse: "\x1b[7m",
};

function defaultRegistry() {
  return {
    schema: SCHEMA,
    providers: {
      codex: {
        primary: "account1",
        profiles: [{ label: "account1", state: "active" }],
      },
      claude: {
        primary: "account1",
        profiles: [{ label: "account1", state: "active" }],
      },
    },
  };
}

function configPath() {
  if (process.env.FM_ACCOUNT_FLEET_CONFIG) {
    return path.resolve(process.env.FM_ACCOUNT_FLEET_CONFIG);
  }
  if (process.env.HERDR_PLUGIN_CONFIG_DIR) {
    return path.join(process.env.HERDR_PLUGIN_CONFIG_DIR, "accounts.json");
  }
  return path.join(
    os.homedir(),
    ".config",
    "firstmate-multi-harness",
    "accounts.json",
  );
}

function validateLabel(label) {
  if (!/^account[1-9][0-9]*$/.test(label)) {
    throw new Error("profile label must be accountN, where N is a positive integer");
  }
}

function validateRegistry(registry) {
  if (!registry || registry.schema !== SCHEMA || !registry.providers) {
    throw new Error(`account registry must use schema ${SCHEMA}`);
  }

  for (const provider of PROVIDERS) {
    const entry = registry.providers[provider];
    if (!entry || !Array.isArray(entry.profiles)) {
      throw new Error(`account registry is missing provider ${provider}`);
    }
    validateLabel(entry.primary);
    const labels = new Set();
    for (const profile of entry.profiles) {
      validateLabel(profile.label);
      if (!STATES.includes(profile.state)) {
        throw new Error(`${provider} ${profile.label} has invalid state ${profile.state}`);
      }
      if (labels.has(profile.label)) {
        throw new Error(`${provider} ${profile.label} appears more than once`);
      }
      labels.add(profile.label);
    }
    const primary = entry.profiles.find((profile) => profile.label === entry.primary);
    if (!primary || primary.state !== "active") {
      throw new Error(`${provider} primary must name an active profile`);
    }
  }
  return registry;
}

function readRegistry() {
  const file = configPath();
  if (!fs.existsSync(file)) {
    return defaultRegistry();
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    throw new Error(`could not parse account registry: ${file}`);
  }
  return validateRegistry(parsed);
}

function writeRegistry(registry) {
  validateRegistry(registry);
  const file = configPath();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(registry, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.renameSync(temporary, file);
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // The atomic write already requested 0600. Some non-POSIX test filesystems
    // do not implement chmod, so failure here is not a reason to corrupt state.
  }
}

function providerEntry(registry, provider) {
  if (!PROVIDERS.includes(provider)) {
    throw new Error(`provider must be one of: ${PROVIDERS.join(", ")}`);
  }
  return registry.providers[provider];
}

function profileEntry(registry, provider, label) {
  validateLabel(label);
  const profile = providerEntry(registry, provider).profiles.find(
    (candidate) => candidate.label === label,
  );
  if (!profile) {
    throw new Error(`${provider} ${label} is not registered`);
  }
  return profile;
}

function sortProfiles(entry) {
  entry.profiles.sort((left, right) => {
    const leftNumber = Number(left.label.slice("account".length));
    const rightNumber = Number(right.label.slice("account".length));
    return leftNumber - rightNumber;
  });
}

function addProfile(registry, provider, label) {
  validateLabel(label);
  const entry = providerEntry(registry, provider);
  if (entry.profiles.some((profile) => profile.label === label)) {
    throw new Error(`${provider} ${label} is already registered`);
  }
  entry.profiles.push({ label, state: "planned" });
  sortProfiles(entry);
}

function promoteProfile(registry, provider, label) {
  const entry = providerEntry(registry, provider);
  const profile = profileEntry(registry, provider, label);
  if (profile.state !== "active") {
    throw new Error("only an active profile can become primary");
  }
  entry.primary = label;
}

function retireProfile(registry, provider, label) {
  const entry = providerEntry(registry, provider);
  const profile = profileEntry(registry, provider, label);
  if (entry.primary === label) {
    throw new Error("promote another active profile before retiring the primary");
  }
  profile.state = "retired";
}

function removeProfile(registry, provider, label) {
  const entry = providerEntry(registry, provider);
  const profile = profileEntry(registry, provider, label);
  if (entry.primary === label) {
    throw new Error("the primary profile cannot be removed");
  }
  if (profile.state === "active") {
    throw new Error("retire an active profile before removing it from the registry");
  }
  entry.profiles = entry.profiles.filter((candidate) => candidate.label !== label);
}

function profileNumber(label) {
  validateLabel(label);
  return label.slice("account".length);
}

function profilePaths(provider, label) {
  const number = profileNumber(label);
  return {
    directory: path.join(os.homedir(), `.${provider}-account${number}`),
    wrapper: path.join(os.homedir(), ".local", "bin", `${provider}${number}`),
  };
}

function safeSpawn(command, args, env = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 20_000,
    maxBuffer: 1024 * 1024,
  });
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function repositoryRoot() {
  if (process.env.HERDR_PLUGIN_ROOT) {
    return path.resolve(process.env.HERDR_PLUGIN_ROOT, "..", "..");
  }
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function firstmateHome() {
  return path.resolve(
    process.env.FM_FIRSTMATE_HOME || path.join(os.homedir(), "src", "firstmate"),
  );
}

function portablePath(file) {
  const home = os.homedir();
  return file === home || file.startsWith(`${home}${path.sep}`)
    ? `$HOME${file.slice(home.length)}`
    : file;
}

function runHerdr(args, { resultRequired = true } = {}) {
  const herdr = process.env.HERDR_BIN_PATH || "herdr";
  const result = safeSpawn(herdr, args);
  if (result.status !== 0) {
    throw new Error(`Herdr command failed: ${args.slice(0, 2).join(" ")}`);
  }
  if (!resultRequired) return null;
  const response = parseJson(result.stdout);
  if (!response?.result) {
    throw new Error(`Herdr returned an invalid response for ${args.slice(0, 2).join(" ")}`);
  }
  return response.result;
}

function verifyProfile(provider, label) {
  const paths = profilePaths(provider, label);
  const selector =
    provider === "codex"
      ? { CODEX_HOME: paths.directory }
      : { CLAUDE_CONFIG_DIR: paths.directory };
  const checks = {
    wrapper: false,
    directory: fs.existsSync(paths.directory) && fs.statSync(paths.directory).isDirectory(),
    authenticated: false,
    integration: false,
    quota: false,
  };

  try {
    checks.wrapper = fs.statSync(paths.wrapper).isFile() && Boolean(fs.statSync(paths.wrapper).mode & 0o111);
  } catch {
    checks.wrapper = false;
  }

  if (checks.directory) {
    if (provider === "codex") {
      const auth = safeSpawn("codex", ["login", "status"], selector);
      checks.authenticated = auth.status === 0;
    } else {
      const auth = safeSpawn("claude", ["auth", "status", "--json"], selector);
      const authJson = parseJson(auth.stdout);
      checks.authenticated = auth.status === 0 && authJson?.loggedIn === true;
    }

    const herdr = process.env.HERDR_BIN_PATH || "herdr";
    const integration = safeSpawn(herdr, ["integration", "status"], selector);
    const integrationPattern = new RegExp(`^${provider}: current \\(v[0-9]+\\)`, "m");
    checks.integration =
      integration.status === 0 && integrationPattern.test(integration.stdout);

    const quota = safeSpawn(
      "quota-axi",
      ["--provider", provider, "--json", "--no-credential-refresh"],
      selector,
    );
    const quotaJson = parseJson(quota.stdout);
    const quotaState = quotaJson?.providers?.[0]?.state;
    checks.quota =
      quota.status === 0 && quotaState?.status === "fresh" && quotaState?.stale === false;
  }

  return {
    provider,
    label,
    ready: Object.values(checks).every(Boolean),
    checks,
  };
}

function verifyPrimaryProfiles(registry) {
  const failed = [];
  for (const provider of PROVIDERS) {
    const label = registry.providers[provider].primary;
    const verification = verifyProfile(provider, label);
    if (!verification.ready) failed.push(`${provider} ${label}`);
  }
  if (failed.length > 0) {
    throw new Error(
      `primary readiness failed for ${failed.join(", ")}; verify the rows before launch`,
    );
  }
}

function firstMatePiAgents() {
  const coordinatorHome = firstmateHome();
  const listed = runHerdr(["agent", "list"]);
  return (listed.agents ?? []).filter((candidate) => {
    const detected = String(candidate.agent ?? candidate.display_agent ?? "").toLowerCase();
    const cwd = candidate.foreground_cwd ?? candidate.cwd;
    return detected === "pi" && cwd && path.resolve(cwd) === coordinatorHome;
  });
}

function launchFirstMateTab(registry) {
  if (process.env.HERDR_ENV !== "1" || !process.env.HERDR_WORKSPACE_ID) {
    throw new Error("launch is available only inside an active Herdr workspace");
  }
  if (firstMatePiAgents().length > 0) {
    throw new Error(
      "a FirstMate Pi coordinator already exists; select its tab instead of launching another",
    );
  }
  verifyPrimaryProfiles(registry);

  const setupRoot = repositoryRoot();
  const launcher = path.join(setupRoot, "scripts", "launch-firstmate.sh");
  const coordinatorHome = firstmateHome();
  if (!fs.existsSync(launcher)) {
    throw new Error("FirstMate launcher is missing from the setup repository");
  }
  if (!fs.existsSync(path.join(coordinatorHome, "AGENTS.md"))) {
    throw new Error(
      `FirstMate coordinator home is missing: ${portablePath(coordinatorHome)}`,
    );
  }

  const created = runHerdr([
    "tab",
    "create",
    "--workspace",
    process.env.HERDR_WORKSPACE_ID,
    "--cwd",
    setupRoot,
    "--label",
    "firstmate-coordinator",
    "--env",
    `FM_FIRSTMATE_HOME=${coordinatorHome}`,
    "--no-focus",
  ]);
  const paneId = created.root_pane?.pane_id;
  if (!paneId) throw new Error("Herdr did not return the coordinator pane id");
  // Unlike topology commands such as `tab create`, the installed Herdr 0.8.2
  // `pane run` CLI returns no JSON body on success. Its exit status is the
  // documented automation boundary for this input-submission operation.
  runHerdr(
    ["pane", "run", paneId, "./scripts/launch-firstmate.sh"],
    { resultRequired: false },
  );
  return { paneId, tabId: created.tab?.tab_id ?? null };
}

function openPiLogin() {
  if (process.env.HERDR_ENV !== "1") {
    throw new Error("Pi login control is available only inside Herdr");
  }
  const candidates = firstMatePiAgents();
  if (candidates.length === 0) {
    throw new Error("no FirstMate Pi coordinator found; launch it first and wait for its screen");
  }
  if (candidates.length > 1) {
    throw new Error("multiple FirstMate Pi coordinators found; close duplicates before login");
  }

  const candidate = candidates[0];
  if (candidate.agent_status === "blocked") {
    throw new Error("Pi is blocked; open its tab and resolve the trust or approval prompt first");
  }
  if (!["idle", "done"].includes(candidate.agent_status)) {
    throw new Error(`Pi is ${candidate.agent_status}; wait until it is idle before login`);
  }
  const target = candidate.name || candidate.pane_id;
  runHerdr(["agent", "prompt", target, "/login"]);
  try {
    runHerdr(["agent", "focus", target]);
  } catch {
    // The login command was already delivered. A focus failure is recoverable:
    // the user can select the coordinator tab through Herdr's normal UI.
  }
  return { paneId: candidate.pane_id, target };
}

function activateProfile(registry, provider, label, verification) {
  const profile = profileEntry(registry, provider, label);
  if (!verification?.ready) {
    throw new Error("profile is not ready; run verification and finish every setup check");
  }
  profile.state = "active";
}

function setupCommands(provider, label, registry = defaultRegistry()) {
  const number = profileNumber(label);
  const selector = provider === "codex" ? "CODEX_HOME" : "CLAUDE_CONFIG_DIR";
  const directory = `$HOME/.${provider}-account${number}`;
  const wrapper = `${provider}${number}`;
  const generic =
    provider === "codex"
      ? "examples/codex-account-wrapper.sh"
      : "examples/claude-account-wrapper.sh";
  const login = provider === "codex" ? `${wrapper} login` : `${wrapper} auth login`;
  const codexLabel = provider === "codex" ? label : registry.providers.codex.primary;
  const claudeLabel = provider === "claude" ? label : registry.providers.claude.primary;
  const codexDirectory = `$HOME/.codex-account${profileNumber(codexLabel)}`;
  const claudeDirectory = `$HOME/.claude-account${profileNumber(claudeLabel)}`;
  const quotaFlags =
    provider === "claude"
      ? "--allow-keychain-prompt --no-credential-refresh"
      : "--no-credential-refresh";
  const commands = [
    `install -d "$HOME/.local/bin"`,
    `test ! -e "$HOME/.local/bin/${wrapper}"`,
    `install -m 0755 ${generic} "$HOME/.local/bin/${wrapper}"`,
    login,
    `${selector}="${directory}" herdr integration install ${provider}`,
    `${selector}="${directory}" quota-axi --provider ${provider} --json ${quotaFlags} >/dev/null`,
  ];
  for (const tool of ["gh-axi", "chrome-devtools-axi", "lavish-axi"]) {
    commands.push(
      `CODEX_HOME="${codexDirectory}" CLAUDE_CONFIG_DIR="${claudeDirectory}" ${tool} setup hooks`,
    );
  }
  return commands;
}

function sanitizedSnapshot(registry, liveChecks = false) {
  return {
    schema: SCHEMA,
    providers: PROVIDERS.map((provider) => {
      const entry = registry.providers[provider];
      return {
        provider,
        primary: entry.primary,
        profiles: entry.profiles.map((profile) => ({
          label: profile.label,
          state: profile.state,
          primary: entry.primary === profile.label,
          verification: liveChecks ? verifyProfile(provider, profile.label) : undefined,
        })),
      };
    }),
  };
}

function flattenProfiles(registry) {
  return PROVIDERS.flatMap((provider) =>
    registry.providers[provider].profiles.map((profile) => ({
      provider,
      label: profile.label,
      state: profile.state,
      primary: registry.providers[provider].primary === profile.label,
    })),
  );
}

function stateColor(state) {
  if (state === "active") return ANSI.green;
  if (state === "planned") return ANSI.yellow;
  return ANSI.dim;
}

function checkMark(value) {
  return value ? `${ANSI.green}yes${ANSI.reset}` : `${ANSI.red}no${ANSI.reset}`;
}

function draw(registry, selected, verification, message = "") {
  const rows = flattenProfiles(registry);
  const width = Math.max(72, Math.min(process.stdout.columns || 100, 120));
  const rule = "─".repeat(width - 1);
  let output = ANSI.clear;
  output += `${ANSI.bold}${ANSI.cyan}FirstMate Account Fleet${ANSI.reset}\n`;
  output += `${ANSI.dim}Sanitized routing metadata — credential contents are never read or shown${ANSI.reset}\n`;
  output += `${rule}\n`;
  output += `${ANSI.bold}Coordinator${ANSI.reset}  `;
  output += `${ANSI.reverse} L  Launch FirstMate ${ANSI.reset}  `;
  output += `${ANSI.reverse} /  Open Pi Login ${ANSI.reset}\n`;
  output += `${rule}\n`;
  output += `${ANSI.bold}  Provider  Profile     State      Primary  Readiness${ANSI.reset}\n`;
  rows.forEach((row, index) => {
    const pointer = index === selected ? "›" : " ";
    const selectedStyle = index === selected ? ANSI.reverse : "";
    const primary = row.primary ? "yes" : "-";
    const key = `${row.provider}:${row.label}`;
    const ready = verification.get(key)?.ready;
    const readiness = ready === undefined ? "not checked" : ready ? "ready" : "needs setup";
    output += `${selectedStyle}${pointer} ${row.provider.padEnd(9)} ${row.label.padEnd(11)} ${stateColor(row.state)}${row.state.padEnd(10)}${ANSI.reset}${selectedStyle} ${primary.padEnd(8)} ${readiness}${ANSI.reset}\n`;
  });
  output += `${rule}\n`;

  const current = rows[selected];
  const currentVerification = current
    ? verification.get(`${current.provider}:${current.label}`)
    : null;
  if (currentVerification) {
    const checks = currentVerification.checks;
    output += `${ANSI.bold}${current.provider} ${current.label} checks:${ANSI.reset} `;
    output += `wrapper ${checkMark(checks.wrapper)}  `;
    output += `directory ${checkMark(checks.directory)}  `;
    output += `login ${checkMark(checks.authenticated)}  `;
    output += `Herdr ${checkMark(checks.integration)}  `;
    output += `quota ${checkMark(checks.quota)}\n`;
  }
  if (message) output += `${ANSI.yellow}${message}${ANSI.reset}\n`;
  output += "\n↑/↓ select   v verify   n new planned   e enable   p promote\n";
  output += "r retire     x forget registry entry   c setup commands   q close\n";
  output += "L launch a coordinator tab            / send /login to idle coordinator\n";
  process.stdout.write(output);
}

async function promptLine(question) {
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await prompt.question(question)).trim();
  } finally {
    prompt.close();
    process.stdin.resume();
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
  }
}

async function showCommands(provider, label) {
  process.stdout.write(ANSI.clear);
  process.stdout.write(`${ANSI.bold}Setup commands for ${provider} ${label}${ANSI.reset}\n\n`);
  process.stdout.write("Run these from the repository root in a normal terminal:\n\n");
  setupCommands(provider, label, readRegistry()).forEach((command) =>
    process.stdout.write(`${command}\n`),
  );
  process.stdout.write("\nNo credential data is entered into Account Fleet.\n");
  await promptLine("Press Enter to return ");
}

async function interactive() {
  let registry = readRegistry();
  let selected = 0;
  let message = "";
  const verification = new Map();
  process.stdin.setEncoding("utf8");
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();

  const redraw = () => {
    const count = flattenProfiles(registry).length;
    if (selected >= count) selected = Math.max(0, count - 1);
    draw(registry, selected, verification, message);
  };

  const readKey = () => new Promise((resolve) => process.stdin.once("data", resolve));

  redraw();
  while (true) {
    const key = await readKey();
    const rows = flattenProfiles(registry);
    const current = rows[selected];
    message = "";
    try {
      if (key === "q" || key === "\u0003") break;
      if (key === "\u001b[A" || key === "k") selected = Math.max(0, selected - 1);
      else if (key === "\u001b[B" || key === "j") selected = Math.min(rows.length - 1, selected + 1);
      else if (key === "v" && current) {
        message = `Checking ${current.provider} ${current.label}…`;
        redraw();
        verification.set(
          `${current.provider}:${current.label}`,
          verifyProfile(current.provider, current.label),
        );
        message = "Verification finished; only boolean health results are retained.";
      } else if (key === "n") {
        const provider = (await promptLine("Provider (codex/claude): ")).toLowerCase();
        const number = await promptLine("Account number: ");
        addProfile(registry, provider, `account${number}`);
        writeRegistry(registry);
        message = `${provider} account${number} added as planned; press c for setup commands.`;
      } else if (key === "e" && current) {
        const result = verifyProfile(current.provider, current.label);
        verification.set(`${current.provider}:${current.label}`, result);
        activateProfile(registry, current.provider, current.label, result);
        writeRegistry(registry);
        message = `${current.provider} ${current.label} is active.`;
      } else if (key === "p" && current) {
        promoteProfile(registry, current.provider, current.label);
        writeRegistry(registry);
        message = `${current.provider} ${current.label} is now primary.`;
      } else if (key === "r" && current) {
        retireProfile(registry, current.provider, current.label);
        writeRegistry(registry);
        message = "Retired from routing only; local login and profile files were not changed.";
      } else if (key === "x" && current) {
        const confirmation = await promptLine(
          `Type ${current.label} to forget this registry entry (files remain): `,
        );
        if (confirmation !== current.label) {
          message = "Forget cancelled.";
        } else {
          removeProfile(registry, current.provider, current.label);
          writeRegistry(registry);
          verification.delete(`${current.provider}:${current.label}`);
          message = "Registry entry removed; wrapper, login, and profile directory remain untouched.";
        }
      } else if (key === "c" && current) {
        await showCommands(current.provider, current.label);
      } else if (key === "l" || key === "L") {
        const confirmation = await promptLine(
          "Start a new coordinator only if one is not already running. Type launch: ",
        );
        if (confirmation !== "launch") {
          message = "Coordinator launch cancelled.";
        } else {
          message = "Verifying primary accounts and creating the coordinator tab…";
          redraw();
          const launched = launchFirstMateTab(registry);
          message = `Coordinator started in ${launched.tabId ?? launched.paneId}; close this overlay and select that tab.`;
        }
      } else if (key === "/") {
        message = "Locating the idle FirstMate Pi coordinator…";
        redraw();
        openPiLogin();
        message = "Pi /login opened; complete authentication in the coordinator tab.";
      }
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    redraw();
  }

  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdin.pause();
  process.stdout.write(`${ANSI.clear}${ANSI.reset}`);
}

function usage() {
  process.stdout.write(`Usage:
  account-fleet.mjs
  account-fleet.mjs --snapshot [--live]
  account-fleet.mjs --add codex|claude accountN
  account-fleet.mjs --promote codex|claude accountN
  account-fleet.mjs --retire codex|claude accountN
  account-fleet.mjs --remove codex|claude accountN

The interactive terminal UI never displays credential, identity, or quota amounts.
`);
}

function runCommandLine(args) {
  if (args.length === 0) return false;
  if (args[0] === "--help" || args[0] === "-h") {
    usage();
    return true;
  }
  const registry = readRegistry();
  if (args[0] === "--snapshot") {
    process.stdout.write(`${JSON.stringify(sanitizedSnapshot(registry, args.includes("--live")), null, 2)}\n`);
    return true;
  }
  const [operation, provider, label] = args;
  if (!provider || !label) throw new Error("operation requires a provider and accountN label");
  if (operation === "--add") addProfile(registry, provider, label);
  else if (operation === "--promote") promoteProfile(registry, provider, label);
  else if (operation === "--retire") retireProfile(registry, provider, label);
  else if (operation === "--remove") removeProfile(registry, provider, label);
  else throw new Error(`unknown operation: ${operation}`);
  writeRegistry(registry);
  process.stdout.write("Account registry updated. Credential and profile files were not changed.\n");
  return true;
}

const invokedAsMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsMain) {
  try {
    if (!runCommandLine(process.argv.slice(2))) await interactive();
  } catch (error) {
    process.stderr.write(`account-fleet: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

export {
  activateProfile,
  addProfile,
  defaultRegistry,
  profilePaths,
  promoteProfile,
  readRegistry,
  removeProfile,
  retireProfile,
  sanitizedSnapshot,
  setupCommands,
  validateRegistry,
  verifyProfile,
  launchFirstMateTab,
  openPiLogin,
  writeRegistry,
};
