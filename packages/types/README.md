# @qrawl-dev/types

Shared TypeScript types for the [qrawl](https://qrawl.dev) packages.

This package defines the common option and result shapes used across `qrawl-core`, the `qrawl` cloud SDK, and the framework integrations — `CrawlOptions`, `ScrapeOptions`, `MapOptions`, `SearchOptions`, `OutputFormat`, `SearchResultItem`, and more.

You usually don't install this directly; it comes in as a dependency of the package you're using. Install it explicitly only when you're building your own integration on top of qrawl.

## Install

```bash
npm install @qrawl-dev/types
```

## Usage

```ts
import type { CrawlOptions, OutputFormat, SearchResultItem } from '@qrawl-dev/types'

const options: CrawlOptions = { depth: 2, maxPages: 50, format: 'markdown' }
```

## License

MIT © Abdul Qayyum
