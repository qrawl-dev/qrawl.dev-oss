import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QrawlCore } from '../src/index.js'
import { QrawlError } from '@qrawl/types'

// ── Mock fetch globally ───────────────────────────────────────────
const mockFetch = vi.fn()
global.fetch = mockFetch

function makePage(url: string, links: string[] = []) {
  const linksHtml = links.map((l) => `<a href="${l}">link</a>`).join('')
  return {
    ok: true,
    status: 200,
    text: async () => `
      <html>
        <head>
          <title>Test Page</title>
          <meta name="description" content="A test page" />
        </head>
        <body>
          <main>
            <h1>Hello World</h1>
            <p>Some content here.</p>
            ${linksHtml}
          </main>
        </body>
      </html>
    `,
  }
}

beforeEach(() => {
  mockFetch.mockReset()
  // Default: robots.txt returns 404 (allow all)
  mockFetch.mockImplementation(async (url: string) => {
    if (url.endsWith('/robots.txt')) {
      return { ok: false, status: 404, text: async () => '' }
    }
    return makePage(url)
  })
})

// ── QrawlCore ─────────────────────────────────────────────────────

describe('QrawlCore.scrape', () => {
  it('scrapes a single URL and returns markdown', async () => {
    const client = new QrawlCore()
    const result = await client.scrape('https://example.com')

    expect(result.url).toBe('https://example.com')
    expect(result.page.title).toBe('Test Page')
    expect(result.page.format).toBe('markdown')
    expect(result.page.content).toContain('Hello World')
    expect(result.page.statusCode).toBe(200)
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0)
  })

  it('returns json format when requested', async () => {
    const client = new QrawlCore()
    const result = await client.scrape('https://example.com', { format: 'json' })
    const parsed = JSON.parse(result.page.content)
    expect(parsed.title).toBe('Test Page')
  })

  it('throws CLOUD_FEATURE when jsRendering is set', async () => {
    const client = new QrawlCore()
    await expect(
      client.scrape('https://example.com', { jsRendering: true })
    ).rejects.toMatchObject({ code: 'CLOUD_FEATURE' })
  })

  it('throws CLOUD_FEATURE when piiFilter is set', async () => {
    const client = new QrawlCore()
    await expect(
      client.scrape('https://example.com', { piiFilter: true })
    ).rejects.toMatchObject({ code: 'CLOUD_FEATURE' })
  })
})

