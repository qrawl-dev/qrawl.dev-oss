"""
qrawl — Official Python SDK for qrawl.dev

Web crawling infrastructure for AI agents.

Quick start:
    from qrawl import QrawlClient

    client = QrawlClient(api_key="qr-YOUR_KEY")
    # or: client = QrawlClient()  # reads QRAWL_API_KEY env var

    # Scrape
    result = client.scrape("https://example.com")
    print(result.page.content)          # Markdown

    # Crawl
    result = client.crawl("https://docs.example.com", depth=3)
    for page in result.pages:
        print(page.url, page.metadata.word_count)

    # Search
    result = client.search("LLM web crawling", limit=5)
    for r in result.results:
        print(r.title, r.url)

    # Map
    result = client.map("https://example.com")
    print(f"Found {result.total} URLs")

    # Async
    from qrawl import AsyncQrawlClient
    import asyncio

    async def main():
        async with AsyncQrawlClient() as client:
            result = await client.scrape("https://example.com")
            print(result.page.content)

    asyncio.run(main())
"""

from .client     import QrawlClient, AsyncQrawlClient
from .models     import (
    CrawlOptions, CrawlResult,
    ScrapeOptions, ScrapeResult,
    SearchOptions, SearchResult,
    MapOptions, MapResult,
    BatchScrapeResult,
    Page, PageMetadata,
    SkipReason, TosFlag,
    OutputFormat,
)
from .exceptions import (
    QrawlError,
    QrawlAuthError,
    QrawlQuotaError,
    QrawlCloudFeatureError,
    QrawlRateLimitError,
    QrawlNetworkError,
)

__version__ = "0.1.0"
__all__ = [
    # Clients
    "QrawlClient",
    "AsyncQrawlClient",
    # Options
    "CrawlOptions",
    "ScrapeOptions",
    "SearchOptions",
    "MapOptions",
    # Results
    "CrawlResult",
    "ScrapeResult",
    "SearchResult",
    "MapResult",
    "BatchScrapeResult",
    # Models
    "Page",
    "PageMetadata",
    "SkipReason",
    "TosFlag",
    "OutputFormat",
    # Exceptions
    "QrawlError",
    "QrawlAuthError",
    "QrawlQuotaError",
    "QrawlCloudFeatureError",
    "QrawlRateLimitError",
    "QrawlNetworkError",
]
