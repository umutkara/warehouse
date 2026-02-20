#!/usr/bin/env node

import { execSync } from "node:child_process";

function run(command) {
  return execSync(command, { encoding: "utf8" }).trim();
}

function parseChangedFiles(output) {
  if (!output) return [];
  return output
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
}

function getDiffRange() {
  const eventName = process.env.GITHUB_EVENT_NAME || "";
  const baseRef = process.env.GITHUB_BASE_REF || "";

  if (eventName === "pull_request" && baseRef) {
    return `origin/${baseRef}...HEAD`;
  }

  try {
    run("git rev-parse HEAD~1");
    return "HEAD~1...HEAD";
  } catch {
    return "HEAD";
  }
}

function main() {
  const range = getDiffRange();
  let diffOutput = "";

  try {
    diffOutput = run(`git diff --name-only ${range}`);
  } catch (error) {
    console.log("[process-guard] Could not compute git diff; skipping check.");
    return;
  }

  const changedFiles = parseChangedFiles(diffOutput);
  if (changedFiles.length === 0) {
    console.log("[process-guard] No changed files detected.");
    return;
  }

  const touchesCriticalFlow = changedFiles.some(
    (f) => f.startsWith("app/api/"),
  );

  if (!touchesCriticalFlow) {
    console.log("[process-guard] No critical flow files changed.");
    return;
  }

  const hasTestsOrProcessDocs = changedFiles.some(
    (f) => f.startsWith("tests/") || f.startsWith("docs/process/"),
  );

  if (!hasTestsOrProcessDocs) {
    console.error("[process-guard] Blocked: critical API changes without tests/docs updates.");
    console.error("[process-guard] Add at least one change in tests/ or docs/process/.");
    process.exit(1);
  }

  console.log("[process-guard] OK: critical changes include tests/docs updates.");
}

main();
