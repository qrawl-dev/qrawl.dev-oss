/**
 * @qrawl-dev/openai-tools
 *
 * Ready-made tool definitions and handlers for:
 *   - OpenAI Agents SDK (agents-as-tools pattern)
 *   - OpenAI Chat Completions function calling
 *   - OpenAI Assistants API
 *
 * @example OpenAI Agents SDK
 * ```ts
 * import OpenAI from 'openai'
 * import { qrawlTools, executeQrawlTool } from '@qrawl-dev/openai-tools'
 *
 * const openai = new OpenAI()
 *
 * const runner = await openai.beta.chat.completions.runTools({
 *   model: 'gpt-4o',
 *   messages: [{ role: 'user', content: 'What are the latest LangChain docs saying about agents?' }],
 *   tools: qrawlTools({ apiKey: 'qr-YOUR_KEY' }),
 * })
 * ```
 *
 * @example Chat Completions function calling
 * ```ts
 * import OpenAI from 'openai'
 * import { qrawlFunctions, executeQrawlFunction } from '@qrawl-dev/openai-tools'
 *
 * const openai = new OpenAI()
 * const QRAWL_API_KEY = 'qr-YOUR_KEY'
 *
 * const response = await openai.chat.completions.create({
 *   model: 'gpt-4o',
 *   messages: [{ role: 'user', content: 'Summarise https://example.com/docs' }],
 *   tools: qrawlFunctions(),
 *   tool_choice: 'auto',
 * })
 *
 * // In your tool_call handler:
 * const result = await executeQrawlFunction(
 *   QRAWL_API_KEY,
 *   toolCall.function.name,
 *   JSON.parse(toolCall.function.arguments),
 * )
 * ```
 */

import { QrawlClient } from 'qrawl'

// ── Types ─────────────────────────────────────────────────────────

export interface QrawlToolsOptions {
  /** qrawl.dev API key */
  apiKey: string
  /** Max results for search. Default: 5 */
  searchLimit?: number
  /** Max pages for crawl. Default: 20 */
  crawlMaxPages?: number
}

// OpenAI-compatible tool definition shape
interface OAITool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

// OpenAI Agents SDK shape (tool with execute)
interface OAIAgentTool extends OAITool {
  execute: (args: Record<string, unknown>) => Promise<string>
}

// ── Tool JSON schemas ─────────────────────────────────────────────

