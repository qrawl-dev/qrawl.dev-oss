# qrawl

Official SDK for the [qrawl.dev](https://qrawl.dev) cloud API — crawl, scrape, map, and search the web on managed infrastructure, with JS rendering, PII filtering, and webhooks.

## Install

```bash
npm install qrawl
```

## Usage

Get an API key at [qrawl.dev/dashboard](https://qrawl.dev/dashboard).

```ts
import { QrawlClient } from 'qrawl'

const qrawl = new QrawlClient({ apiKey: process.env.QRAWL_API_KEY! })

// Scrape a single page
const { page } = await qrawl.scrape('https://example.com', { jsRendering: true })
console.log(page.content)

// Crawl a site, streaming pages as they arrive
const result = await qrawl.crawl('https://docs.example.com', { depth: 2, maxPages: 100 }, (page) => {
  console.log('got', page.url)
})

// Map a domain's URLs
const { urls } = await qrawl.map('https://example.com')

// Search the web
const hits = await qrawl.search('best vector databases', { limit: 10, scrapeContent: true })
```

### Async crawls with webhooks

Pass a `webhook` to submit a crawl asynchronously and receive results when it completes:

```ts
await qrawl.crawl('https://big-site.com', { webhook: 'https://your-app.com/qrawl-callback' })
```

## Cloud vs. self-hosted

This SDK talks to the managed qrawl.dev API and supports cloud-only options (`jsRendering`, `piiFilter`, `scanToS`, webhooks). For a fully local, no-key crawler, use [`qrawl-core`](https://www.npmjs.com/package/qrawl-core). Point `baseUrl` at your own deployment if you self-host the cloud.

## License

MIT © Abdul Qayyum
