import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("interview records live under docs", () => {
  assert.equal(existsSync("INTERVIEW.md"), false);
  assert.equal(existsSync("FIRST-PLAYABLE-INTERVIEW.md"), false);
  assert.equal(existsSync("docs/INTERVIEW.md"), true);
  assert.equal(existsSync("docs/FIRST-PLAYABLE-INTERVIEW.md"), true);
});

test("Next exports a prefix-aware static site for GitHub Pages", () => {
  const config = read("next.config.ts");

  assert.match(config, /output: "export"/);
  assert.match(config, /GITHUB_REPOSITORY/);
  assert.match(config, /basePath: pagesBasePath/);
  assert.match(config, /assetPrefix: pagesBasePath/);
  assert.match(config, /unoptimized: true/);
});

test("Pages workflow validates pull requests and deploys only trusted runs", () => {
  const workflow = read(".github/workflows/pages.yml");

  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /run: npm ci/);
  assert.match(workflow, /run: npm test/);
  assert.match(workflow, /run: npm run build/);
  assert.match(workflow, /if: github\.event_name != 'pull_request'/);
  assert.match(workflow, /pages: write/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /uses: actions\/checkout@v7/);
  assert.match(workflow, /uses: actions\/setup-node@v7/);
  assert.match(workflow, /uses: actions\/upload-pages-artifact@v5/);
  assert.match(workflow, /uses: actions\/deploy-pages@v5/);
});
