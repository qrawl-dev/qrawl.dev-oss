/**
 * Per-domain rate limiter using a simple token bucket approach.
 * Respects Crawl-Delay from robots.txt when provided.
 */
export class RateLimiter {
  private lastRequest = new Map<string, number>()

  constructor(private defaultDelayMs: number = 1000) {}

  /**
   * Wait until the rate limit allows a request to the given URL's domain.
   */
  async wait(url: string, crawlDelaySeconds?: number): Promise<void> {
    const host = new URL(url).host
    const delayMs = crawlDelaySeconds != null
      ? crawlDelaySeconds * 1000
      : this.defaultDelayMs

    const last = this.lastRequest.get(host) ?? 0
    const now = Date.now()
    const wait = delayMs - (now - last)

    if (wait > 0) {
      await sleep(wait)
    }

    this.lastRequest.set(host, Date.now())
  }

  reset(host?: string) {
    if (host) this.lastRequest.delete(host)
    else this.lastRequest.clear()
  }
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}
