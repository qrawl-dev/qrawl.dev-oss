import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QrawlCore } from '../src/index.js'
import { QrawlError } from '@qrawl/types'

const mockFetch = vi.fn()
global.fetch = mockFetch

const DDG_HTML = `
<html><body>
  <div class="results">
    <div class="result">
      <h2 class="result__title">
        <a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage1">Example Page 1</a>
      </h2>
      <a class="result__url">example.com/page1</a>
      <div class="result__snippet">This is a test snippet for page 1. Published 2 days ago.</div>
    </div>
    <div class="result">
      <h2 class="result__title">
        <a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage2">Example Page 2</a>
      </h2>
      <a class="result__url">example.com/page2</a>
      <div class="result__snippet">This is a test snippet for page 2.</div>
    </div>
    <div class="result">
      <h2 class="result__title">
        <a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage3">Example Page 3</a>
      </h2>
      <div class="result__snippet">Third result snippet.</div>
    </div>
  </div>
</body></html>
`

const PAGE_HTML = (n: number) => `
<html>
  <head><title>Page ${n}</title><meta name="description" content="Description ${n}"/></head>
  <body><main><h1>Heading ${n}</h1><p>Content for page ${n}.</p></main></body>
</html>
`

beforeEach(() => {
  mockFetch.mockReset()
})

describe('QrawlCore.search', () => {
  it('returns parsed search results from DDG', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => DDG_HTML,
    })

    const client = new QrawlCore()
    const result = await client.search('test query')

    expect(result.query).toBe('test query')
    expect(result.results.length).toBeGreaterThan(0)
    expect(result.results[0]).toMatchObject({
      position: 1,
      url:      expect.stringContaining('example.com'),
      title:    expect.any(String),
    })
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0)
  })

  it('respects the limit option', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200, text: async () => DDG_HTML,
    })

    const client = new QrawlCore()
    const result = await client.search('test', { limit: 2 })

    expect(result.results.length).toBeLessThanOrEqual(2)
  })

  it('throws INVALID_URL for empty query', async () => {
    const client = new QrawlCore()
    await expect(client.search('')).rejects.toMatchObject({ code: 'INVALID_URL' })
  })

  it('throws CLOUD_FEATURE when includeImages is set', async () => {
    const client = new QrawlCore()
    await expect(
      client.search('test', { includeImages: true })
    ).rejects.toMatchObject({ code: 'CLOUD_FEATURE' })
  })

  it('throws CLOUD_FEATURE when includeNews is set', async () => {
    const client = new QrawlCore()
    await expect(
      client.search('test', { includeNews: true })
    ).rejects.toMatchObject({ code: 'CLOUD_FEATURE' })
  })

  it('scrapes content when scrapeContent is true', async () => {
    // First call: DDG search
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200, text: async () => DDG_HTML,
    })
    // Subsequent calls: page scrapes + robots.txt
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/robots.txt')) return { ok: false, status: 404, text: async () => '' }
      const n = url.includes('page1') ? 1 : url.includes('page2') ? 2 : 3
      return { ok: true, status: 200, text: async () => PAGE_HTML(n) }
    })

    const client = new QrawlCore()
    const result = await client.search('test', { scrapeContent: true, limit: 2 })

    // At least some results should have content
    const withContent = result.results.filter((r) => r.content)
    expect(withContent.length).toBeGreaterThan(0)
    expect(withContent[0].content).toContain('Heading')
  })

  it('includes site: operator in query when site is set', async () => {
    let capturedBody = ''
    mockFetch.mockImplementation(async (url: string, opts: any) => {
      capturedBody = opts?.body ?? ''
      return { ok: true, status: 200, text: async () => DDG_HTML }
    })

    const client = new QrawlCore()
    await client.search('typescript docs', { site: 'github.com' })

    expect(capturedBody).toContain('site%3Agithub.com')
  })

  it('handles DDG network error gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const client = new QrawlCore()
    await expect(client.search('test')).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
  })

  it('handles DDG non-200 response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429, text: async () => '' })

    const client = new QrawlCore()
    await expect(client.search('test')).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
  })
})
