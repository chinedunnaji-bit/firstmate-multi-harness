#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const SCHEMA = "firstmate.project-catalog.v1";
const SOURCE_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".cs",
  ".go",
  ".ipynb",
  ".java",
  ".js",
  ".jsx",
  ".kt",
  ".kts",
  ".m",
  ".mm",
  ".php",
  ".py",
  ".r",
  ".rb",
  ".rs",
  ".sh",
  ".swift",
  ".ts",
  ".tsx",
]);
const PROJECT_MARKERS = new Set([
  ".classpath",
  ".project",
  "CMakeLists.txt",
  "Cargo.toml",
  "Gemfile",
  "Makefile",
  "Package.swift",
  "build.gradle",
  "build.gradle.kts",
  "composer.json",
  "deno.json",
  "deno.jsonc",
  "go.mod",
  "mix.exs",
  "package.json",
  "pom.xml",
  "pyproject.toml",
  "requirements.txt",
  "settings.gradle",
  "settings.gradle.kts",
]);
const PRUNE_NAMES = new Set([
  ".Trash",
  ".aws",
  ".cache",
  ".claude",
  ".codex",
  ".config",
  ".docker",
  ".git",
  ".gnupg",
  ".gradle",
  ".idea",
  ".kube",
  ".local",
  ".next",
  ".npm",
  ".nvm",
  ".pi",
  ".pytest_cache",
  ".ssh",
  ".terraform",
  ".venv",
  ".vscode",
  "ACCELQAgent",
  "Applications",
  "DerivedData",
  "Library",
  "Pods",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "google-cloud-sdk",
  "node_modules",
  "target",
  "venv",
]);
const ANSI = {
  clear: "\x1b[2J\x1b[H",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  reverse: "\x1b[7m",
};

function catalogPath() {
  if (process.env.FM_PROJECT_CATALOG) {
    return path.resolve(process.env.FM_PROJECT_CATALOG);
  }
  if (process.env.HERDR_PLUGIN_CONFIG_DIR) {
    return path.join(process.env.HERDR_PLUGIN_CONFIG_DIR, "projects.json");
  }
  return path.join(
    os.homedir(),
    ".config",
    "firstmate-multi-harness",
    "projects.json",
  );
}

function firstmateHome() {
  return path.resolve(
    process.env.FM_FIRSTMATE_HOME || path.join(os.homedir(), "src", "firstmate"),
  );
}

function scanRoots() {
  if (!process.env.FM_PROJECT_SCAN_ROOTS) return [os.homedir()];
  return process.env.FM_PROJECT_SCAN_ROOTS.split(path.delimiter)
    .map((root) => root.trim())
    .filter(Boolean)
    .map((root) => path.resolve(root));
}

function portablePath(file) {
  const home = os.homedir();
  return file === home || file.startsWith(`${home}${path.sep}`)
    ? `$HOME${file.slice(home.length)}`
    : file;
}

function safeDisplay(value) {
  return String(value).replace(/[\u0000-\u001f\u007f]/g, "?");
}

function pathSegments(file) {
  return path.resolve(file).split(path.sep).filter(Boolean);
}

function classifyProject(projectPath, kind) {
  const resolved = path.resolve(projectPath);
  const firstmate = firstmateHome();
  const managedRoot = path.join(firstmate, "projects");
  const segments = pathSegments(resolved);
  const lowered = segments.map((segment) => segment.toLowerCase());

  if (resolved === firstmate) return "firstmate-system";
  if (resolved.startsWith(`${managedRoot}${path.sep}`)) return "managed";
  if (
    lowered.includes(".worktrees") ||
    segments.some((segment) => segment.toLowerCase().endsWith("-worktrees"))
  ) {
    return "generated-worktree";
  }
  if (
    lowered.some((segment) =>
      [
        "external",
        "fixtures",
        "reference-templates",
        "sample",
        "samples",
        "sdk",
        "third-party",
        "third_party",
        "vendor",
      ].includes(segment) ||
      segment.endsWith(".app") ||
      segment.endsWith("_files"),
    )
  ) {
    return "reference";
  }
  return kind === "git" ? "candidate" : "non-git-candidate";
}

