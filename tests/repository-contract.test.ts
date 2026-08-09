import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

test('interview records live under docs', () => {
  expect(existsSync('INTERVIEW.md')).toBe(false)
  expect(existsSync('FIRST-PLAYABLE-INTERVIEW.md')).toBe(false)
  expect(existsSync('docs/INTERVIEW.md')).toBe(true)
  expect(existsSync('docs/FIRST-PLAYABLE-INTERVIEW.md')).toBe(true)
})

test('Next exports a prefix-aware static site for GitHub Pages', () => {
  const config = read('next.config.ts')

  expect(config).toMatch(/output: "export"/)
  expect(config).toMatch(/GITHUB_REPOSITORY/)
  expect(config).toMatch(/basePath: pagesBasePath/)
  expect(config).toMatch(/assetPrefix: pagesBasePath/)
  expect(config).toMatch(/unoptimized: true/)
})

test('Pages workflow validates pull requests and deploys only trusted runs', () => {
  const workflow = read('.github/workflows/pages.yml')

  expect(workflow).toMatch(/pull_request:/)
  expect(workflow).toMatch(/run: pnpm install --frozen-lockfile/)
  expect(workflow).toMatch(/run: pnpm test/)
  expect(workflow).toMatch(/run: pnpm build/)
  expect(workflow).toMatch(/if: github\.event_name != 'pull_request'/)
  expect(workflow).toMatch(/pages: write/)
  expect(workflow).toMatch(/id-token: write/)
  expect(workflow).toMatch(/uses: actions\/checkout@v7/)
  expect(workflow).toMatch(/uses: pnpm\/action-setup@v4/)
  expect(workflow).toMatch(/uses: actions\/setup-node@v7/)
  expect(workflow).toMatch(/uses: actions\/upload-pages-artifact@v5/)
  expect(workflow).toMatch(/uses: actions\/deploy-pages@v5/)
})