export function qrawlFunctions(): OAITool[] {
  return [
    {
      type: 'function',
      function: {
        name: 'qrawl_scrape',
        description: 'Scrape a URL and return its content as clean Markdown. Use when you need to read the content of a specific web page.',
        parameters: {
          type: 'object',
          properties: {
            url:    { type: 'string', description: 'The URL to scrape (must start with http/https)' },
            format: { type: 'string', enum: ['markdown', 'json', 'html', 'text'], description: 'Output format. Default: markdown', default: 'markdown' },
          },
          required: ['url'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'qrawl_search',
        description: 'Search the web and return results with titles, URLs, and descriptions. Use for current information not in your training data.',
        parameters: {
          type: 'object',
          properties: {
            query:         { type: 'string', description: 'The search query' },
            limit:         { type: 'integer', description: 'Number of results to return (1-20). Default: 5', default: 5 },
            scrapeContent: { type: 'boolean', description: 'If true, also returns full page content for each result. Slower but richer.', default: false },
            site:          { type: 'string', description: 'Restrict results to this domain (e.g. "github.com")' },
          },
          required: ['query'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'qrawl_crawl',
        description: 'Recursively crawl an entire website and return content from all pages. Use for indexing docs sites or building knowledge bases. Can be slow — use depth:1 for quick overviews.',
        parameters: {
          type: 'object',
          properties: {
            url:      { type: 'string', description: 'The seed URL to crawl from' },
            depth:    { type: 'integer', description: 'Maximum link depth. Default: 2. Keep ≤ 3.', default: 2, minimum: 1, maximum: 5 },
            maxPages: { type: 'integer', description: 'Maximum pages to crawl. Default: 20.', default: 20, minimum: 1, maximum: 100 },
            format:   { type: 'string', enum: ['markdown', 'json', 'html', 'text'], default: 'markdown' },
          },
          required: ['url'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'qrawl_map',
        description: 'Discover all URLs on a website quickly without downloading content. Use to understand site structure or find specific sections before crawling.',
        parameters: {
          type: 'object',
          properties: {
            url:   { type: 'string', description: 'The domain or URL to map' },
            depth: { type: 'integer', description: 'Discovery depth. Default: 2.', default: 2 },
          },
          required: ['url'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'qrawl_batch_scrape',
        description: 'Scrape multiple URLs concurrently. More efficient than calling scrape in a loop. Use when you have a known list of URLs.',
        parameters: {
          type: 'object',
          properties: {
            urls:   { type: 'array', items: { type: 'string' }, description: 'Array of URLs to scrape (max 20)', maxItems: 20 },
            format: { type: 'string', enum: ['markdown', 'json', 'html', 'text'], default: 'markdown' },
          },
          required: ['urls'],
          additionalProperties: false,
        },
      },
    },
  ]
}

// ── Execution handler ─────────────────────────────────────────────

/**
 * Execute any qrawl function call by name.
 * Use this in your tool_call message handler.
 */
export async function executeQrawlFunction(
  apiKey: string,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const client = new QrawlClient({ apiKey })

  try {
    switch (name) {
      case 'qrawl_scrape': {
        const r = await client.scrape(args.url as string, {
          format: (args.format as any) ?? 'markdown',
        })
        return `# ${r.page.title ?? args.url}\n\n${r.page.content}`
      }

      case 'qrawl_search': {
        const r = await client.search(args.query as string, {
          limit:         (args.limit as number) ?? 5,
          scrapeContent: Boolean(args.scrapeContent),
          site:          args.site as string | undefined,
        })
        if (r.results.length === 0) return `No results for: "${args.query}"`
        return r.results.map((item, i) =>
          [
            `${i + 1}. **${item.title}** — ${item.url}`,
            item.description,
            item.content ? `\n${item.content.slice(0, 1500)}` : '',
          ].filter(Boolean).join('\n')
        ).join('\n\n---\n\n')
      }

      case 'qrawl_crawl': {
        const r = await client.crawl(args.url as string, {
          depth:    (args.depth as number) ?? 2,
          maxPages: (args.maxPages as number) ?? 20,
          format:   (args.format as any) ?? 'markdown',
        })
        const summary = `Crawled ${r.pagesCrawled} of ${r.pagesDiscovered} discovered pages.\n\n`
        const pages   = r.pages.map(p =>
          `## ${p.title ?? p.url}\n**URL:** ${p.url}\n\n${p.content.slice(0, 1000)}`
        ).join('\n\n---\n\n')
        return summary + pages
      }

      case 'qrawl_map': {
        const r = await client.map(args.url as string, {
          depth: (args.depth as number) ?? 2,
        })
        return `Found ${r.total} URLs on ${r.url}:\n\n${r.urls.slice(0, 100).join('\n')}${r.urls.length > 100 ? `\n…and ${r.urls.length - 100} more` : ''}`
      }

      case 'qrawl_batch_scrape': {
        const r = await client.batchScrape(args.urls as string[], {
          format: (args.format as any) ?? 'markdown',
        })
        const summary = `Scraped ${r.succeeded}/${r.total} URLs successfully.\n\n`
        const pages   = r.results.map(res =>
          `## ${res.page.title ?? res.url}\n${res.page.content.slice(0, 800)}`
        ).join('\n\n---\n\n')
        const errors = r.failed.length > 0
          ? `\n\nFailed: ${r.failed.map(f => `${f.url} — ${f.error}`).join(', ')}`
          : ''
        return summary + pages + errors
      }

      default:
        return `Unknown function: ${name}`
    }
  } catch (err: any) {
    return `Error calling ${name}: ${err.message}`
  }
}

// ── OpenAI Agents SDK helpers ─────────────────────────────────────

/**
 * Returns tools in OpenAI Agents SDK format (with execute methods).
 * Pass directly to runTools() or the Agents SDK.
 */
export function qrawlTools(options: QrawlToolsOptions): OAIAgentTool[] {
  return qrawlFunctions().map((tool) => ({
    ...tool,
    execute: (args: Record<string, unknown>) =>
      executeQrawlFunction(options.apiKey, tool.function.name, args),
  }))
}

// ── Assistants API helper ─────────────────────────────────────────

/**
 * Returns tool definitions in OpenAI Assistants API format.
 * Use when creating or updating an Assistant.
 */
export function qrawlAssistantTools(): OAITool[] {
  return qrawlFunctions()
}

// ── Named individual tool exports ─────────────────────────────────

export const QRAWL_SCRAPE_TOOL      = () => qrawlFunctions()[0]
export const QRAWL_SEARCH_TOOL      = () => qrawlFunctions()[1]
export const QRAWL_CRAWL_TOOL       = () => qrawlFunctions()[2]
export const QRAWL_MAP_TOOL         = () => qrawlFunctions()[3]
export const QRAWL_BATCH_SCRAPE_TOOL = () => qrawlFunctions()[4]
