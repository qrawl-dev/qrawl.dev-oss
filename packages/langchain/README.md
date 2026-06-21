# @qrawl-dev/langchain

Official [qrawl](https://qrawl.dev) document loader for LangChain — turn web pages into `Document`s for your RAG pipelines.

Each scraped/crawled page becomes one `Document` whose `pageContent` is clean Markdown and whose `metadata` carries `{ url, title, description, wordCount, crawledAt, source }`.

## Install

```bash
npm install @qrawl-dev/langchain
# peer deps
npm install @langchain/core
```

## Usage

```ts
import { QrawlLoader } from '@qrawl-dev/langchain'

// Scrape a single page
const loader = new QrawlLoader({
  apiKey: process.env.QRAWL_API_KEY!,
  url: 'https://example.com',
  mode: 'scrape',
})
const docs = await loader.load()

// Crawl an entire docs site
const crawlLoader = new QrawlLoader({
  apiKey: process.env.QRAWL_API_KEY!,
  url: 'https://docs.example.com',
  mode: 'crawl',
  crawlOptions: { depth: 2, maxPages: 100 },
})
const allDocs = await crawlLoader.load()

// Or load web search results as documents
const searchLoader = new QrawlLoader({
  apiKey: process.env.QRAWL_API_KEY!,
  url: 'vector database comparison',
  mode: 'search',
})
```

`mode` is one of `'scrape'` (single page, default), `'crawl'` (full site), or `'search'` (web search). Get an API key at [qrawl.dev/dashboard](https://qrawl.dev/dashboard).

## License

MIT © Abdul Qayyum
