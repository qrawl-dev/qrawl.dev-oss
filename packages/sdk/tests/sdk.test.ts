import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QrawlClient } from '../src/index.js'
import { QrawlError } from '@qrawl-dev/types'

const mockFetch = vi.fn()
global.fetch = mockFetch

const mockCrawlResult = {
  id: 'job-123',
  url: 'https://example.com',
  status: 'complete',
  pages: [{ url: 'https://example.com', title: 'Example', content: '# Hello', format: 'markdown', statusCode: 200, crawledAt: new Date().toISOString(), metadata: { wordCount: 1, links: [] } }],
  pagesDiscovered: 1,
  pagesCrawled: 1,
  pagesSkipped: 0,
  skippedReasons: [],
  elapsedMs: 800,
  startedAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
  compliant: true,
  piiRedacted: 0,
}

function apiOk<T>(data: T) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ success: true, data, requestId: 'req-abc' }),
  }
}

function apiErr(code: string, message: string, status = 400) {
  return {
    ok: false,
    status,
    json: async () => ({ success: false, error: { code, message }, requestId: 'req-abc' }),
  }
}

beforeEach(() => mockFetch.mockReset())

describe('QrawlClient constructor', () => {
  it('throws if no apiKey is provided', () => {
    expect(() => new QrawlClient({ apiKey: '' })).toThrow(QrawlError)
  })

  it('constructs successfully with a valid apiKey', () => {
    expect(() => new QrawlClient({ apiKey: 'qr-test' })).not.toThrow()
  })
})

describe('QrawlClient.crawl', () => {
  it('POSTs to /crawl and returns a CrawlResult', async () => {
    mockFetch.mockResolvedValueOnce(apiOk(mockCrawlResult))

    const client = new QrawlClient({ apiKey: 'qr-test' })
    const result = await client.crawl('https://example.com', { depth: 2 })

    expect(result.status).toBe('complete')
    expect(result.pages).toHaveLength(1)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/crawl'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('sends Authorization header with Bearer token', async () => {
    mockFetch.mockResolvedValueOnce(apiOk(mockCrawlResult))

    const client = new QrawlClient({ apiKey: 'qr-mykey' })
    await client.crawl('https://example.com')

    const callArgs = mockFetch.mock.calls[0][1]
    expect(callArgs.headers['Authorization']).toBe('Bearer qr-mykey')
  })

  it('sends cloud-only options in the request body', async () => {
    mockFetch.mockResolvedValueOnce(apiOk(mockCrawlResult))

    const client = new QrawlClient({ apiKey: 'qr-test' })
    await client.crawl('https://example.com', { piiFilter: true, scanToS: true })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.options.piiFilter).toBe(true)
    expect(body.options.scanToS).toBe(true)
  })

  it('uses /crawl/async when webhook is set', async () => {
    mockFetch.mockResolvedValueOnce(apiOk({ ...mockCrawlResult, id: 'async-job' }))

    const client = new QrawlClient({ apiKey: 'qr-test' })
    await client.crawl('https://example.com', { webhook: 'https://my-server.com/hook' })

    expect(mockFetch.mock.calls[0][0]).toContain('/crawl/async')
  })

  it('throws QrawlError on 401 Unauthorized', async () => {
    mockFetch.mockResolvedValueOnce(apiErr('UNAUTHORIZED', 'Invalid API key', 401))

    const client = new QrawlClient({ apiKey: 'qr-bad' })
    await expect(client.crawl('https://example.com')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      statusCode: 401,
    })
  })

  it('throws QrawlError on 429 quota exceeded', async () => {
    mockFetch.mockResolvedValueOnce(apiErr('QUOTA_EXCEEDED', 'Monthly quota reached', 429))

    const client = new QrawlClient({ apiKey: 'qr-test' })
    await expect(client.crawl('https://example.com')).rejects.toMatchObject({
      code: 'QUOTA_EXCEEDED',
    })
  })
})

describe('QrawlClient.scrape', () => {
  it('POSTs to /scrape and returns a ScrapeResult', async () => {
    const mockScrape = {
      url: 'https://example.com',
      page: mockCrawlResult.pages[0],
      elapsedMs: 300,
      piiRedacted: 0,
    }
    mockFetch.mockResolvedValueOnce(apiOk(mockScrape))

    const client = new QrawlClient({ apiKey: 'qr-test' })
    const result = await client.scrape('https://example.com', { jsRendering: true })

    expect(result.url).toBe('https://example.com')
    expect(mockFetch.mock.calls[0][0]).toContain('/scrape')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.options.jsRendering).toBe(true)
  })
})

describe('QrawlClient.map', () => {
  it('POSTs to /map and returns a MapResult', async () => {
    const mockMap = {
      url: 'https://example.com',
      urls: ['https://example.com/', 'https://example.com/about'],
      total: 2,
      elapsedMs: 120,
    }
    mockFetch.mockResolvedValueOnce(apiOk(mockMap))

    const client = new QrawlClient({ apiKey: 'qr-test' })
    const result = await client.map('https://example.com')

    expect(result.total).toBe(2)
    expect(mockFetch.mock.calls[0][0]).toContain('/map')
  })
})

describe('QrawlClient.getJob', () => {
  it('GETs /crawl/:id', async () => {
    mockFetch.mockResolvedValueOnce(apiOk(mockCrawlResult))

    const client = new QrawlClient({ apiKey: 'qr-test' })
    const result = await client.getJob('job-123')

    expect(result.id).toBe('job-123')
    expect(mockFetch.mock.calls[0][0]).toContain('/crawl/job-123')
    expect(mockFetch.mock.calls[0][1].method).toBe('GET')
  })
})

describe('QrawlClient.cancelJob', () => {
  it('DELETEs /crawl/:id', async () => {
    mockFetch.mockResolvedValueOnce(apiOk({ cancelled: true }))

    const client = new QrawlClient({ apiKey: 'qr-test' })
    const result = await client.cancelJob('job-123')

    expect(result.cancelled).toBe(true)
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
  })
})
