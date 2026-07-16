import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(
  new URL("../.github/workflows/release.yml", import.meta.url),
  "utf8",
);

assert.match(
  workflow,
  /run: npm install -g npm@11\.5\.2/,
  "the pnpm publish bridge must use the OIDC-capable npm version that accepts pnpm git-check flags",
);
assert.doesNotMatch(
  workflow,
  /npm@latest/,
  "npm major upgrades must not silently break publishing",
);
assert.match(
  workflow,
  /id: changesets/,
  "the Changesets action needs a stable step id",
);
assert.match(
  workflow,
  /VERSION_FILE: packages\/core\/package\.json/,
  "the release PR title must read the canonical linked-package version",
);
assert.match(
  workflow,
  /title="Version Packages \(v\$version\)"/,
  "the release PR title must include the computed package version",
);

console.log("All assertions passed: SDK release workflow contracts.");