function shouldPrune(directory, root) {
  if (directory === root) return false;
  const name = path.basename(directory);
  if (PRUNE_NAMES.has(name)) return true;
  if (/^\.(?:claude|codex)(?:-account[0-9]+)?$/.test(name)) return true;
  if (name.startsWith(".") && name !== ".worktrees") return true;
  const goModuleCache = path.join(os.homedir(), "go", "pkg", "mod");
  const goChecksumCache = path.join(os.homedir(), "go", "pkg", "sumdb");
  if (
    directory === goModuleCache ||
    directory.startsWith(`${goModuleCache}${path.sep}`) ||
    directory === goChecksumCache ||
    directory.startsWith(`${goChecksumCache}${path.sep}`)
  ) {
    return true;
  }
  return false;
}

function readDirectory(directory) {
  try {
    return fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return null;
  }
}

function isStandardProjectContainer(directory) {
  const home = os.homedir();
  return [
    "Desktop",
    "Developer",
    "Documents",
    "Downloads",
    "Projects",
    "src",
    "workspace",
  ].some((name) => directory === path.join(home, name));
}

function hasProjectMarker(entries) {
  return entries.some((entry) => entry.isFile() && PROJECT_MARKERS.has(entry.name));
}

function directChildHasStrongProjectEvidence(directory, entries) {
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const child = path.join(directory, entry.name);
    if (shouldPrune(child, directory)) continue;
    const childEntries = readDirectory(child);
    if (!childEntries) continue;
    if (childEntries.some((candidate) => candidate.name === ".git")) return true;
    if (hasProjectMarker(childEntries)) return true;
  }
  return false;
}

function looksLikeNonGitProject(directory, entries, depth) {
  if (hasProjectMarker(entries)) return true;
  const sourceFiles = entries.filter(
    (entry) => entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()),
  );
  return (
    depth <= 4 &&
    sourceFiles.length >= 2 &&
    !directChildHasStrongProjectEvidence(directory, entries)
  );
}

