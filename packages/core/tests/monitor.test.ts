import { describe, it, expect, vi, beforeEach } from 'vitest'
import { snapshot, diffContent } from '../src/monitor/index.js'

const mockFetch = vi.fn()
global.fetch = mockFetch

function makeHtmlPage(content: string, selector = 'main') {
  return `
    <html>
      <head><title>Test Page</title></head>
      <body>
        <nav>Navigation noise</nav>
        <${selector}>${content}</${selector}>
        <footer>Footer noise</footer>
      </body>
    </html>
  `
}

beforeEach(() => mockFetch.mockReset())

// ── snapshot ──────────────────────────────────────────────────────

describe('snapshot', () => {
  it('fetches a URL and returns normalised content + hash', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => makeHtmlPage('<h1>Hello</h1><p>Some content here.</p>'),
    })

    const snap = await snapshot('https://example.com')

    expect(snap.url).toBe('https://example.com')
    expect(snap.statusCode).toBe(200)
    expect(snap.content).toContain('Hello')
    expect(snap.content).toContain('Some content here')
    expect(snap.content).not.toContain('Navigation noise')
    expect(snap.content).not.toContain('Footer noise')
    expect(snap.hash).toMatch(/^[a-f0-9]{64}$/)
    expect(snap.fetchedAt).toBeTruthy()
  })

  it('scopes content to a CSS selector', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => `
        <html><body>
          <div class="pricing">Pro plan $49/mo</div>
          <div class="blog">Some blog content</div>
        </body></html>
      `,
    })

    const snap = await snapshot('https://example.com', '.pricing')

    expect(snap.content).toContain('Pro plan $49/mo')
    expect(snap.content).not.toContain('Some blog content')
  })

  it('produces different hashes for different content', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => makeHtmlPage('<p>Version A</p>') })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => makeHtmlPage('<p>Version B</p>') })

    const snapA = await snapshot('https://example.com')
    const snapB = await snapshot('https://example.com')

    expect(snapA.hash).not.toBe(snapB.hash)
  })

  it('produces the same hash for identical content', async () => {
    const html = makeHtmlPage('<p>Same content</p>')
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => html })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => html })

    const snapA = await snapshot('https://example.com')
    const snapB = await snapshot('https://example.com')

    expect(snapA.hash).toBe(snapB.hash)
  })
})

// ── diffContent ───────────────────────────────────────────────────

describe('diffContent', () => {
  it('returns changed: false when content is identical', () => {
    const content = 'Hello world\nSame line\nAnother line'
    const result  = diffContent(content, content)

    expect(result.changed).toBe(false)
    expect(result.oldHash).toBe(result.newHash)
    expect(result.diff).toBeUndefined()
  })

  it('returns changed: true when content differs', () => {
    const old = 'Line 1\nLine 2\nLine 3'
    const next = 'Line 1\nLine 2 modified\nLine 3\nLine 4 new'

    const result = diffContent(old, next)

    expect(result.changed).toBe(true)
    expect(result.oldHash).not.toBe(result.newHash)
    expect(result.diff).toBeDefined()
    expect(result.diff!.length).toBeGreaterThan(0)
  })

  it('includes add and remove operations in the diff', () => {
    const old  = 'Price: $49/mo\nPlan: Pro\nUsers: 5'
    const next = 'Price: $59/mo\nPlan: Pro\nUsers: 10\nNew feature: yes'

    const result = diffContent(old, next)

    expect(result.changed).toBe(true)
    expect(result.diff!.some(d => d.type === 'add')).toBe(true)
    expect(result.diff!.some(d => d.type === 'remove')).toBe(true)
    expect(result.diff!.some(d => d.type === 'equal')).toBe(true)
  })

  it('produces a human-readable summary', () => {
    const old  = 'Line 1\nLine 2\nLine 3'
    const next = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5'

    const result = diffContent(old, next)

    expect(result.summary).toBeDefined()
    expect(result.summary).toContain('added')
  })

  it('handles empty old content (first check)', () => {
    const result = diffContent('', 'New content appeared')

    expect(result.changed).toBe(true)
    expect(result.diff!.some(d => d.type === 'add')).toBe(true)
  })

  it('handles content being completely removed', () => {
    const result = diffContent('Old content here', '')

    expect(result.changed).toBe(true)
    expect(result.diff!.some(d => d.type === 'remove')).toBe(true)
  })
})

// ── QrawlCore.snapshot / QrawlCore.diff ──────────────────────────

describe('QrawlCore monitor methods', async () => {
  const { QrawlCore } = await import('../src/index.js')

  it('core.snapshot returns a PageSnapshot', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      text: async () => makeHtmlPage('<p>Content</p>'),
    })

    const core = new QrawlCore()
    const snap = await core.snapshot('https://example.com')

    expect(snap).toMatchObject({
      url:        'https://example.com',
      statusCode: 200,
      hash:       expect.stringMatching(/^[a-f0-9]{64}$/),
      content:    expect.any(String),
    })
  })

  it('core.diff detects changes correctly', () => {
    const core   = new QrawlCore()
    const result = core.diff('old content', 'new content')

    expect(result.changed).toBe(true)
  })

  it('core.diff returns no change for identical strings', () => {
    const core   = new QrawlCore()
    const result = core.diff('same content', 'same content')

    expect(result.changed).toBe(false)
  })
})
