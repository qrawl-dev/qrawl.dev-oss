/**
 * qrawl-llamaindex
 *
 * Provides LlamaIndex.TS integrations:
 *   - QrawlReader:         BaseReader for loading web content as nodes
 *   - QrawlWebSearchTool:  FunctionTool for web search in agent workflows
 *
 * @example
 * ```ts
 * import { QrawlReader } from 'qrawl-llamaindex'
 * import { VectorStoreIndex } from 'llamaindex'
 *
 * // Load and index an entire docs site
 * const reader = new QrawlReader({ apiKey: 'qr-YOUR_KEY' })
 * const docs   = await reader.loadData('https://docs.example.com', {
 *   mode: 'crawl',
 *   crawlOptions: { depth: 3, maxPages: 50 },
 * })
 * const index = await VectorStoreIndex.fromDocuments(docs)
 * const engine = index.asQueryEngine()
 * const response = await engine.query({ query: 'How do I authenticate?' })
 * ```
 */

import { QrawlClient }   from 'qrawl'
import type {
  CrawlOptions,
  ScrapeOptions,
  SearchOptions,
  Page,
} from '@qrawl/types'

// LlamaIndex types — imported as interfaces so we don't need a hard dep at runtime
export interface LlamaDocument {
  getText(): string
  id_: string
  metadata: Record<string, string>
}

export type LoaderMode = 'scrape' | 'crawl' | 'search'

export interface QrawlReaderLoadOptions {
  mode?: LoaderMode
  crawlOptions?: CrawlOptions
  scrapeOptions?: ScrapeOptions
  searchOptions?: SearchOptions
}

// ── QrawlReader ───────────────────────────────────────────────────

/**
 * LlamaIndex BaseReader-compatible reader for qrawl.
 *
 * Returns Document[] where each Document has:
 *   text     = Markdown page content
 *   metadata = { url, title, description, wordCount, crawledAt }
 */
export class QrawlReader {
  private client: QrawlClient

  constructor({ apiKey }: { apiKey: string }) {
    this.client = new QrawlClient({ apiKey })
  }

  /**
   * @param urlOrQuery  URL to scrape/crawl, or search query string
   * @param options     mode + optional API options
   */
  async loadData(
    urlOrQuery: string,
    options: QrawlReaderLoadOptions = {},
  ): Promise<QrawlDocument[]> {
    const { mode = 'scrape' } = options

    switch (mode) {
      case 'scrape': {
        const r = await this.client.scrape(urlOrQuery, {
          format: 'markdown',
          ...options.scrapeOptions,
        })
        return [toDocument(r.page)]
      }

      case 'crawl': {
        const r = await this.client.crawl(urlOrQuery, {
          format: 'markdown',
          ...options.crawlOptions,
        })
        return r.pages.map(toDocument)
      }

      case 'search': {
        const r = await this.client.search(urlOrQuery, {
          scrapeContent: true,
          format: 'markdown',
          ...options.searchOptions,
        })
        return r.results
          .filter((r) => r.page)
          .map((r) => toDocument(r.page!))
      }
    }
  }
}

// ── QrawlDocument ─────────────────────────────────────────────────

export class QrawlDocument {
  text: string
  id_: string
  metadata: Record<string, string>

  constructor(text: string, metadata: Record<string, string>) {
    this.text     = text
    this.id_      = metadata.url ?? Math.random().toString(36).slice(2)
    this.metadata = metadata
  }

  getText() { return this.text }
}

function toDocument(page: Page): QrawlDocument {
  return new QrawlDocument(page.content, {
    url:         page.url,
    title:       page.title ?? '',
    description: page.metadata.description ?? '',
    wordCount:   String(page.metadata.wordCount),
    crawledAt:   page.crawledAt,
    source:      page.url,
  })
}

// ── QrawlWebSearchTool ────────────────────────────────────────────

export interface QrawlWebSearchToolOptions {
  apiKey: string
  limit?: number
  scrapeContent?: boolean
}

/**
 * LlamaIndex FunctionTool-compatible tool for web search.
 *
 * Drop into any LlamaIndex agent:
 * ```ts
 * import { ReActAgent } from 'llamaindex'
 * import { QrawlWebSearchTool } from 'qrawl-llamaindex'
 *
 * const agent = new ReActAgent({
 *   tools: [new QrawlWebSearchTool({ apiKey: 'qr-YOUR_KEY' })],
 * })
 * ```
 */
export class QrawlWebSearchTool {
  metadata = {
    name:        'qrawl_web_search',
    description: 'Search the web for current information. Input: search query string. Returns formatted results with titles, URLs, and content.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
        limit: { type: 'number', description: 'Number of results (1-20)', default: 5 },
      },
      required: ['query'],
    },
  }

  private client: QrawlClient
  private defaultLimit: number
  private scrapeContent: boolean

  constructor(opts: QrawlWebSearchToolOptions) {
    this.client        = new QrawlClient({ apiKey: opts.apiKey })
    this.defaultLimit  = opts.limit ?? 5
    this.scrapeContent = opts.scrapeContent ?? false
  }

  async call({ query, limit }: { query: string; limit?: number }): Promise<string> {
    const result = await this.client.search(query, {
      limit: limit ?? this.defaultLimit,
      scrapeContent: this.scrapeContent,
    })

    if (result.results.length === 0) return `No results found for: "${query}"`

    return result.results.map((r, i) =>
      [
        `${i + 1}. **${r.title}**`,
        `   URL: ${r.url}`,
        `   ${r.description}`,
        r.content ? `\n${r.content.slice(0, 1200)}\n` : '',
      ].filter(Boolean).join('\n')
    ).join('\n---\n')
  }
}

// ── QrawlScrapePageTool ───────────────────────────────────────────

/**
 * LlamaIndex FunctionTool for scraping a specific URL.
 */
export class QrawlScrapePageTool {
  metadata = {
    name:        'qrawl_scrape_page',
    description: 'Fetch and read the content of a specific URL. Input: URL string. Returns Markdown content.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to scrape' },
      },
      required: ['url'],
    },
  }

  private client: QrawlClient

  constructor({ apiKey }: { apiKey: string }) {
    this.client = new QrawlClient({ apiKey })
  }

  async call({ url }: { url: string }): Promise<string> {
    const result = await this.client.scrape(url, { format: 'markdown' })
    return `# ${result.page.title ?? url}\n\n${result.page.content}`
  }
}
