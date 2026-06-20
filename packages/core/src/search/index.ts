/**
 * qrawl-core/search
 *
 * Self-hosted search using DuckDuckGo Instant Answers + HTML scraping.
 * No API key required — works out of the box.
 *
 * Cloud upgrade path: the cloud API routes this through
 * a managed search provider (Serper/Brave/Bing) for higher
 * quality results, images, news, and higher rate limits.
 */

import { parse } from 'node-html-parser'
import {
  SearchOptions,
  SearchResult,
  SearchResultItem,
  QrawlError,
} from '@qrawl-dev/types'
import { scrapePage } from '../scraper/index.js'
import { RateLimiter } from '../ratelimiter/index.js'

const DDG_URL    = 'https://html.duckduckgo.com/html/'
const USER_AGENT = 'Mozilla/5.0 (compatible; qrawl/1.0; +https://qrawl.dev/bot)'
const limiter    = new RateLimiter(1500) // be polite to DDG

/**
 * Search the web and return results with optional full-page content.
 * Uses DuckDuckGo HTML endpoint (no API key, open source friendly).
 *
 * For higher quality / higher volume, use the cloud API:
 *   import { QrawlClient } from 'qrawl'
 */
export async function search(
  query: string,
  options: SearchOptions = {},
): Promise<SearchResult> {
  if (!query?.trim()) {
    throw new QrawlError('INVALID_URL', 'Search query cannot be empty')
  }

  // Cloud-only guard
  if (options.includeImages || options.includeNews) {
    throw new QrawlError(
      'CLOUD_FEATURE',
      'includeImages and includeNews are cloud-only features. ' +
      'Use `import { QrawlClient } from "qrawl"` with an API key.',
    )
  }

  const start = Date.now()
  const { limit = 10, scrapeContent = false, format = 'markdown', site } = options

  // Build query
  let q = query.trim()
  if (site) q = `site:${site} ${q}`
  if (options.after)  q += ` after:${options.after.slice(0, 10)}`
  if (options.before) q += ` before:${options.before.slice(0, 10)}`

  const raw = await fetchDdgResults(q)
  const items = parseDdgHtml(raw, limit)

  // Optionally scrape full page content for each result
  let enriched: SearchResultItem[] = items
  if (scrapeContent && items.length > 0) {
    enriched = await scrapeResultPages(items, format, options)
  }

  return {
    query,
    results: enriched,
    total: enriched.length,
    elapsedMs: Date.now() - start,
  }
}

// ── DuckDuckGo HTML scraping ──────────────────────────────────────

async function fetchDdgResults(query: string): Promise<string> {
  // RateLimiter.wait expects a full URL (it reads new URL(url).host)
  await limiter.wait(DDG_URL)

  const body = new URLSearchParams({ q: query, b: '', kl: '' })

  let res: Response
  try {
    res = await fetch(DDG_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
        'Accept': 'text/html',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      body: body.toString(),
      signal: AbortSignal.timeout(12_000),
    })
  } catch (err) {
    throw new QrawlError('NETWORK_ERROR', `Search request failed: ${(err as Error).message}`)
  }

  if (!res.ok) {
    throw new QrawlError('NETWORK_ERROR', `Search request failed: HTTP ${res.status}`)
  }

  return res.text()
}

function parseDdgHtml(html: string, limit: number): SearchResultItem[] {
  const root    = parse(html)
  const results: SearchResultItem[] = []

  // DDG HTML result structure: .result .result__body > .result__title > a + .result__snippet
  const resultEls = root.querySelectorAll('.result')

  for (const el of resultEls) {
    if (results.length >= limit) break

    // Skip ads and special results
    if (el.classList.contains('result--ad')) continue
    if (el.classList.contains('result--more')) continue

    const titleEl   = el.querySelector('.result__title a') ?? el.querySelector('.result__a')
    const snippetEl = el.querySelector('.result__snippet')
    const urlEl     = el.querySelector('.result__url')

    if (!titleEl) continue

    // DDG encodes URLs in the href as a redirect — extract the actual URL
    const href = titleEl.getAttribute('href') ?? ''
    const url  = extractActualUrl(href)
    if (!url || url.startsWith('https://duckduckgo.com')) continue

    const title       = titleEl.text.trim()
    const description = snippetEl?.text.trim() ?? ''
    const publishedAt = extractDate(snippetEl?.text ?? '')

    results.push({
      url,
      title,
      description,
      position: results.length + 1,
      publishedAt,
    })
  }

  // Fallback: try a different selector pattern if above yielded nothing
  if (results.length === 0) {
    const links = root.querySelectorAll('a.result__a, a.result__url')
    for (const link of links) {
      if (results.length >= limit) break
      const href = link.getAttribute('href') ?? ''
      const url  = extractActualUrl(href)
      if (!url || url.includes('duckduckgo.com')) continue
      results.push({
        url,
        title: link.text.trim() || url,
        description: '',
        position: results.length + 1,
      })
    }
  }

  return results
}

function extractActualUrl(href: string): string | null {
  if (!href) return null

  // DDG redirect: //duckduckgo.com/l/?uddg=<encoded-url>&...
  if (href.includes('duckduckgo.com/l/')) {
    try {
      const urlObj = new URL(href.startsWith('//') ? `https:${href}` : href)
      const uddg = urlObj.searchParams.get('uddg')
      if (uddg) return decodeURIComponent(uddg)
    } catch { /* fall through */ }
  }

  // Direct URL
  if (href.startsWith('http')) return href
  if (href.startsWith('//'))   return `https:${href}`

  return null
}

function extractDate(text: string): string | undefined {
  // Look for patterns like "3 days ago", "Jan 15, 2025", "2025-01-15"
  const isoMatch = text.match(/\d{4}-\d{2}-\d{2}/)
  if (isoMatch) return isoMatch[0]

  const relMatch = text.match(/(\d+)\s+(day|week|month|year)s?\s+ago/i)
  if (relMatch) {
    const n    = parseInt(relMatch[1])
    const unit = relMatch[2].toLowerCase()
    const d    = new Date()
    if (unit === 'day')   d.setDate(d.getDate() - n)
    if (unit === 'week')  d.setDate(d.getDate() - n * 7)
    if (unit === 'month') d.setMonth(d.getMonth() - n)
    if (unit === 'year')  d.setFullYear(d.getFullYear() - n)
    return d.toISOString().slice(0, 10)
  }

  return undefined
}

// ── Content enrichment ────────────────────────────────────────────

async function scrapeResultPages(
  items: SearchResultItem[],
  format: SearchOptions['format'],
  options: SearchOptions,
): Promise<SearchResultItem[]> {
  // Scrape concurrently, max 3 at a time, timeout per page
  const CONCURRENCY = 3
  const enriched    = [...items]

  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY)

    const results = await Promise.allSettled(
      batch.map(async (item) => {
        const scrape = await scrapePage(item.url, { format })
        return { url: item.url, page: scrape, content: scrape.content }
      })
    )

    results.forEach((r, j) => {
      const idx = i + j
      if (r.status === 'fulfilled') {
        enriched[idx] = {
          ...enriched[idx],
          page: r.value.page,
          content: r.value.content,
        }
      }
      // On failure, leave result as-is (description only)
    })
  }

  return enriched
}
