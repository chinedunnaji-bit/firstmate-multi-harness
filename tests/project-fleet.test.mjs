import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  catalogReviewPrompt,
  classifyProject,
  discoverProjects,
  readCatalog,
  sanitizedSummary,
  selectedReviewPrompt,
  writeCatalog,
} from "../plugins/account-fleet/project-fleet.mjs";

function withIsolatedEnvironment(callback) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "project-fleet-test."));
  const environmentKeys = [
    "HOME",
    "FM_FIRSTMATE_HOME",
    "FM_PROJECT_CATALOG",
    "FM_PROJECT_SCAN_ROOTS",
    "HERDR_PLUGIN_CONFIG_DIR",
  ];
  const previous = Object.fromEntries(
    environmentKeys.map((key) => [key, process.env[key]]),
  );
  process.env.HOME = temporary;
  process.env.FM_FIRSTMATE_HOME = path.join(temporary, "src", "firstmate");
  process.env.FM_PROJECT_CATALOG = path.join(temporary, "private", "projects.json");
  delete process.env.FM_PROJECT_SCAN_ROOTS;
  delete process.env.HERDR_PLUGIN_CONFIG_DIR;

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

function initializeRepository(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const result = spawnSync("git", ["init", "-q", directory], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

test("whole-home discovery finds Git and non-Git projects but prunes private and dependency trees", () => {
  withIsolatedEnvironment((home) => {
    fs.writeFileSync(path.join(home, "one.py"), "print('loose one')\n");
    fs.writeFileSync(path.join(home, "two.py"), "print('loose two')\n");
    fs.writeFileSync(path.join(home, "package.json"), '{"private":true}\n');
    fs.mkdirSync(path.join(home, "Downloads"), { recursive: true });
    fs.writeFileSync(path.join(home, "Downloads", "requirements.txt"), "example\n");
    const app = path.join(home, "Documents", "application");
    initializeRepository(app);
    fs.writeFileSync(path.join(app, "package.json"), '{"name":"application"}\n');
    spawnSync("git", ["-C", app, "remote", "add", "origin", "https://private-token@example.invalid/private.git"]);

    const documentAutomation = path.join(home, "Desktop", "document-automation");
    fs.mkdirSync(documentAutomation, { recursive: true });
    fs.writeFileSync(path.join(documentAutomation, "one.py"), "PRIVATE_FILE_CONTENT\n");
    fs.writeFileSync(path.join(documentAutomation, "two.py"), "print('two')\n");
    const nestedScripts = path.join(documentAutomation, "nested");
    fs.mkdirSync(nestedScripts);
    fs.writeFileSync(path.join(nestedScripts, "one.py"), "print('nested one')\n");
    fs.writeFileSync(path.join(nestedScripts, "two.py"), "print('nested two')\n");

    const worktreeCollection = path.join(home, "Documents", "application-worktrees");
    const worktree = path.join(worktreeCollection, "task-1");
    initializeRepository(worktree);
    const referenceCollection = path.join(home, "Documents", "platform", "external");
    const reference = path.join(referenceCollection, "template");
    initializeRepository(reference);
    initializeRepository(path.join(home, ".codex-account1", "must-not-appear"));
    initializeRepository(path.join(home, "Documents", "application", "node_modules", "dependency"));

    const catalog = discoverProjects({ roots: [home], includeGitMetadata: true });
    const byPath = new Map(catalog.projects.map((project) => [project.path, project]));
    assert.equal(byPath.has(home), false);
    assert.equal(byPath.has(path.join(home, "Downloads")), false);
    assert.equal(byPath.get(app)?.classification, "candidate");
    assert.equal(byPath.get(app)?.hasOrigin, true);
    assert.equal(byPath.get(app)?.dirty, true);
    assert.equal(byPath.get(documentAutomation)?.classification, "non-git-candidate");
    assert.equal(byPath.has(nestedScripts), false);
    assert.equal(byPath.get(worktreeCollection)?.classification, "generated-worktree");
    assert.equal(byPath.has(worktree), false);
    assert.equal(byPath.get(referenceCollection)?.classification, "reference");
    assert.equal(byPath.has(reference), false);
    assert.equal(byPath.has(path.join(home, ".codex-account1", "must-not-appear")), false);
    assert.equal(
      byPath.has(path.join(home, "Documents", "application", "node_modules", "dependency")),
      false,
    );

    const serialized = JSON.stringify(catalog);
    assert.doesNotMatch(serialized, /private-token|example\.invalid|PRIVATE_FILE_CONTENT/);
  });
});

test("catalog is private, validates on read, and exposes only counts in its summary", () => {
  withIsolatedEnvironment((home) => {
    const repository = path.join(home, "Documents", "project-with-private-name");
    initializeRepository(repository);
    const catalog = discoverProjects({ roots: [home], includeGitMetadata: false });
    writeCatalog(catalog);

    assert.deepEqual(readCatalog(), catalog);
    assert.equal(fs.statSync(process.env.FM_PROJECT_CATALOG).mode & 0o777, 0o600);
    const summary = sanitizedSummary(catalog);
    assert.equal(summary.projectCount, 1);
    assert.equal("projects" in summary, false);
    assert.doesNotMatch(JSON.stringify(summary), /project-with-private-name/);
  });
});

test("classification separates managed, generated, reference, and FirstMate source paths", () => {
  withIsolatedEnvironment((home) => {
    const firstmate = path.join(home, "src", "firstmate");
    assert.equal(classifyProject(firstmate, "git"), "firstmate-system");
    assert.equal(
      classifyProject(path.join(firstmate, "projects", "app"), "git"),
      "managed",
    );
    assert.equal(
      classifyProject(path.join(home, "Documents", "app", ".worktrees", "feature"), "git"),
      "generated-worktree",
    );
    assert.equal(
      classifyProject(path.join(home, "Documents", "app", "vendor", "library"), "git"),
      "reference",
    );
    assert.equal(
      classifyProject(path.join(home, "Downloads", "tool.app", "Contents"), "directory"),
      "reference",
    );
    assert.equal(
      classifyProject(path.join(home, "Downloads", "sdk", "samples"), "directory"),
      "reference",
    );
    assert.equal(
      classifyProject(path.join(home, "Desktop", "scripts"), "directory"),
      "non-git-candidate",
    );
  });
});

test("review prompts are read-only, approval-gated, and use portable paths", () => {
  withIsolatedEnvironment((home) => {
    const project = {
      path: path.join(home, "Desktop", "document-automation"),
      kind: "directory",
      classification: "non-git-candidate",
    };
    const selected = selectedReviewPrompt(project);
    assert.match(selected, /\$HOME\/Desktop\/document-automation/);
    assert.match(selected, /read-only/);
    assert.match(selected, /explicit approval/);
    assert.doesNotMatch(selected, new RegExp(home.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const catalog = {
      schema: "firstmate.project-catalog.v1",
      scannedAt: new Date(0).toISOString(),
      roots: [home],
      unreadableDirectories: 0,
      projects: [project],
    };
    writeCatalog(catalog);
    const all = catalogReviewPrompt(catalog);
    assert.match(all, /private read-only project catalog/);
    assert.match(all, /sensitive document projects as opt-in/);
    assert.match(all, /Wait for my explicit approval/);
  });
});

test("interactive Computer Projects pane closes cleanly on q", () => {
  withIsolatedEnvironment(() => {
    const executablePath = fileURLToPath(
      new URL("../plugins/account-fleet/project-fleet.mjs", import.meta.url),
    );
    const result = spawnSync(process.execPath, [executablePath], {
      encoding: "utf8",
      input: "q",
      timeout: 2_000,
      env: process.env,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.signal, null);
  });
});
