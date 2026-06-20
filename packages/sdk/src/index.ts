/**
 * qrawl — Official SDK for the qrawl.dev cloud API
 *
 * Drop-in replacement for qrawl-core that routes to the managed cloud.
 * Unlocks cloud-only features: piiFilter, scanToS, jsRendering, webhooks.
 *
 * @example
 * ```ts
 * import { QrawlClient } from 'qrawl'
 *
 * const client = new QrawlClient({ apiKey: 'qr-YOUR_KEY' })
 *
 * // Same interface as qrawl-core, but runs on managed infrastructure
 * const result = await client.crawl('https://docs.example.com', {
 *   depth: 3,
 *   piiFilter: true,   // cloud-only ✓
 *   scanToS: true,     // cloud-only ✓
 * })
 * ```
 */

import {
  CrawlOptions,
  CrawlResult,
  ScrapeOptions,
  ScrapeResult,
  MapOptions,
  MapResult,
  SearchOptions,
  SearchResult,
  BatchScrapeOptions,
  BatchScrapeResult,
  ApiResponse,
  QrawlError,
  Page,
} from '@qrawl/types'

const DEFAULT_BASE_URL = 'https://api.qrawl.dev/v1'

export interface QrawlClientOptions {
  /** Your API key from qrawl.dev/dashboard */
  apiKey: string
  /** Override the API base URL — useful for self-hosted cloud instances */
  baseUrl?: string
  /** Request timeout in ms. Default: 60_000 */
  timeout?: number
}

export class QrawlClient {
  private apiKey: string
  private baseUrl: string
  private timeout: number

  constructor(options: QrawlClientOptions) {
    if (!options.apiKey) {
      throw new QrawlError('UNAUTHORIZED', 'apiKey is required. Get one at https://qrawl.dev/dashboard')
    }
    this.apiKey = options.apiKey
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
    this.timeout = options.timeout ?? 60_000
  }

  // ── Crawl ──────────────────────────────────────────────────────

  /**
   * Crawl a URL with BFS on managed infrastructure.
   * Supports all cloud-only options: piiFilter, scanToS, jsRendering, webhook.
   */
  async crawl(
    url: string,
    options: CrawlOptions = {},
    onPage?: (page: Page) => void,
  ): Promise<CrawlResult> {
    // If a webhook is set, submit async and poll
    if (options.webhook) {
      return this.request<CrawlResult>('POST', '/crawl/async', { url, options })
    }

    // Stream pages back via SSE if caller wants incremental results
    if (onPage) {
      return this.crawlStream(url, options, onPage)
    }

    return this.request<CrawlResult>('POST', '/crawl', { url, options })
  }

  /**
   * Stream crawl results page-by-page via SSE.
   * Calls onPage for each page as it arrives, resolves with the full result.
   */
  private async crawlStream(
    url: string,
    options: CrawlOptions,
    onPage: (page: Page) => void,
  ): Promise<CrawlResult> {
    const res = await fetch(`${this.baseUrl}/crawl/stream`, {
      method: 'POST',
      headers: this.headers({ 'Accept': 'text/event-stream' }),
      body: JSON.stringify({ url, options }),
      signal: AbortSignal.timeout(this.timeout),
    })

    if (!res.ok || !res.body) {
      throw await this.parseError(res)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let finalResult: CrawlResult | null = null
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const json = line.slice(6).trim()
        if (json === '[DONE]') continue
        try {
          const event = JSON.parse(json) as { type: 'page' | 'done'; data: any }
          if (event.type === 'page') onPage(event.data as Page)
          if (event.type === 'done') finalResult = event.data as CrawlResult
        } catch { /* skip malformed events */ }
      }
    }

    if (!finalResult) {
      throw new QrawlError('INTERNAL', 'Stream ended without a final result')
    }
    return finalResult
  }

  // ── Scrape ─────────────────────────────────────────────────────

  /**
   * Scrape a single URL and return structured content.
   * Supports jsRendering and piiFilter (cloud-only).
   */
  async scrape(url: string, options: ScrapeOptions = {}): Promise<ScrapeResult> {
    return this.request<ScrapeResult>('POST', '/scrape', { url, options })
  }

  // ── Map ────────────────────────────────────────────────────────

  /**
   * Discover all URLs on a domain.
   */
  async map(url: string, options: MapOptions = {}): Promise<MapResult> {
    return this.request<MapResult>('POST', '/map', { url, options })
  }

  // ── Search ─────────────────────────────────────────────────────

  /**
   * Search the web and return results with optional full-page content.
   * Cloud uses a managed provider (Serper/Brave) for higher quality
   * and volume than the open source DuckDuckGo fallback.
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult> {
    return this.request<SearchResult>('POST', '/search', { query, options })
  }

  // ── Batch scrape ───────────────────────────────────────────────

  /**
   * Scrape multiple URLs concurrently and return all results.
   * Supports optional webhook for async delivery.
   */
  async batchScrape(
    urls: string[],
    options: Omit<BatchScrapeOptions, 'urls'> = {},
  ): Promise<BatchScrapeResult> {
    return this.request<BatchScrapeResult>('POST', '/batch-scrape', { urls, options })
  }

  /**
   * Get the status of a batch scrape job.
   */
  async getBatchScrape(jobId: string): Promise<BatchScrapeResult> {
    return this.request<BatchScrapeResult>('GET', `/batch-scrape/${jobId}`)
  }

  /**
   * Get per-URL errors from a batch scrape job.
   */
  async getBatchScrapeErrors(jobId: string): Promise<Array<{ url: string; error: string }>> {
    return this.request('GET', `/batch-scrape/${jobId}/errors`)
  }

  // ── Job polling (for async/webhook crawls) ─────────────────────

  /**
   * Get the status of an async crawl job.
   */
  async getJob(jobId: string): Promise<CrawlResult> {
    return this.request<CrawlResult>('GET', `/crawl/${jobId}`)
  }

  /**
   * Cancel an in-progress crawl job.
   */
  async cancelJob(jobId: string): Promise<{ cancelled: boolean }> {
    return this.request<{ cancelled: boolean }>('DELETE', `/crawl/${jobId}`)
  }

  // ── Internal ───────────────────────────────────────────────────

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      'X-Qrawl-SDK': 'qrawl-js/0.1.0',
      ...extra,
    }
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.timeout),
    })

    const envelope = await res.json() as ApiResponse<T>

    if (!res.ok || !envelope.success) {
      const err = envelope.error
      throw new QrawlError(
        err?.code ?? 'INTERNAL',
        err?.message ?? `API error ${res.status}`,
        res.status,
      )
    }

    return envelope.data as T
  }

  private async parseError(res: Response): Promise<QrawlError> {
    try {
      const body = await res.json() as ApiResponse<never>
      return new QrawlError(
        body.error?.code ?? 'INTERNAL',
        body.error?.message ?? `HTTP ${res.status}`,
        res.status,
      )
    } catch {
      return new QrawlError('INTERNAL', `HTTP ${res.status}`, res.status)
    }
  }
}

// Re-export types so consumers only need to install `qrawl`
export type {
  CrawlOptions,
  CrawlResult,
  ScrapeOptions,
  ScrapeResult,
  MapOptions,
  MapResult,
  Page,
  PageMetadata,
  SkipReason,
  TosFlag,
  QrawlError,
  QrawlErrorCode,
} from '@qrawl/types'
