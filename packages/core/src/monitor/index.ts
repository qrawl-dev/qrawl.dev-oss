/**
 * qrawl-core/monitor
 *
 * Core diffing logic for page change detection.
 * Open source — the scheduling and webhook delivery
 * live in the cloud (qrawl-cloud).
 */

import crypto  from 'crypto'
import { parse } from 'node-html-parser'

export interface PageSnapshot {
  url:       string
  hash:      string       // SHA-256 of normalised text content
  content:   string       // extracted text (or scoped to CSS selector)
  fetchedAt: string       // ISO 8601
  statusCode: number
}

export interface DiffResult {
  changed:   boolean
  oldHash:   string
  newHash:   string
  diff?:     TextDiff[]   // line-level diff when changed
  summary?:  string       // human-readable summary e.g. "3 lines added, 1 removed"
}

export interface TextDiff {
  type:  'add' | 'remove' | 'equal'
  value: string
}

// ── Snapshot ──────────────────────────────────────────────────────

/**
 * Fetch a page and return a normalised snapshot for comparison.
 * @param cssSelector  Optional — scope content to this selector only
 */
export async function snapshot(
  url: string,
  cssSelector?: string,
): Promise<PageSnapshot> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'qrawl-monitor/1.0 (+https://qrawl.dev/bot)',
      Accept: 'text/html',
    },
    signal: AbortSignal.timeout(15_000),
  })

  const html    = await res.text()
  const content = extractContent(html, cssSelector)
  const hash    = hashContent(content)

  return {
    url,
    hash,
    content,
    fetchedAt:  new Date().toISOString(),
    statusCode: res.status,
  }
}

// ── Diff ──────────────────────────────────────────────────────────

/**
 * Compare two content strings and produce a structured diff.
 */
export function diffContent(
  oldContent: string,
  newContent: string,
): DiffResult {
  const oldHash = hashContent(oldContent)
  const newHash = hashContent(newContent)

  if (oldHash === newHash) {
    return { changed: false, oldHash, newHash }
  }

  const diff    = computeLineDiff(oldContent, newContent)
  const added   = diff.filter((d) => d.type === 'add').length
  const removed = diff.filter((d) => d.type === 'remove').length

  const parts: string[] = []
  if (added   > 0) parts.push(`${added} line${added   !== 1 ? 's' : ''} added`)
  if (removed > 0) parts.push(`${removed} line${removed !== 1 ? 's' : ''} removed`)

  return {
    changed: true,
    oldHash,
    newHash,
    diff,
    summary: parts.join(', '),
  }
}

// ── Internal ──────────────────────────────────────────────────────

function extractContent(html: string, cssSelector?: string): string {
  const root = parse(html)

  // Remove noise
  root.querySelectorAll('script, style, noscript, nav, footer, header').forEach((el) => el.remove())

  const target = cssSelector
    ? (root.querySelector(cssSelector) ?? root.querySelector('body') ?? root)
    : (root.querySelector('main') ?? root.querySelector('article') ?? root.querySelector('body') ?? root)

  // Normalise: collapse whitespace, trim
  return target.text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex')
}

/**
 * Simple line-level diff (LCS-based).
 * Good enough for detecting meaningful page changes.
 */
function computeLineDiff(oldText: string, newText: string): TextDiff[] {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const result:  TextDiff[] = []

  // Build LCS table
  const m = oldLines.length
  const n = newLines.length
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack
  let i = m, j = n
  const ops: TextDiff[] = []

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      ops.push({ type: 'equal',  value: oldLines[i - 1] })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: 'add',    value: newLines[j - 1] })
      j--
    } else {
      ops.push({ type: 'remove', value: oldLines[i - 1] })
      i--
    }
  }

  return ops.reverse()
}
