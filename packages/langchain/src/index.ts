/**
 * @qrawl-dev/langchain
 *
 * Provides two LangChain integrations:
 *   - QrawlLoader:     Document loader for crawl/scrape → Document[]
 *   - QrawlSearchTool: Tool for search → grounded web results
 *
 * @example
 * ```ts
 * import { QrawlLoader } from '@qrawl-dev/langchain'
 * import { ChatOpenAI } from '@langchain/openai'
 * import { RetrievalQAChain } from 'langchain/chains'
 * import { MemoryVectorStore } from 'langchain/vectorstores/memory'
 * import { OpenAIEmbeddings } from '@langchain/openai'
 *
 * // Load an entire docs site into a vector store
 * const loader = new QrawlLoader({
 *   apiKey: 'qr-YOUR_KEY',
 *   url: 'https://docs.example.com',
 *   mode: 'crawl',
 *   crawlOptions: { depth: 3, maxPages: 100 },
 * })
 *
 * const docs = await loader.load()
 * const store = await MemoryVectorStore.fromDocuments(docs, new OpenAIEmbeddings())
 * ```
 */

import { BaseDocumentLoader }   from '@langchain/core/document_loaders/base'
import { Document }             from '@langchain/core/documents'
import { Tool }                 from '@langchain/core/tools'
import { QrawlClient }          from 'qrawl'
import type {
  CrawlOptions,
  ScrapeOptions,
  SearchOptions,
  Page,
} from '@qrawl-dev/types'

// ── QrawlLoader ───────────────────────────────────────────────────

export type LoaderMode = 'scrape' | 'crawl' | 'search'

export interface QrawlLoaderOptions {
  /** qrawl.dev API key */
  apiKey: string
  /** The URL to scrape/crawl, or the search query */
  url: string
  /** scrape: single page, crawl: full site, search: web search */
  mode?: LoaderMode
  /** Options for crawl mode */
  crawlOptions?: CrawlOptions
  /** Options for scrape mode */
  scrapeOptions?: ScrapeOptions
  /** Options for search mode */
  searchOptions?: SearchOptions
}

/**
 * LangChain Document Loader for qrawl.
 *
 * Each crawled/scraped page becomes one Document.
 * pageContent  = Markdown content
 * metadata     = { url, title, description, wordCount, crawledAt, source }
 */
export class QrawlLoader extends BaseDocumentLoader {
  private client: QrawlClient
  private opts: Required<Pick<QrawlLoaderOptions, 'url' | 'mode'>> & QrawlLoaderOptions

  constructor(options: QrawlLoaderOptions) {
    super()
    this.client = new QrawlClient({ apiKey: options.apiKey })
    this.opts   = { mode: 'scrape', ...options }
  }

  async load(): Promise<Document[]> {
    switch (this.opts.mode) {
      case 'scrape':  return this.loadScrape()
      case 'crawl':   return this.loadCrawl()
      case 'search':  return this.loadSearch()
    }
  }

  private async loadScrape(): Promise<Document[]> {
    const result = await this.client.scrape(this.opts.url, {
      format: 'markdown',
      ...this.opts.scrapeOptions,
    })
    return [pageToDocument(result.page)]
  }

  private async loadCrawl(): Promise<Document[]> {
    const result = await this.client.crawl(this.opts.url, {
      format: 'markdown',
      ...this.opts.crawlOptions,
    })
    return result.pages.map(pageToDocument)
  }

  private async loadSearch(): Promise<Document[]> {
    const result = await this.client.search(this.opts.url, {
      scrapeContent: true,
      format: 'markdown',
      ...this.opts.searchOptions,
    })
    return result.results
      .filter((r) => r.page)
      .map((r) => pageToDocument(r.page!))
  }
}

function pageToDocument(page: Page): Document {
  return new Document({
    pageContent: page.content,
    metadata: {
      source:      page.url,
      url:         page.url,
      title:       page.title ?? '',
      description: page.metadata.description ?? '',
      wordCount:   page.metadata.wordCount,
      crawledAt:   page.crawledAt,
      ogImage:     page.metadata.ogImage ?? '',
    },
  })
}

// ── QrawlSearchTool ───────────────────────────────────────────────

export interface QrawlSearchToolOptions {
  apiKey: string
  /** Default number of results. Default: 5 */
  limit?: number
  /** Scrape full content for each result. Default: false */
  scrapeContent?: boolean
}

/**
 * LangChain Tool that searches the web via qrawl and returns
 * formatted results the LLM can reason over.
 *
 * @example
 * ```ts
 * import { QrawlSearchTool } from '@qrawl-dev/langchain'
 * import { AgentExecutor, createToolCallingAgent } from 'langchain/agents'
 *
 * const tools = [new QrawlSearchTool({ apiKey: 'qr-YOUR_KEY' })]
 * ```
 */
export class QrawlSearchTool extends Tool {
  name        = 'qrawl_search'
  description = [
    'Search the web for current information.',
    'Input: a search query string.',
    'Output: formatted list of web results with titles, URLs, and snippets.',
    'Use this when you need up-to-date information not in your training data.',
  ].join(' ')

  private client: QrawlClient
  private limit: number
  private scrapeContent: boolean

  constructor(options: QrawlSearchToolOptions) {
    super()
    this.client       = new QrawlClient({ apiKey: options.apiKey })
    this.limit        = options.limit ?? 5
    this.scrapeContent = options.scrapeContent ?? false
  }

  async _call(query: string): Promise<string> {
    const result = await this.client.search(query, {
      limit: this.limit,
      scrapeContent: this.scrapeContent,
    })

    if (result.results.length === 0) {
      return `No results found for: ${query}`
    }

    return result.results.map((r, i) =>
      [
        `[${i + 1}] ${r.title}`,
        `URL: ${r.url}`,
        `Summary: ${r.description}`,
        r.content ? `Content:\n${r.content.slice(0, 1500)}` : '',
      ].filter(Boolean).join('\n')
    ).join('\n\n---\n\n')
  }
}

// ── QrawlScrapeTool ───────────────────────────────────────────────

/**
 * LangChain Tool that scrapes a specific URL.
 * The agent passes the URL as input.
 */
export class QrawlScrapeTool extends Tool {
  name        = 'qrawl_scrape'
  description = [
    'Scrape the content of a specific URL and return it as Markdown.',
    'Input: a valid http/https URL.',
    'Output: the page title and full Markdown content.',
    'Use this when you have a specific URL and need to read its contents.',
  ].join(' ')

  private client: QrawlClient

  constructor({ apiKey }: { apiKey: string }) {
    super()
    this.client = new QrawlClient({ apiKey })
  }

  async _call(url: string): Promise<string> {
    const trimmed = url.trim()
    if (!trimmed.startsWith('http')) {
      return `Error: input must be a valid URL, got: ${trimmed}`
    }
    const result = await this.client.scrape(trimmed, { format: 'markdown' })
    return `# ${result.page.title ?? trimmed}\n\n${result.page.content}`
  }
}
