import PQueue from 'p-queue'
import { v4 as uuid } from 'uuid'
import {
  CrawlOptions,
  CrawlResult,
  Page,
  SkipReason,
  QrawlError,
} from '@qrawl/types'
import { checkRobots } from '../robots/index.js'
import { RateLimiter } from '../ratelimiter/index.js'
import { scrapePage } from '../scraper/index.js'

const CLOUD_ONLY: (keyof CrawlOptions)[] = ['piiFilter', 'scanToS', 'jsRendering', 'webhook']

/**
 * BFS crawler — the open source engine behind qrawl.dev.
 *
 * Cloud-only features (piiFilter, scanToS, jsRendering, webhook)
 * will throw QrawlError('CLOUD_FEATURE') if passed here.
 * Use `qrawl` SDK with an API key for those features.
 */
export async function crawl(
  seedUrl: string,
  options: CrawlOptions = {},
  onPage?: (page: Page) => void,
): Promise<CrawlResult> {
  // ── Guard: reject cloud-only options ───────────────────────────
  for (const key of CLOUD_ONLY) {
    if (options[key]) {
      throw new QrawlError(
        'CLOUD_FEATURE',
        `"${key}" is a cloud-only feature. ` +
        'Use `import { QrawlClient } from "qrawl"` with an API key at api.qrawl.dev.',
      )
    }
  }

  // ── Validate seed URL ─────────────────────────────────────────
  let seed: URL
  try {
    seed = new URL(seedUrl)
  } catch {
    throw new QrawlError('INVALID_URL', `Invalid URL: ${seedUrl}`)
  }

  // ── Resolve options ───────────────────────────────────────────
  const {
    depth = 3,
    maxPages = 500,
    format = 'markdown',
    respectRobots = true,
    crawlDelay = 1000,
    sameDomain = true,
    exclude = [],
    include = [],
  } = options

  const excludeRe = exclude.map((p) => new RegExp(p))
  const includeRe = include.map((p) => new RegExp(p))

  // ── State ─────────────────────────────────────────────────────
  const jobId = uuid()
  const startedAt = new Date().toISOString()
  const visited = new Set<string>()
  const queue: Array<{ url: string; currentDepth: number }> = [
    { url: seedUrl, currentDepth: 0 },
  ]
  const pages: Page[] = []
  const skippedReasons: SkipReason[] = []

  const rateLimiter = new RateLimiter(crawlDelay)
  const pq = new PQueue({ concurrency: 3 })

  // ── BFS loop ──────────────────────────────────────────────────
  while (queue.length > 0 && pages.length < maxPages) {
    const batch = queue.splice(0, 10)

    await pq.addAll(
      batch.map(({ url, currentDepth }) => async () => {
        if (visited.has(url) || pages.length >= maxPages) return
        visited.add(url)

        // ── Domain check ───────────────────────────────────────
        if (sameDomain && new URL(url).host !== seed.host) {
          skippedReasons.push({ url, reason: 'excluded', detail: 'different domain' })
          return
        }

        // ── Include/exclude patterns ───────────────────────────
        if (excludeRe.some((r) => r.test(url))) {
          skippedReasons.push({ url, reason: 'excluded', detail: 'matched exclude pattern' })
          return
        }
        if (includeRe.length > 0 && !includeRe.some((r) => r.test(url))) {
          skippedReasons.push({ url, reason: 'excluded', detail: 'did not match include pattern' })
          return
        }

        // ── Robots check ───────────────────────────────────────
        if (respectRobots) {
          const robotsResult = await checkRobots(url)
          if (!robotsResult.allowed) {
            skippedReasons.push({ url, reason: 'robots', detail: robotsResult.reason })
            return
          }
          // Honor robots Crawl-Delay if stricter than our default
          await rateLimiter.wait(url, robotsResult.crawlDelay)
        } else {
          await rateLimiter.wait(url)
        }

        // ── Scrape ─────────────────────────────────────────────
        try {
          const page = await scrapePage(url, { format })
          pages.push(page)
          onPage?.(page)

          // ── Enqueue discovered links ───────────────────────
          if (currentDepth < depth) {
            for (const link of page.metadata.links) {
              if (!visited.has(link)) {
                queue.push({ url: link, currentDepth: currentDepth + 1 })
              }
            }
          }
        } catch (err: any) {
          skippedReasons.push({
            url,
            reason: 'error',
            detail: err?.message ?? 'unknown error',
          })
        }
      }),
    )

    await pq.onIdle()
  }

  const completedAt = new Date().toISOString()

  return {
    id: jobId,
    url: seedUrl,
    status: pages.length > 0 ? 'complete' : 'failed',
    pages,
    pagesDiscovered: visited.size + skippedReasons.length,
    pagesCrawled: pages.length,
    pagesSkipped: skippedReasons.length,
    skippedReasons,
    elapsedMs: Date.now() - new Date(startedAt).getTime(),
    startedAt,
    completedAt,
  }
}