function gitValue(repository, args, timeout = 2_000) {
  const result = spawnSync("git", ["-C", repository, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout,
    maxBuffer: 1024 * 1024,
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function gitMetadata(repository) {
  const branch = gitValue(repository, ["branch", "--show-current"]);
  const remotes = gitValue(repository, ["remote"]);
  const status = gitValue(repository, ["status", "--porcelain"]);
  return {
    branch: branch || null,
    dirty: status === null ? null : status.length > 0,
    hasOrigin: remotes !== null && remotes.split("\n").includes("origin"),
  };
}

function discoverProjects({ roots = scanRoots(), includeGitMetadata = false } = {}) {
  const discovered = new Map();
  let unreadableDirectories = 0;

  function addCandidate(directory, kind) {
    const resolved = path.resolve(directory);
    if (discovered.has(resolved)) return;
    const classification = classifyProject(resolved, kind);
    const metadata =
      kind === "git" &&
      includeGitMetadata &&
      !["firstmate-system", "generated-worktree", "reference"].includes(classification)
      ? gitMetadata(resolved)
      : {
          branch: null,
          dirty: null,
          hasOrigin: kind === "git" ? null : false,
        };
    discovered.set(resolved, {
      path: resolved,
      kind,
      classification,
      ...metadata,
    });
  }

  function walk(directory, root, depth = 0) {
    if (shouldPrune(directory, root)) return;
    const entries = readDirectory(directory);
    if (!entries) {
      unreadableDirectories += 1;
      return;
    }

    const isGit = entries.some((entry) => entry.name === ".git");
    if (isGit) {
      addCandidate(directory, "git");
      return;
    }

    const classification = classifyProject(directory, "directory");
    if (["generated-worktree", "reference"].includes(classification)) {
      addCandidate(directory, "directory");
      return;
    }
    const eligibleNonGit = ![
      "firstmate-system",
      "generated-worktree",
      "managed",
      "reference",
    ].includes(classification);
    const isUserHomeRoot =
      directory === root && path.resolve(directory) === path.resolve(os.homedir());
    if (
      !isUserHomeRoot &&
      !isStandardProjectContainer(directory) &&
      eligibleNonGit &&
      looksLikeNonGitProject(directory, entries, depth)
    ) {
      addCandidate(directory, "directory");
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      walk(path.join(directory, entry.name), root, depth + 1);
    }
  }

  for (const root of roots) {
    const resolved = path.resolve(root);
    if (fs.existsSync(resolved)) walk(resolved, resolved);
  }

  const managedRoot = path.join(firstmateHome(), "projects");
  if (fs.existsSync(managedRoot)) {
    const managedEntries = readDirectory(managedRoot) ?? [];
    for (const entry of managedEntries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      walk(path.join(managedRoot, entry.name), path.join(managedRoot, entry.name));
    }
  }

  const projects = [...discovered.values()].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
  return {
    schema: SCHEMA,
    scannedAt: new Date().toISOString(),
    roots: roots.map((root) => path.resolve(root)),
    unreadableDirectories,
    projects,
  };
}

function validateCatalog(catalog) {
  if (!catalog || catalog.schema !== SCHEMA || !Array.isArray(catalog.projects)) {
    throw new Error(`project catalog must use schema ${SCHEMA}`);
  }
  for (const project of catalog.projects) {
    if (
      !project ||
      typeof project.path !== "string" ||
      !["git", "directory"].includes(project.kind) ||
      typeof project.classification !== "string"
    ) {
      throw new Error("project catalog contains an invalid project row");
    }
  }
  return catalog;
}

function writeCatalog(catalog) {
  validateCatalog(catalog);
  const file = catalogPath();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(catalog, null, 2)}\n`, {
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

function readCatalog() {
  const file = catalogPath();
  if (!fs.existsSync(file)) return null;
  try {
    return validateCatalog(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    throw new Error(`could not parse project catalog: ${file}`);
  }
}

function safeSpawn(command, args) {
  return spawnSync(command, args, {
    encoding: "utf8",
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

function runHerdr(args) {
  const herdr = process.env.HERDR_BIN_PATH || "herdr";
  const result = safeSpawn(herdr, args);
  if (result.status !== 0) {
    throw new Error(`Herdr command failed: ${args.slice(0, 2).join(" ")}`);
  }
  const response = parseJson(result.stdout);
  if (!response?.result) {
    throw new Error(`Herdr returned an invalid response for ${args.slice(0, 2).join(" ")}`);
  }
  return response.result;
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

function idleCoordinator() {
  if (process.env.HERDR_ENV !== "1") {
    throw new Error("coordinator review is available only inside Herdr");
  }
  const candidates = firstMatePiAgents();
  if (candidates.length !== 1) {
    throw new Error(
      candidates.length === 0
        ? "no FirstMate Pi coordinator found"
        : "multiple FirstMate Pi coordinators found",
    );
  }
  const candidate = candidates[0];
  if (!["idle", "done"].includes(candidate.agent_status)) {
    throw new Error(`Pi is ${candidate.agent_status}; wait until it is idle`);
  }
  return candidate;
}

function selectedReviewPrompt(project) {
  return `Inventory the project candidate at ${portablePath(project.path)} read-only. ` +
    "Do not clone, register, initialize, push, edit, move, or delete anything. " +
    "Determine whether it is a canonical project, generated worktree, dependency, reference copy, or duplicate. " +
    "Report its Git/remotes/dirty/unpushed state, whether a managed clone would omit local work, and a proposed FirstMate name and delivery posture. " +
    "Sanitize any embedded remote credentials and wait for my explicit approval before changing anything.";
}

function catalogReviewPrompt(catalog) {
  return `Review the private read-only project catalog at ${portablePath(catalogPath())}. ` +
    "It was generated from filesystem names and Git metadata only. Do not clone, register, initialize, push, edit, move, or delete anything. " +
    "Deduplicate canonical projects from generated worktrees, dependencies, reference repositories, and nested copies. " +
    "Include non-Git project candidates. Return a proposed managed-project table with current path, reason, proposed unique name, and recommended delivery posture. " +
    "Treat sensitive document projects as opt-in and disclose provider-exposure risk. Wait for my explicit approval before any project intake.";
}

function sendCoordinatorPrompt(prompt) {
  const candidate = idleCoordinator();
  const target = candidate.name || candidate.pane_id;
  runHerdr(["agent", "prompt", target, prompt]);
  try {
    runHerdr(["agent", "focus", target]);
  } catch {
    // Delivery succeeded; normal Herdr navigation remains available.
  }
  return target;
}

function classificationColor(classification) {
  if (classification === "candidate" || classification === "non-git-candidate") {
    return ANSI.green;
  }
  if (classification === "managed") return ANSI.cyan;
  return ANSI.dim;
}

function shorten(value, width) {
  const text = safeDisplay(value);
  if (text.length <= width) return text;
  if (width <= 1) return "…";
  return `…${text.slice(-(width - 1))}`;
}

function visibleProjects(catalog, filter) {
  if (!catalog) return [];
  if (filter === "candidates") {
    return catalog.projects.filter((project) =>
      ["candidate", "non-git-candidate"].includes(project.classification),
    );
  }
  return catalog.projects;
}

function draw(catalog, selected, filter, message = "") {
  const rows = visibleProjects(catalog, filter);
  const width = Math.max(88, Math.min(process.stdout.columns || 120, 150));
  const height = Math.max(12, process.stdout.rows || 32);
  const pageSize = Math.max(5, height - 13);
  const pageStart = Math.floor(selected / pageSize) * pageSize;
  const pageRows = rows.slice(pageStart, pageStart + pageSize);
  const pathWidth = Math.max(28, width - 55);
  const rule = "─".repeat(width - 1);
  let output = ANSI.clear;
  output += `${ANSI.bold}${ANSI.cyan}FirstMate Computer Projects${ANSI.reset}\n`;
  output += `${ANSI.dim}Private path catalog — filenames and Git metadata only; no file contents or credentials${ANSI.reset}\n`;
  output += `${rule}\n`;
  output += `${ANSI.reverse} S  Scan Home ${ANSI.reset}  `;
  output += `${ANSI.reverse} A  Ask FirstMate to Review All ${ANSI.reset}  `;
  output += `${ANSI.reverse} I  Inspect Selected ${ANSI.reset}\n`;
  output += `${rule}\n`;
  if (!catalog) {
    output += "No catalog yet. Press S to scan your macOS user home.\n";
  } else {
    output += `${ANSI.bold}  Type    Classification       Origin  Dirty    Path${ANSI.reset}\n`;
    pageRows.forEach((row, pageIndex) => {
      const index = pageStart + pageIndex;
      const pointer = index === selected ? "›" : " ";
      const selectedStyle = index === selected ? ANSI.reverse : "";
      const origin =
        row.kind !== "git" ? "-" : row.hasOrigin === null ? "?" : row.hasOrigin ? "yes" : "no";
      const dirty = row.kind !== "git" ? "-" : row.dirty === null ? "?" : row.dirty ? "yes" : "no";
      const projectPath = shorten(portablePath(row.path), pathWidth);
      output += `${selectedStyle}${pointer} ${row.kind.padEnd(7)} `;
      output += `${classificationColor(row.classification)}${row.classification.padEnd(20)}${ANSI.reset}${selectedStyle} `;
      output += `${origin.padEnd(7)} ${dirty.padEnd(8)} ${projectPath}${ANSI.reset}\n`;
    });
    output += `${ANSI.dim}${rows.length} shown; ${catalog.projects.length} total; filter=${filter}; unreadable directories=${catalog.unreadableDirectories}${ANSI.reset}\n`;
  }
  output += `${rule}\n`;
  const current = rows[selected];
  if (current) {
    output += `${ANSI.bold}${portablePath(current.path)}${ANSI.reset}\n`;
    output += `kind=${current.kind}  class=${current.classification}`;
    if (current.branch) output += `  branch=${safeDisplay(current.branch)}`;
    output += "\n";
  }
  if (message) output += `${ANSI.yellow}${safeDisplay(message)}${ANSI.reset}\n`;
  output += "\n↑/↓ select   s rescan   f candidates/all   i inspect selected\n";
  output += "A review all with FirstMate   q close\n";
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

async function interactive() {
  let catalog = readCatalog();
  let selected = 0;
  let filter = "candidates";
  let message = "";
  process.stdin.setEncoding("utf8");
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();

  const redraw = () => {
    const rows = visibleProjects(catalog, filter);
    if (selected >= rows.length) selected = Math.max(0, rows.length - 1);
    draw(catalog, selected, filter, message);
  };
  const readKey = () => new Promise((resolve) => process.stdin.once("data", resolve));

  redraw();
  while (true) {
    const key = await readKey();
    const rows = visibleProjects(catalog, filter);
    const current = rows[selected];
    message = "";
    try {
      if (key === "q" || key === "\u0003") break;
      if (key === "\u001b[A" || key === "k") selected = Math.max(0, selected - 1);
      else if (key === "\u001b[B" || key === "j") {
        selected = Math.min(Math.max(0, rows.length - 1), selected + 1);
      } else if (key === "s" || key === "S") {
        message = "Scanning user home; dependency, cache, system, and credential directories are excluded…";
        redraw();
        catalog = discoverProjects();
        writeCatalog(catalog);
        selected = 0;
        message = `Scan complete: ${catalog.projects.length} project candidates recorded privately.`;
      } else if (key === "f") {
        filter = filter === "candidates" ? "all" : "candidates";
        selected = 0;
      } else if (key === "i" || key === "I") {
        if (!current) throw new Error("scan and select a project first");
        const confirmation = await promptLine(
          `Send a read-only inspection request for ${portablePath(current.path)}? Type inspect: `,
        );
        if (confirmation !== "inspect") message = "Inspection cancelled.";
        else {
          sendCoordinatorPrompt(selectedReviewPrompt(current));
          message = "Read-only inspection request sent to the FirstMate coordinator.";
        }
      } else if (key === "a" || key === "A") {
        if (!catalog) throw new Error("scan the computer first");
        const confirmation = await promptLine(
          `Ask FirstMate to review all ${catalog.projects.length} catalog rows read-only? Type review: `,
        );
        if (confirmation !== "review") message = "Catalog review cancelled.";
        else {
          sendCoordinatorPrompt(catalogReviewPrompt(catalog));
          message = "Read-only whole-catalog review sent to the FirstMate coordinator.";
        }
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

function sanitizedSummary(catalog) {
  const counts = {};
  for (const project of catalog.projects) {
    counts[project.classification] = (counts[project.classification] ?? 0) + 1;
  }
  return {
    schema: catalog.schema,
    scannedAt: catalog.scannedAt,
    roots: catalog.roots.map(portablePath),
    unreadableDirectories: catalog.unreadableDirectories,
    projectCount: catalog.projects.length,
    classifications: counts,
  };
}

function usage() {
  process.stdout.write(`Usage:
  project-fleet.mjs
  project-fleet.mjs --scan
  project-fleet.mjs --scan-live
  project-fleet.mjs --summary
  project-fleet.mjs --catalog-path

The normal scan reads directory names and Git-root markers only. --scan-live
also derives branch, origin-presence, and dirty booleans without retaining
command output. Neither mode reads remote URLs, project file contents,
credentials, tokens, cookies, or keychain data.
`);
}

function runCommandLine(args) {
  if (args.length === 0) return false;
  if (args[0] === "--help" || args[0] === "-h") usage();
  else if (args[0] === "--catalog-path") process.stdout.write(`${catalogPath()}\n`);
  else if (args[0] === "--scan" || args[0] === "--scan-live") {
    const catalog = discoverProjects({ includeGitMetadata: args[0] === "--scan-live" });
    writeCatalog(catalog);
    process.stdout.write(`${JSON.stringify(sanitizedSummary(catalog), null, 2)}\n`);
  } else if (args[0] === "--summary") {
    const catalog = readCatalog();
    if (!catalog) throw new Error("no project catalog exists; run --scan first");
    process.stdout.write(`${JSON.stringify(sanitizedSummary(catalog), null, 2)}\n`);
  } else throw new Error(`unknown operation: ${args[0]}`);
  return true;
}

const invokedAsMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsMain) {
  try {
    if (!runCommandLine(process.argv.slice(2))) await interactive();
  } catch (error) {
    process.stderr.write(`project-fleet: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

export {
  catalogPath,
  catalogReviewPrompt,
  classifyProject,
  discoverProjects,
  readCatalog,
  sanitizedSummary,
  selectedReviewPrompt,
  sendCoordinatorPrompt,
  validateCatalog,
  writeCatalog,
};
