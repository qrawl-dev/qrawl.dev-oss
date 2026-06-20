#!/usr/bin/env node
/**
 * qrawl-mcp — Model Context Protocol server for qrawl.dev
 *
 * Exposes all qrawl endpoints as MCP tools so any MCP-compatible
 * AI client (Claude Desktop, Cursor, Windsurf, VS Code, etc.)
 * can search, scrape, crawl, and map the web.
 *
 * Usage (cloud — recommended):
 *   QRAWL_API_KEY=qr-xxx npx qrawl-mcp
 *
 * Usage (self-hosted, no key):
 *   npx qrawl-mcp --local
 *
 * Claude Desktop config (~/.config/claude/claude_desktop_config.json):
 * {
 *   "mcpServers": {
 *     "qrawl": {
 *       "command": "npx",
 *       "args": ["-y", "qrawl-mcp"],
 *       "env": { "QRAWL_API_KEY": "qr-YOUR_KEY" }
 *     }
 *   }
 * }
 *
 * Cursor / Windsurf (.cursor/mcp.json or .windsurf/mcp.json):
 * {
 *   "mcpServers": {
 *     "qrawl": {
 *       "command": "npx",
 *       "args": ["-y", "qrawl-mcp"],
 *       "env": { "QRAWL_API_KEY": "qr-YOUR_KEY" }
 *     }
 *   }
 * }
 */

import { Server }                        from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport }          from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js'
import { z }                             from 'zod'
import { QrawlClient }                   from 'qrawl'
import { QrawlCore }                     from 'qrawl-core'

// ── Config ────────────────────────────────────────────────────────

const API_KEY   = process.env.QRAWL_API_KEY ?? ''
const USE_LOCAL = process.argv.includes('--local') || !API_KEY

const client = USE_LOCAL
  ? null
  : new QrawlClient({ apiKey: API_KEY })

const core = new QrawlCore()

function log(msg: string) {
  process.stderr.write(`[qrawl-mcp] ${msg}\n`)
}

// ── Tool definitions ──────────────────────────────────────────────

const TOOLS = [
  {
    name: 'qrawl_scrape',
    description: [
      'Scrape a single URL and return its content as clean Markdown, JSON, or HTML.',
      'Best for: extracting content from a specific known URL.',
      'Returns: page title, content in requested format, metadata (description, og tags), and all links found.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to scrape. Must be a valid http/https URL.',
        },
        format: {
          type: 'string',
          enum: ['markdown', 'json', 'html', 'text'],
          description: 'Output format. Default: markdown. Use json for structured data, text for plain content.',
          default: 'markdown',
        },
        screenshot: {
          type: 'boolean',
          description: '[CLOUD ONLY] Capture a screenshot of the page. Requires API key.',
          default: false,
        },
      },
      required: ['url'],
    },
  },

  {
    name: 'qrawl_search',
    description: [
      'Search the web and return results with their full content.',
      'Best for: finding current information, researching topics, finding multiple sources on a subject.',
      'Returns: list of results with URL, title, description, and optionally full page markdown.',
      'Tip: set scrapeContent:true to get full page markdown for each result in one call.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query. Supports site: operator, e.g. "site:docs.python.org async"',
        },
        limit: {
          type: 'number',
          description: 'Number of results to return. Default: 10. Max: 50.',
          default: 10,
        },
        scrapeContent: {
          type: 'boolean',
          description: 'Scrape full page markdown for each result. Slower but richer. Default: false.',
          default: false,
        },
        site: {
          type: 'string',
          description: 'Restrict results to this domain, e.g. "github.com"',
        },
        after: {
          type: 'string',
          description: 'Filter results after this date (YYYY-MM-DD)',
        },
      },
      required: ['query'],
    },
  },

  {
    name: 'qrawl_crawl',
    description: [
      'Crawl an entire website starting from a URL, following links up to a specified depth.',
      'Best for: indexing docs sites, extracting all content from a domain, building knowledge bases.',
      'Returns: all discovered pages with their content. Can be slow for large sites — use depth:1 or 2 for quick scans.',
      'Note: respects robots.txt by default.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The seed URL to start crawling from.',
        },
        depth: {
          type: 'number',
          description: 'Maximum BFS depth to follow links. Default: 2. Keep ≤3 for large sites.',
          default: 2,
        },
        maxPages: {
          type: 'number',
          description: 'Maximum number of pages to crawl. Default: 20 via MCP (cap for responsiveness).',
          default: 20,
        },
        format: {
          type: 'string',
          enum: ['markdown', 'json', 'html', 'text'],
          description: 'Output format for page content. Default: markdown.',
          default: 'markdown',
        },
        exclude: {
          type: 'array',
          items: { type: 'string' },
          description: 'URL path patterns to skip, e.g. ["/blog", "/archive"]',
        },
        include: {
          type: 'array',
          items: { type: 'string' },
          description: 'Only crawl URLs matching these patterns.',
        },
      },
      required: ['url'],
    },
  },

  {
    name: 'qrawl_map',
    description: [
      'Discover all URLs on a website quickly — via sitemap.xml or link discovery.',
      'Best for: understanding site structure before crawling, finding specific sections, auditing URL counts.',
      'Much faster than crawl — returns only URLs, no content.',
      'Returns: array of all discovered URLs and total count.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The domain or URL to map.',
        },
        depth: {
          type: 'number',
          description: 'Maximum depth for link discovery. Default: 2.',
          default: 2,
        },
      },
      required: ['url'],
    },
  },

  {
    name: 'qrawl_batch_scrape',
    description: [
      'Scrape multiple URLs concurrently in a single call.',
      'Best for: scraping a known list of URLs (e.g. from search results or a sitemap).',
      'Returns: array of scrape results, one per URL, with any failures listed separately.',
      'More efficient than calling qrawl_scrape in a loop.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        urls: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of URLs to scrape. Max 20 via MCP.',
          maxItems: 20,
        },
        format: {
          type: 'string',
          enum: ['markdown', 'json', 'html', 'text'],
          description: 'Output format. Default: markdown.',
          default: 'markdown',
        },
      },
      required: ['urls'],
    },
  },
]

