# qrawl-core

Self-hostable BFS web crawler engine — the open-source core that powers [qrawl.dev](https://qrawl.dev).

Crawl, scrape, map, and search the web and get back clean Markdown (or JSON / HTML / text). Runs entirely in your own process — no API key required.

## Install

```bash
npm install qrawl-core
```

## Usage

```ts
import { QrawlCore } from 'qrawl-core'

const qrawl = new QrawlCore({ defaultFormat: 'markdown' })

// Scrape a single page
const { page } = await qrawl.scrape('https://example.com')
console.log(page.content)

// Crawl a site with BFS (stream pages as they arrive)
const result = await qrawl.crawl('https://docs.example.com', { depth: 2, maxPages: 50 }, (page) => {
  console.log('crawled', page.url)
})

// Discover URLs without downloading content
const { urls } = await qrawl.map('https://example.com')

// Search the web (DuckDuckGo — no API key needed)
const hits = await qrawl.search('open source web crawler', { limit: 5 })
```

You can also import the functions directly for tree-shaking:

```ts
import { crawl, scrape, map, search } from 'qrawl-core'
```

## Core vs. Cloud

`qrawl-core` runs locally and covers crawl, scrape, map, search, and change-detection (`snapshot` / `diff`). Cloud-only options — `jsRendering`, `piiFilter`, `scanToS`, and webhooks — throw if used here; reach for the managed [`qrawl`](https://www.npmjs.com/package/qrawl) SDK against [qrawl.dev](https://qrawl.dev) when you need them.

## License

MIT © Abdul Qayyum
