import { RobotsResult } from '@qrawl/types'

const cache = new Map<string, { rules: any; fetchedAt: number }>()
const TTL_MS = 1000 * 60 * 10 // 10 min cache per domain

/**
 * Fetches and parses robots.txt for the given URL's domain.
 * Results are cached per domain for 10 minutes.
 */
export async function checkRobots(url: string, userAgent = 'qrawl'): Promise<RobotsResult> {
  const parsed = new URL(url)
  const robotsUrl = `${parsed.protocol}//${parsed.host}/robots.txt`
  const cacheKey = parsed.host

  let rules = getCached(cacheKey)

  if (!rules) {
    rules = await fetchRobots(robotsUrl)
    if (rules) cache.set(cacheKey, { rules, fetchedAt: Date.now() })
  }

  if (!rules) {
    // No robots.txt found — allow by default (RFC standard)
    return { allowed: true }
  }

  const allowed = rules.isAllowed(url, userAgent) ?? true
  const crawlDelay = rules.getCrawlDelay(userAgent) ?? undefined

  if (!allowed) {
    return {
      allowed: false,
      reason: `Blocked by robots.txt rule for user-agent "${userAgent}"`,
      crawlDelay,
    }
  }

  return { allowed: true, crawlDelay }
}

function getCached(host: string) {
  const entry = cache.get(host)
  if (!entry) return null
  if (Date.now() - entry.fetchedAt > TTL_MS) {
    cache.delete(host)
    return null
  }
  return entry.rules
}

async function fetchRobots(robotsUrl: string) {
  try {
    const res = await fetch(robotsUrl, {
      headers: { 'User-Agent': 'qrawl/1.0' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const text = await res.text()
    // Dynamically import robots-parser (CJS compat)
    const robotsParser = (await import('robots-parser')).default
    return robotsParser(robotsUrl, text)
  } catch {
    return null
  }
}
