# qrawl-mcp

Connect any MCP-compatible AI client to the live web via qrawl.

**Works with:** Claude Desktop, Cursor, Windsurf, VS Code (Copilot), Zed, Continue, and any MCP client.

## Install

```bash
npm install -g qrawl-mcp
# or use directly with npx — no install needed
```

## Quick setup

### Claude Desktop

Edit `~/.config/claude/claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "qrawl": {
      "command": "npx",
      "args": ["-y", "qrawl-mcp"],
      "env": {
        "QRAWL_API_KEY": "qr-YOUR_KEY"
      }
    }
  }
}
```

Restart Claude Desktop. You'll see a 🔌 icon indicating qrawl is connected.

### Cursor

Create or edit `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "qrawl": {
      "command": "npx",
      "args": ["-y", "qrawl-mcp"],
      "env": {
        "QRAWL_API_KEY": "qr-YOUR_KEY"
      }
    }
  }
}
```

### Windsurf

Edit `~/.windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "qrawl": {
      "command": "npx",
      "args": ["-y", "qrawl-mcp"],
      "env": {
        "QRAWL_API_KEY": "qr-YOUR_KEY"
      }
    }
  }
}
```

### VS Code (GitHub Copilot)

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "qrawl": {
      "command": "npx",
      "args": ["-y", "qrawl-mcp"],
      "env": {
        "QRAWL_API_KEY": "qr-YOUR_KEY"
      }
    }
  }
}
```

### Self-hosted (no API key)

Run without a key — uses `qrawl-core` locally (DuckDuckGo search, no JS rendering):

```json
{
  "mcpServers": {
    "qrawl": {
      "command": "npx",
      "args": ["-y", "qrawl-mcp", "--local"]
    }
  }
}
```

## Tools

Once connected, your AI client can call these tools:

| Tool | Description |
|------|-------------|
| `qrawl_scrape` | Scrape a URL → Markdown, JSON, HTML, or text |
| `qrawl_search` | Search the web + optionally scrape full content |
| `qrawl_crawl` | Recursively crawl a site up to N pages |
| `qrawl_map` | Discover all URLs on a domain |
| `qrawl_batch_scrape` | Scrape multiple URLs concurrently |

### Example prompts

```
"Scrape https://docs.example.com/api and summarise the authentication section"

"Search for 'Next.js 15 new features' and give me a summary from the top 3 results"

"Crawl https://docs.example.com with depth 2 and find all mentions of rate limiting"

"Map https://stripe.com/docs and tell me how many pages are in the /payments section"

"Batch scrape these 5 URLs and compare their pricing pages: [url1, url2, url3, url4, url5]"
```

## Get an API key

Get a free API key (1,000 pages/month) at **https://qrawl.dev/dashboard** — no credit card required.

## License

MIT
