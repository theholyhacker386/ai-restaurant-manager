#!/usr/bin/env node

/**
 * EOL (End-of-Life) Monitoring Script
 * Checks key dependencies for outdated/EOL versions.
 * Run: node scripts/check-eol.mjs
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8")
);

// Known supported versions (update periodically)
const supportedVersions = {
  next: { min: "15.0.0", current: "16", eol: null, note: "Next.js 14 is maintenance mode" },
  react: { min: "18.0.0", current: "19", eol: null, note: "React 17 is EOL" },
  "react-dom": { min: "18.0.0", current: "19", eol: null, note: "React DOM 17 is EOL" },
  typescript: { min: "5.0.0", current: "5", eol: null, note: "TypeScript 4.x is EOL" },
};

// Node.js EOL schedule
const nodeEOL = {
  18: "2025-04-30",
  20: "2026-04-30",
  22: "2027-04-30",
};

console.log("=== EOL Software Check ===\n");

// Check Node.js version
const nodeVersion = process.version;
const nodeMajor = parseInt(nodeVersion.slice(1));
console.log(`Node.js: ${nodeVersion}`);
if (nodeEOL[nodeMajor]) {
  const eolDate = new Date(nodeEOL[nodeMajor]);
  const now = new Date();
  const daysUntilEOL = Math.ceil((eolDate - now) / (1000 * 60 * 60 * 24));
  if (daysUntilEOL < 0) {
    console.log(`  PAST EOL (expired ${nodeEOL[nodeMajor]})`);
  } else if (daysUntilEOL < 180) {
    console.log(`  WARNING: Approaching EOL: ${nodeEOL[nodeMajor]} (${daysUntilEOL} days)`);
  } else {
    console.log(`  OK: Supported until ${nodeEOL[nodeMajor]}`);
  }
} else if (nodeMajor % 2 !== 0) {
  console.log("  WARNING: Odd-numbered Node.js version (not LTS)");
} else {
  console.log("  OK: Current LTS");
}

console.log("\n--- Dependencies ---\n");

const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
let warnings = 0;

for (const [name, info] of Object.entries(supportedVersions)) {
  const installed = allDeps[name];
  if (!installed) continue;

  // Strip version prefix (^, ~, etc.)
  const version = installed.replace(/[\^~>=<]/g, "");
  const major = parseInt(version);

  const currentMajor = parseInt(info.current);
  const minMajor = parseInt(info.min);

  if (major < minMajor) {
    console.log(`${name}: ${installed}`);
    console.log(`  OUTDATED - ${info.note}`);
    warnings++;
  } else if (major < currentMajor) {
    console.log(`${name}: ${installed}`);
    console.log(`  Not latest major (current: ${info.current})`);
    warnings++;
  } else {
    console.log(`${name}: ${installed}`);
    console.log(`  OK: Current`);
  }
}

console.log(`\n--- Summary ---`);
console.log(`Total warnings: ${warnings}`);
if (warnings === 0) {
  console.log("All monitored packages are current.");
} else {
  console.log("Review warnings above and plan updates.");
}