describe('QrawlCore.crawl', () => {
  it('crawls a single page with no links', async () => {
    const client = new QrawlCore()
    const result = await client.crawl('https://example.com', { depth: 1 })

    expect(result.status).toBe('complete')
    expect(result.pages.length).toBeGreaterThan(0)
    expect(result.pages[0].url).toBe('https://example.com')
    expect(result.startedAt).toBeTruthy()
    expect(result.completedAt).toBeTruthy()
  })

  it('throws INVALID_URL for a bad URL', async () => {
    const client = new QrawlCore()
    await expect(
      client.crawl('not-a-url')
    ).rejects.toMatchObject({ code: 'INVALID_URL' })
  })

  it('throws CLOUD_FEATURE when piiFilter is set', async () => {
    const client = new QrawlCore()
    await expect(
      client.crawl('https://example.com', { piiFilter: true })
    ).rejects.toMatchObject({ code: 'CLOUD_FEATURE' })
  })

  it('throws CLOUD_FEATURE when scanToS is set', async () => {
    const client = new QrawlCore()
    await expect(
      client.crawl('https://example.com', { scanToS: true })
    ).rejects.toMatchObject({ code: 'CLOUD_FEATURE' })
  })

  it('throws CLOUD_FEATURE when jsRendering is set', async () => {
    const client = new QrawlCore()
    await expect(
      client.crawl('https://example.com', { jsRendering: true })
    ).rejects.toMatchObject({ code: 'CLOUD_FEATURE' })
  })

  it('skips pages blocked by robots.txt', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/robots.txt')) {
        return {
          ok: true,
          status: 200,
          text: async () => 'User-agent: *\nDisallow: /private',
        }
      }
      if (url.includes('/private')) {
        return makePage(url)
      }
      return makePage(url, ['https://example.com/private/secret'])
    })

    const client = new QrawlCore()
    const result = await client.crawl('https://example.com', { depth: 2 })

    const skippedUrls = result.skippedReasons.map((s) => s.url)
    expect(skippedUrls.some((u) => u.includes('/private'))).toBe(true)
    expect(result.skippedReasons.find((s) => s.url.includes('/private'))?.reason).toBe('robots')
  })

  it('calls onPage callback for each crawled page', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/robots.txt')) return { ok: false, status: 404, text: async () => '' }
      if (url === 'https://example.com') return makePage(url, ['https://example.com/about'])
      return makePage(url)
    })

    const client = new QrawlCore()
    const received: string[] = []

    await client.crawl('https://example.com', { depth: 2 }, (page) => {
      received.push(page.url)
    })

    expect(received).toContain('https://example.com')
    expect(received).toContain('https://example.com/about')
  })

  it('respects maxPages limit', async () => {
    // Seed page links to 10 sub-pages
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/robots.txt')) return { ok: false, status: 404, text: async () => '' }
      const links = Array.from({ length: 10 }, (_, i) => `https://example.com/page-${i}`)
      return makePage(url, url === 'https://example.com' ? links : [])
    })

    const client = new QrawlCore()
    const result = await client.crawl('https://example.com', { depth: 2, maxPages: 3 })
    expect(result.pages.length).toBeLessThanOrEqual(3)
  })

  it('does not follow external links when sameDomain is true', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/robots.txt')) return { ok: false, status: 404, text: async () => '' }
      return makePage(url, ['https://external.com/page'])
    })

    const client = new QrawlCore()
    const result = await client.crawl('https://example.com', { depth: 2, sameDomain: true })

    expect(result.pages.every((p) => p.url.includes('example.com'))).toBe(true)
  })

  it('respects exclude patterns', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/robots.txt')) return { ok: false, status: 404, text: async () => '' }
      return makePage(url, ['https://example.com/admin/settings'])
    })

    const client = new QrawlCore()
    const result = await client.crawl('https://example.com', {
      depth: 2,
      exclude: ['/admin'],
    })

    expect(result.pages.every((p) => !p.url.includes('/admin'))).toBe(true)
  })
})

describe('QrawlCore.map', () => {
  it('returns discovered URLs', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/sitemap.xml')) return { ok: false, status: 404, text: async () => '' }
      return makePage(url, ['https://example.com/about', 'https://example.com/docs'])
    })

    const client = new QrawlCore()
    const result = await client.map('https://example.com', { depth: 1 })

    expect(result.url).toBe('https://example.com')
    expect(Array.isArray(result.urls)).toBe(true)
    expect(result.total).toBe(result.urls.length)
  })

  it('uses sitemap.xml when available', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/sitemap.xml')) {
        return {
          ok: true,
          status: 200,
          text: async () => `<?xml version="1.0"?>
            <urlset>
              <url><loc>https://example.com/</loc></url>
              <url><loc>https://example.com/about</loc></url>
              <url><loc>https://example.com/pricing</loc></url>
            </urlset>`,
        }
      }
      return makePage(url)
    })

    const client = new QrawlCore()
    const result = await client.map('https://example.com')

    expect(result.urls).toContain('https://example.com/')
    expect(result.urls).toContain('https://example.com/about')
    expect(result.urls).toContain('https://example.com/pricing')
  })
})

// ── QrawlError ────────────────────────────────────────────────────

describe('QrawlError', () => {
  it('is instanceof Error', () => {
    const err = new QrawlError('INTERNAL', 'something went wrong')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('QrawlError')
    expect(err.code).toBe('INTERNAL')
    expect(err.message).toBe('something went wrong')
  })
})
