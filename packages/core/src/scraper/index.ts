import { parse } from 'node-html-parser'
import TurndownService from 'turndown'
import { Page, ScrapeOptions, QrawlError, OutputFormat } from '@qrawl/types'

const td = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
})

// Remove noise elements before converting
td.remove(['script', 'style', 'noscript', 'svg', 'iframe', 'nav', 'footer', 'header', 'aside'])

/**
 * Fetches a URL and converts its content to the requested format.
 */
export async function scrapePage(
  url: string,
  options: ScrapeOptions = {},
): Promise<Page> {
  // Guard: cloud-only options
  if (options.jsRendering) {
    throw new QrawlError(
      'CLOUD_FEATURE',
      'jsRendering requires the qrawl cloud API (api.qrawl.dev). ' +
      'Use `import { QrawlClient } from "qrawl"` with an API key.',
    )
  }
  if (options.piiFilter) {
    throw new QrawlError(
      'CLOUD_FEATURE',
      'piiFilter requires the qrawl cloud API. ' +
      'Use `import { QrawlClient } from "qrawl"` with an API key.',
    )
  }

  const format: OutputFormat = options.format ?? 'markdown'
  const startedAt = new Date().toISOString()

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'qrawl/1.0 (+https://qrawl.dev/bot)',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(15_000),
  })

  const html = await res.text()
  const root = parse(html)

  // Extract metadata
  const title = root.querySelector('title')?.text?.trim() ?? null
  const description =
    root.querySelector('meta[name="description"]')?.getAttribute('content') ??
    root.querySelector('meta[property="og:description"]')?.getAttribute('content')
  const ogImage = root.querySelector('meta[property="og:image"]')?.getAttribute('content')
  const author =
    root.querySelector('meta[name="author"]')?.getAttribute('content') ?? undefined
  const publishedAt =
    root.querySelector('meta[property="article:published_time"]')?.getAttribute('content') ??
    root.querySelector('time')?.getAttribute('datetime') ?? undefined

  // Collect all links
  const links = [...root.querySelectorAll('a[href]')]
    .map((a) => {
      try {
        return new URL(a.getAttribute('href')!, url).href
      } catch {
        return null
      }
    })
    .filter((l): l is string => l !== null)

  // Strip boilerplate for content extraction
  const bodyEl = root.querySelector('main') ??
    root.querySelector('article') ??
    root.querySelector('[role="main"]') ??
    root.querySelector('body')

  const bodyHtml = bodyEl?.innerHTML ?? html

  let content: string

  switch (format) {
    case 'markdown':
      content = td.turndown(bodyHtml).trim()
      break
    case 'html':
      content = bodyHtml
      break
    case 'text':
      content = (bodyEl?.text ?? root.text).replace(/\s+/g, ' ').trim()
      break
    case 'json':
      content = JSON.stringify({
        title,
        description,
        text: (bodyEl?.text ?? root.text).replace(/\s+/g, ' ').trim(),
        links,
      })
      break
  }

  const wordCount = content.split(/\s+/).filter(Boolean).length

  return {
    url,
    title,
    content,
    format,
    statusCode: res.status,
    crawledAt: startedAt,
    metadata: {
      description,
      ogImage,
      author,
      publishedAt,
      wordCount,
      links,
    },
  }
}
