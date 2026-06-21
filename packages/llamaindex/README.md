# @qrawl-dev/llamaindex

Official [qrawl](https://qrawl.dev) reader for LlamaIndex.TS — load web content into your index for RAG.

Returns `Document`s where `text` is clean Markdown and `metadata` carries `{ url, title, description, wordCount, crawledAt }`.

## Install

```bash
npm install @qrawl-dev/llamaindex
# peer dep
npm install llamaindex
```

## Usage

```ts
import { QrawlReader } from '@qrawl-dev/llamaindex'
import { VectorStoreIndex } from 'llamaindex'

const reader = new QrawlReader({ apiKey: process.env.QRAWL_API_KEY! })

// Scrape one page (default mode)
const docs = await reader.loadData('https://example.com')

// Crawl a whole site
const siteDocs = await reader.loadData('https://docs.example.com', {
  mode: 'crawl',
  crawlOptions: { depth: 2, maxPages: 100 },
})

// Load web search results
const searchDocs = await reader.loadData('llm evaluation frameworks', { mode: 'search' })

const index = await VectorStoreIndex.fromDocuments(siteDocs)
```

`mode` is one of `'scrape'` (default), `'crawl'`, or `'search'`. Get an API key at [qrawl.dev/dashboard](https://qrawl.dev/dashboard).

## License

MIT © Abdul Qayyum
