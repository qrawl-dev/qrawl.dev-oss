# Show HN: qrawl – Open source web crawling for AI agents (self-host or cloud)

**URL:** https://github.com/qrawl-dev/qrawl

---

Hi HN,

I built qrawl — an open source web crawling engine designed specifically for AI agents and RAG pipelines.

**The core problem:** Every time I built an AI app that needed live web data, I ended up writing the same scraping infrastructure from scratch. Headless fetch, Markdown conversion, robots.txt checking, rate limiting — it's tedious, fragile, and completely orthogonal to the actual product I was building. Firecrawl is great but I wanted something I could self-host and extend, and something with compliance baked in from the start rather than bolted on.

**What it does:**

- `crawl(url)` — BFS crawler that returns clean Markdown from every page on a site
- `scrape(url)` — Single page → Markdown, JSON, HTML, or plain text
- `search(query)` — Web search returning full page content, not just snippets
- `map(url)` — Discover all URLs on a domain via sitemap or link discovery
- `batchScrape(urls[])` — Scrape multiple URLs concurrently

Everything respects robots.txt by default and rate-limits per domain automatically.

**Self-hostable with no API key:**

```bash
npm install qrawl-core
```

```ts
import { QrawlCore } from 'qrawl-core'
const client = new QrawlCore()
const result = await client.crawl('https://docs.example.com', { depth: 3 })
```

**MCP server — one line to connect Claude/Cursor/Windsurf:**

```json
{
  "mcpServers": {
    "qrawl": {
      "command": "npx",
      "args": ["-y", "qrawl-mcp"],
      "env": { "QRAWL_API_KEY": "qr-..." }
    }
  }
}
```

**Framework integrations included:** LangChain, LlamaIndex, OpenAI Agents SDK — `npm install qrawl-langchain` etc.

**The cloud version** (qrawl.dev) adds PII detection, ToS scanning, JS rendering (headless Chromium), managed proxies, and page change monitoring. The open source package calls `qrawl-core` as a regular dependency — the cloud is just a power-user of the same engine.

---

**Why ethical crawling matters:** Most crawlers either ignore robots.txt or make it opt-in. qrawl enforces it by default. The cloud tier runs LLM-powered ToS scanning before the first request and NER-based PII redaction before the data hits your pipeline. The compliance angle was the thing I kept running into on enterprise projects — it's not glamorous but it's a real requirement.

**Tech stack:** TypeScript monorepo (pnpm workspaces), Hono API, BullMQ queue workers, Prisma + PostgreSQL, Next.js dashboard. The search engine uses DuckDuckGo HTML scraping (no key needed), with Serper/Brave as drop-in upgrades.

**What I'd love feedback on:**

1. The API surface — does the method naming / options shape feel right for how you'd use this in an agent?
2. The compliance framing — is this a feature or a footnote for your use cases?
3. What's missing — what would make you switch from whatever you're using today?

Source: https://github.com/qrawl-dev/qrawl  
Cloud: https://qrawl.dev  
Docs: https://docs.qrawl.dev

---

*Edit: Thanks for the responses — answering questions as fast as I can.*
