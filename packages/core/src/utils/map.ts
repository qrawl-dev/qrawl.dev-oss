import { parse } from 'node-html-parser'
import { MapOptions, MapResult, QrawlError } from '@qrawl/types'

/**
 * Discovers all URLs on a domain by:
 * 1. Checking /sitemap.xml first
 * 2. Falling back to BFS link discovery up to `depth` levels
 */
export async function map(url: string, options: MapOptions = {}): Promise<MapResult> {
  const { depth = 2, includeExternal = false } = options
  const start = Date.now()

  let seed: URL
  try {
    seed = new URL(url)
  } catch {
    throw new QrawlError('INVALID_URL', `Invalid URL: ${url}`)
  }

  const urls = new Set<string>()

  // Try sitemap.xml first
  const sitemapUrls = await trySitemap(`${seed.protocol}//${seed.host}/sitemap.xml`)
  if (sitemapUrls.length > 0) {
    for (const u of sitemapUrls) {
      if (includeExternal || new URL(u).host === seed.host) {
        urls.add(u)
      }
    }
  } else {
    // Fallback: BFS link discovery
    await bfsDiscover(url, seed.host, depth, includeExternal, urls)
  }

  return {
    url,
    urls: [...urls],
    total: urls.size,
    elapsedMs: Date.now() - start,
  }
}

async function trySitemap(sitemapUrl: string): Promise<string[]> {
  try {
    const res = await fetch(sitemapUrl, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'qrawl/1.0' },
    })
    if (!res.ok) return []
    const xml = await res.text()
    const matches = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)]
    return matches.map((m) => m[1].trim())
  } catch {
    return []
  }
}

async function bfsDiscover(
  startUrl: string,
  host: string,
  maxDepth: number,
  includeExternal: boolean,
  collected: Set<string>,
  _depth = 0,
  visited = new Set<string>(),
) {
  if (_depth > maxDepth || visited.has(startUrl)) return
  visited.add(startUrl)
  collected.add(startUrl)

  try {
    const res = await fetch(startUrl, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'qrawl/1.0' },
    })
    if (!res.ok) return
    const html = await res.text()
    const root = parse(html)

    const hrefs = [...root.querySelectorAll('a[href]')]
      .map((a) => {
        try { return new URL(a.getAttribute('href')!, startUrl).href } catch { return null }
      })
      .filter((h): h is string => h !== null)
      .filter((h) => includeExternal || new URL(h).host === host)

    for (const href of hrefs) {
      if (!visited.has(href)) {
        collected.add(href)
        await bfsDiscover(href, host, maxDepth, includeExternal, collected, _depth + 1, visited)
      }
    }
  } catch {
    // swallow — just skip unreachable pages
  }
}
