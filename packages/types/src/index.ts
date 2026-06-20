// ─────────────────────────────────────────────────────────────────
// @qrawl-dev/types — single source of truth for the API contract
// Imported by: qrawl-core, qrawl (SDK), qrawl-cloud (private repo)
// ─────────────────────────────────────────────────────────────────

// ── Input options ─────────────────────────────────────────────────

export type OutputFormat = 'markdown' | 'json' | 'html' | 'text'

export interface CrawlOptions {
  /** Max BFS depth from the seed URL. Default: 3 */
  depth?: number
  /** Max pages to crawl. Default: 500 */
  maxPages?: number
  /** Output format. Default: 'markdown' */
  format?: OutputFormat
  /** Respect robots.txt. Default: true (cannot be disabled on cloud) */
  respectRobots?: boolean
  /** Delay between requests in ms. Default: 1000 */
  crawlDelay?: number
  /** Only follow links on the same domain. Default: true */
  sameDomain?: boolean
  /** URL patterns to skip (regex strings) */
  exclude?: string[]
  /** URL patterns to include exclusively (regex strings) */
  include?: string[]

  // ── Cloud-only options ──────────────────────────────────────────
  // These are ignored by qrawl-core and throw CLOUD_FEATURE errors
  // when passed to QrawlCore directly. The cloud API uses them.

  /** [CLOUD] Detect and redact PII before returning content */
  piiFilter?: boolean
  /** [CLOUD] LLM-powered ToS scan before crawling starts */
  scanToS?: boolean
  /** [CLOUD] Use JS rendering via headless Chromium fleet */
  jsRendering?: boolean
  /** [CLOUD] POST results to this webhook URL when done */
  webhook?: string
}

export interface ScrapeOptions {
  format?: OutputFormat
  screenshot?: boolean
  /** Wait for this CSS selector to appear before scraping */
  waitFor?: string
  // Cloud-only
  jsRendering?: boolean
  piiFilter?: boolean
}

export interface MapOptions {
  depth?: number
  includeExternal?: boolean
}

export interface SearchOptions {
  /** Max number of results to return. Default: 10 */
  limit?: number
  /** Scrape full page content for each result. Default: false */
  scrapeContent?: boolean
  /** Output format when scrapeContent is true. Default: 'markdown' */
  format?: OutputFormat
  /** Only return results from this domain */
  site?: string
  /** Filter results after this date (ISO 8601) */
  after?: string
  /** Filter results before this date (ISO 8601) */
  before?: string
  // Cloud-only
  /** [CLOUD] Include image results */
  includeImages?: boolean
  /** [CLOUD] Include news results */
  includeNews?: boolean
}

export interface SearchResultItem {
  url: string
  title: string
  description: string
  /** Full page content — only present when scrapeContent: true */
  content?: string
  /** Scraped page — only present when scrapeContent: true */
  page?: Page
  position: number
  publishedAt?: string
  source?: string
}

export interface SearchResult {
  query: string
  results: SearchResultItem[]
  total: number
  elapsedMs: number
  // Cloud-only
  images?: Array<{ url: string; imageUrl: string; title: string; width: number; height: number }>
  news?: Array<{ url: string; title: string; snippet: string; date: string }>
}

// ── Output types ──────────────────────────────────────────────────

export interface Page {
  url: string
  title: string | null
  content: string
  format: OutputFormat
  statusCode: number
  crawledAt: string        // ISO 8601
  metadata: PageMetadata
  screenshot?: string      // base64 PNG — only when scrapeOptions.screenshot = true
}

export interface PageMetadata {
  description?: string
  ogImage?: string
  author?: string
  publishedAt?: string
  wordCount: number
  links: string[]          // all hrefs found on the page
}

export interface CrawlResult {
  id: string               // job UUID
  url: string              // seed URL
  status: 'complete' | 'partial' | 'failed'
  pages: Page[]
  pagesDiscovered: number
  pagesCrawled: number
  pagesSkipped: number
  skippedReasons: SkipReason[]
  elapsedMs: number
  startedAt: string        // ISO 8601
  completedAt: string      // ISO 8601
  // Cloud-only fields — undefined in qrawl-core output
  piiRedacted?: number
  tosFlags?: TosFlag[]
  compliant?: boolean
}

export interface ScrapeResult {
  url: string
  page: Page
  elapsedMs: number
  piiRedacted?: number     // cloud-only
}

export interface MapResult {
  url: string
  urls: string[]
  total: number
  elapsedMs: number
}

export interface SkipReason {
  url: string
  reason: 'robots' | 'excluded' | 'max-depth' | 'max-pages' | 'error' | 'tos'
  detail?: string
}

export interface TosFlag {
  url: string
  clause: string
  severity: 'warn' | 'block'
}

export interface RobotsResult {
  allowed: boolean
  reason?: string
  crawlDelay?: number
}

// ── Error types ───────────────────────────────────────────────────

export type QrawlErrorCode =
  | 'INVALID_URL'
  | 'ROBOTS_BLOCKED'
  | 'TOS_BLOCKED'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'CLOUD_FEATURE'        // thrown by core when cloud-only option is passed
  | 'UNAUTHORIZED'
  | 'QUOTA_EXCEEDED'
  | 'INTERNAL'

export class QrawlError extends Error {
  constructor(
    public readonly code: QrawlErrorCode,
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message)
    this.name = 'QrawlError'
  }
}

// ── Cloud API envelope ────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: { code: QrawlErrorCode; message: string }
  requestId: string
}

// ── Batch scrape ──────────────────────────────────────────────────

export interface BatchScrapeOptions {
  urls: string[]
  format?: OutputFormat
  concurrency?: number
  piiFilter?: boolean
  jsRendering?: boolean
}

export interface BatchScrapeResult {
  id: string
  status: 'complete' | 'partial' | 'failed'
  results: ScrapeResult[]
  failed: Array<{ url: string; error: string }>
  total: number
  succeeded: number
  elapsedMs: number
}
