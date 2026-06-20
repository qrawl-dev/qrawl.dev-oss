# Contributing to qrawl

Thanks for your interest in contributing! qrawl-core is MIT-licensed open source and welcomes contributions.

## What belongs here

This repo contains the open source packages:

- `packages/core` — BFS crawler, scraper, robots.txt, rate limiter, search, monitor diff engine
- `packages/sdk`  — Thin cloud SDK client
- `packages/mcp`  — MCP server
- `packages/types` — Shared TypeScript types
- `packages/langchain`, `packages/llamaindex`, `packages/openai-tools` — Framework integrations

**The cloud platform** (`qrawl.dev`, PII detection, ToS scanning, JS rendering, billing) is proprietary and lives in a separate private repo.

## Getting started

```bash
git clone https://github.com/qrawl-dev/qrawl
cd qrawl
pnpm install
pnpm build
pnpm test
```

Requirements: Node.js 18+, pnpm 9+

## Dev workflow

```bash
# Build all packages
pnpm build

# Watch mode for a specific package
cd packages/core && pnpm dev

# Run tests
pnpm test                         # all packages
cd packages/core && pnpm test     # one package

# Run a single test file
cd packages/core && pnpm vitest run tests/search.test.ts
```

## Project structure

```
packages/
  types/        @qrawl/types — API contract (interfaces only, no runtime code)
  core/         qrawl-core   — self-hostable engine
    src/
      crawler/  BFS orchestration
      scraper/  HTML → Markdown/JSON
      robots/   robots.txt checker + cache
      ratelimiter/ per-domain token bucket
      search/   DuckDuckGo HTML scraper
      monitor/  page diff engine
      utils/    sitemap mapper
  sdk/          qrawl         — cloud SDK thin client
  mcp/          qrawl-mcp     — MCP server
  langchain/    qrawl-langchain
  llamaindex/   qrawl-llamaindex
  openai-tools/ qrawl-openai-tools
```

## Making changes

1. Fork and create a branch: `git checkout -b feat/your-feature`
2. Make changes with tests
3. Run `pnpm test` — all tests must pass
4. Run `pnpm build` — must compile cleanly
5. Open a PR against `main`

## What makes a good PR

- **Bug fixes** — always welcome. Include a test that reproduces the bug.
- **New output formats** — add to `ScrapeOptions.format` in `@qrawl/types` and handle in `scraper/index.ts`
- **robots.txt improvements** — the robots module is critical path, include edge case tests
- **Search quality** — better DDG parsing, additional fallback providers (SearXNG, Brave)
- **Framework integrations** — new integrations for Vercel AI SDK, CrewAI, AutoGen, etc.
- **Performance** — BFS concurrency, scraper speed, rate limiter accuracy

## What doesn't belong here

- Cloud-only features (PII detection, ToS scanning, JS rendering, billing, managed proxies)
- Breaking changes to `@qrawl/types` without a major version bump
- Adding dependencies that are >500kb or have restrictive licenses

## Tests

All new features need tests in `packages/<pkg>/tests/`. We use Vitest with mocked `fetch` — no real network calls in unit tests.

```ts
// Example test pattern
const mockFetch = vi.fn()
global.fetch = mockFetch

it('does the thing', async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => '...' })
  const result = await client.scrape('https://example.com')
  expect(result.page.content).toContain('...')
})
```

## Commit style

```
feat(core): add SearXNG fallback for search
fix(robots): handle malformed Crawl-Delay values
docs(mcp): add VS Code Copilot config example
test(scraper): add edge case for empty body element
```

## Questions

Open a GitHub Discussion or join us on Discord (link in README).
