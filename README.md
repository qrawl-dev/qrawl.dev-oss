# qrawl — Open Source Web Crawling for AI Agents

The core crawling engine behind [qrawl.dev](https://qrawl.dev).  
Self-host the engine or use the managed cloud at qrawl.dev.

## Packages

| Package | Description | Install |
|---------|-------------|---------|
| `@qrawl/types` | Shared TypeScript types | `npm i @qrawl/types` |
| `qrawl-core` | Self-hostable BFS crawler engine | `npm i qrawl-core` |
| `qrawl` | Cloud SDK — hits api.qrawl.dev | `npm i qrawl` |
| `qrawl-mcp` | MCP server for Claude/Cursor/Windsurf | `npx qrawl-mcp` |
| `qrawl-langchain` | LangChain document loader + tools | `npm i qrawl-langchain` |
| `qrawl-llamaindex` | LlamaIndex reader + function tools | `npm i qrawl-llamaindex` |
| `qrawl-openai-tools` | OpenAI function calling + Agents SDK | `npm i qrawl-openai-tools` |

## Quick start (self-hosted, no key)

```ts
import { QrawlCore } from 'qrawl-core'

const client = new QrawlCore()

// Scrape a page
const page = await client.scrape('https://example.com')
console.log(page.page.content)  // Markdown

// Crawl a site
const result = await client.crawl('https://docs.example.com', { depth: 3 })
console.log(`Crawled ${result.pagesCrawled} pages`)

// Search the web
const search = await client.search('web scraping best practices')
console.log(search.results)

// Map all URLs on a domain
const map = await client.map('https://example.com')
console.log(`Found ${map.total} URLs`)
```

## Quick start (cloud — more features)

```ts
import { QrawlClient } from 'qrawl'

const client = new QrawlClient({ apiKey: 'qr-YOUR_KEY' })

// All the above methods, plus:
const result = await client.crawl('https://docs.example.com', {
  piiFilter:   true,   // redact emails/phones/SSNs
  scanToS:     true,   // check Terms of Service
  jsRendering: true,   // headless Chrome for SPAs
  webhook:     'https://my-server.com/hook',
})
```

## MCP (Claude Desktop, Cursor, Windsurf)

```json
{
  "mcpServers": {
    "qrawl": {
      "command": "npx",
      "args": ["-y", "qrawl-mcp"],
      "env": { "QRAWL_API_KEY": "qr-YOUR_KEY" }
    }
  }
}
```

## LangChain

```ts
import { QrawlLoader, QrawlSearchTool } from 'qrawl-langchain'

const loader = new QrawlLoader({
  apiKey: 'qr-YOUR_KEY',
  url: 'https://docs.example.com',
  mode: 'crawl',
  crawlOptions: { depth: 3, maxPages: 100 },
})
const docs = await loader.load()  // → Document[]
```

## LlamaIndex

```ts
import { QrawlReader } from 'qrawl-llamaindex'

const reader = new QrawlReader({ apiKey: 'qr-YOUR_KEY' })
const docs   = await reader.loadData('https://docs.example.com', {
  mode: 'crawl',
  crawlOptions: { depth: 3 },
})
```

## OpenAI Agents / Function Calling

```ts
import { qrawlTools, executeQrawlFunction } from 'qrawl-openai-tools'
import OpenAI from 'openai'

const openai = new OpenAI()

// Agents SDK
const runner = await openai.beta.chat.completions.runTools({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Search for the latest Next.js 15 features' }],
  tools: qrawlTools({ apiKey: 'qr-YOUR_KEY' }),
})
```

## Self-hosting with Docker

```bash
docker compose up
# API available at http://localhost:3001
```

## License

MIT — `qrawl-core`, `qrawl`, `qrawl-mcp`, `qrawl-langchain`, `qrawl-llamaindex`, `qrawl-openai-tools`  
Proprietary — qrawl.dev cloud platform
