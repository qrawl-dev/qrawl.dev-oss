/**
 * qrawl-core — Open source web crawling engine
 *
 * Self-host this package or use the managed cloud at qrawl.dev.
 * Cloud-only features (piiFilter, scanToS, jsRendering, webhook)
 * are available via `import { QrawlClient } from 'qrawl'`.
 *
 * @example
 * ```ts
 * import { QrawlCore } from 'qrawl-core'
 *
 * const client = new QrawlCore()
 * const result = await client.crawl('https://docs.example.com', { depth: 3 })
 * console.log(result.pages)
 * ```
 */

import { CrawlOptions, CrawlResult, ScrapeOptions, ScrapeResult, MapOptions, MapResult, SearchOptions, SearchResult, Page } from '@qrawl/types'
import { crawl }    from './crawler/index.js'
import { scrapePage } from './scraper/index.js'
import { map }     from './utils/map.js'
import { search }  from './search/index.js'
import { snapshot, diffContent, type PageSnapshot, type DiffResult } from './monitor/index.js'

export type { PageSnapshot, DiffResult } from './monitor/index.js'

export interface QrawlCoreOptions {
  /** Default crawl delay in ms. Default: 1000 */
  defaultCrawlDelay?: number
  /** Default output format. Default: 'markdown' */
  defaultFormat?: CrawlOptions['format']
}

export class QrawlCore {
  private opts: QrawlCoreOptions

  constructor(opts: QrawlCoreOptions = {}) {
    this.opts = opts
  }

  /**
   * Crawl a URL with BFS, returning all discovered pages.
   * Cloud-only options (piiFilter, scanToS, jsRendering) will throw.
   */
  async crawl(
    url: string,
    options: CrawlOptions = {},
    onPage?: (page: Page) => void,
  ): Promise<CrawlResult> {
    return crawl(url, {
      crawlDelay: this.opts.defaultCrawlDelay,
      format: this.opts.defaultFormat,
      ...options,
    }, onPage)
  }

  /**
   * Scrape a single URL and return structured content.
   * Cloud-only options (jsRendering, piiFilter) will throw.
   */
  async scrape(url: string, options: ScrapeOptions = {}): Promise<ScrapeResult> {
    const start = Date.now()
    const page = await scrapePage(url, {
      format: this.opts.defaultFormat,
      ...options,
    })
    return { url, page, elapsedMs: Date.now() - start }
  }

  /**
   * Discover all URLs on a domain via sitemap.xml or BFS link discovery.
   */
  async map(url: string, options: MapOptions = {}): Promise<MapResult> {
    return map(url, options)
  }

  /**
   * Search the web and return results with optional full-page content.
   * Uses DuckDuckGo — no API key required.
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult> {
    return search(query, options)
  }

  /**
   * Take a snapshot of a page for change detection.
   * @param cssSelector  Scope comparison to this selector only
   */
  async snapshot(url: string, cssSelector?: string): Promise<PageSnapshot> {
    return snapshot(url, cssSelector)
  }

  /**
   * Diff two page content strings and return a structured change report.
   */
  diff(oldContent: string, newContent: string): DiffResult {
    return diffContent(oldContent, newContent)
  }
}

// Named exports for tree-shaking / direct use
export { crawl, scrapePage as scrape, map, search }

// Re-export types
export type {
  CrawlOptions,
  CrawlResult,
  ScrapeOptions,
  ScrapeResult,
  MapOptions,
  MapResult,
  SearchOptions,
  SearchResult,
  SearchResultItem,
  Page,
  PageMetadata,
  SkipReason,
  RobotsResult,
  QrawlError,
  QrawlErrorCode,
} from '@qrawl/types'