// ── Tool execution ────────────────────────────────────────────────

async function executeTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    // ── qrawl_scrape ────────────────────────────────────────────
    case 'qrawl_scrape': {
      const url       = args.url as string
      const format    = (args.format as any) ?? 'markdown'
      const screenshot = Boolean(args.screenshot)

      const result = client
        ? await client.scrape(url, { format, screenshot })
        : await core.scrape(url, { format })

      return {
        url:         result.url,
        title:       result.page.title,
        content:     result.page.content,
        format:      result.page.format,
        statusCode:  result.page.statusCode,
        wordCount:   result.page.metadata.wordCount,
        description: result.page.metadata.description,
        links:       result.page.metadata.links.slice(0, 50), // cap for context window
        crawledAt:   result.page.crawledAt,
        elapsedMs:   result.elapsedMs,
      }
    }

    // ── qrawl_search ────────────────────────────────────────────
    case 'qrawl_search': {
      const query         = args.query as string
      const limit         = (args.limit as number) ?? 10
      const scrapeContent = Boolean(args.scrapeContent)
      const site          = args.site as string | undefined
      const after         = args.after as string | undefined

      const result = client
        ? await client.search(query, { limit, scrapeContent, site, after, format: 'markdown' })
        : await core.search(query, { limit, scrapeContent, site, after, format: 'markdown' })

      return {
        query:    result.query,
        total:    result.total,
        elapsedMs: result.elapsedMs,
        results: result.results.map((r) => ({
          position:    r.position,
          url:         r.url,
          title:       r.title,
          description: r.description,
          publishedAt: r.publishedAt,
          // Truncate content for context window efficiency
          content: r.content ? r.content.slice(0, 2000) + (r.content.length > 2000 ? '\n\n[truncated — use qrawl_scrape for full content]' : '') : undefined,
        })),
      }
    }

    // ── qrawl_crawl ─────────────────────────────────────────────
    case 'qrawl_crawl': {
      const url      = args.url as string
      const depth    = (args.depth as number) ?? 2
      const maxPages = Math.min((args.maxPages as number) ?? 20, 50) // MCP cap
      const format   = (args.format as any) ?? 'markdown'
      const exclude  = args.exclude as string[] | undefined
      const include  = args.include as string[] | undefined

      const result = client
        ? await client.crawl(url, { depth, maxPages, format, exclude, include })
        : await core.crawl(url, { depth, maxPages, format, exclude, include })

      return {
        id:              result.id,
        url:             result.url,
        status:          result.status,
        pagesCrawled:    result.pagesCrawled,
        pagesDiscovered: result.pagesDiscovered,
        pagesSkipped:    result.pagesSkipped,
        elapsedMs:       result.elapsedMs,
        // Summarise pages for context window — full content can be very large
        pages: result.pages.map((p) => ({
          url:      p.url,
          title:    p.title,
          wordCount: p.metadata.wordCount,
          // Truncate long pages
          content: p.content.length > 3000
            ? p.content.slice(0, 3000) + '\n\n[truncated]'
            : p.content,
        })),
        skippedReasons: result.skippedReasons.slice(0, 20),
      }
    }

    // ── qrawl_map ───────────────────────────────────────────────
    case 'qrawl_map': {
      const url   = args.url as string
      const depth = (args.depth as number) ?? 2

      const result = client
        ? await client.map(url, { depth })
        : await core.map(url, { depth })

      return {
        url:      result.url,
        total:    result.total,
        elapsedMs: result.elapsedMs,
        urls:     result.urls.slice(0, 500), // cap for context window
        truncated: result.urls.length > 500,
      }
    }

    // ── qrawl_batch_scrape ──────────────────────────────────────
    case 'qrawl_batch_scrape': {
      const urls    = (args.urls as string[]).slice(0, 20)
      const format  = (args.format as any) ?? 'markdown'

      if (client) {
        const result = await client.batchScrape(urls, { format })
        return {
          total:     result.total,
          succeeded: result.succeeded,
          elapsedMs: result.elapsedMs,
          results:   result.results.map((r) => ({
            url:      r.url,
            title:    r.page.title,
            content:  r.page.content.slice(0, 2000),
            wordCount: r.page.metadata.wordCount,
          })),
          failed: result.failed,
        }
      } else {
        // Local: run concurrently with core
        const BATCH = 5
        const results: any[] = []
        const failed:  any[] = []
        const start = Date.now()

        for (let i = 0; i < urls.length; i += BATCH) {
          const batch = urls.slice(i, i + BATCH)
          const settled = await Promise.allSettled(batch.map((u) => core.scrape(u, { format })))
          settled.forEach((r, j) => {
            if (r.status === 'fulfilled') {
              results.push({
                url:      r.value.url,
                title:    r.value.page.title,
                content:  r.value.page.content.slice(0, 2000),
                wordCount: r.value.page.metadata.wordCount,
              })
            } else {
              failed.push({ url: batch[j], error: r.reason?.message ?? 'error' })
            }
          })
        }
        return { total: urls.length, succeeded: results.length, elapsedMs: Date.now() - start, results, failed }
      }
    }

    default:
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`)
  }
}

// ── MCP Server ────────────────────────────────────────────────────

const server = new Server(
  {
    name:    'qrawl',
    version: '0.1.0',
  },
  {
    capabilities: { tools: {} },
  },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params

  try {
    log(`tool call: ${name} ${JSON.stringify(args).slice(0, 120)}`)
    const result = await executeTool(name, args as Record<string, unknown>)

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    }
  } catch (err: any) {
    log(`error in ${name}: ${err.message}`)

    // Surface qrawl errors clearly to the model
    if (err.code === 'CLOUD_FEATURE') {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: 'CLOUD_FEATURE',
            message: err.message,
            hint: 'Set QRAWL_API_KEY env var to enable cloud features. Get a key at https://qrawl.dev/dashboard',
          }),
        }],
        isError: true,
      }
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: err.code ?? 'ERROR', message: err.message }),
      }],
      isError: true,
    }
  }
})

// ── Start ─────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)

  const mode = USE_LOCAL
    ? 'local (qrawl-core, no API key)'
    : `cloud (api.qrawl.dev, key: ${API_KEY.slice(0, 10)}…)`

  log(`started — mode: ${mode}`)
  log(`tools: ${TOOLS.map((t) => t.name).join(', ')}`)
}

main().catch((err) => {
  process.stderr.write(`[qrawl-mcp] fatal: ${err.message}\n`)
  process.exit(1)
})
