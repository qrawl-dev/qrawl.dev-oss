"""
qrawl Python SDK

Official Python client for the qrawl.dev cloud API.

Usage:
    from qrawl import QrawlClient

    client = QrawlClient(api_key="qr-YOUR_KEY")

    # Scrape a page
    result = client.scrape("https://example.com")
    print(result.page.content)

    # Crawl a site
    result = client.crawl("https://docs.example.com", depth=3)
    print(f"Crawled {result.pages_crawled} pages")

    # Search the web
    result = client.search("web scraping best practices")
    for r in result.results:
        print(r.title, r.url)

    # Async usage
    from qrawl import AsyncQrawlClient
    async with AsyncQrawlClient(api_key="qr-YOUR_KEY") as client:
        result = await client.scrape("https://example.com")
"""

from __future__ import annotations

import os
from typing import Optional, List, Callable, Any, Iterator
from contextlib import contextmanager

import httpx

from .models import (
    CrawlOptions, CrawlResult,
    ScrapeOptions, ScrapeResult,
    SearchOptions, SearchResult,
    MapOptions, MapResult,
    BatchScrapeResult,
    Page,
)
from .exceptions import QrawlError, QrawlAuthError, QrawlQuotaError, QrawlCloudFeatureError

DEFAULT_BASE_URL = "https://api.qrawl.dev/v1"
DEFAULT_TIMEOUT  = 60.0
SDK_VERSION      = "0.1.0"


# ── Sync client ───────────────────────────────────────────────────

class QrawlClient:
    """
    Synchronous qrawl cloud API client.

    Args:
        api_key:  Your qrawl.dev API key (or set QRAWL_API_KEY env var)
        base_url: Override the API base URL
        timeout:  Request timeout in seconds (default: 60)
    """

    def __init__(
        self,
        api_key:  Optional[str] = None,
        base_url: str           = DEFAULT_BASE_URL,
        timeout:  float         = DEFAULT_TIMEOUT,
    ):
        key = api_key or os.environ.get("QRAWL_API_KEY", "")
        if not key:
            raise QrawlAuthError(
                "api_key is required. Pass it directly or set the QRAWL_API_KEY environment variable. "
                "Get a key at https://qrawl.dev/dashboard"
            )

        self._key      = key
        self._base_url = base_url.rstrip("/")
        self._client   = httpx.Client(
            base_url=self._base_url,
            headers=self._headers(),
            timeout=timeout,
        )

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self._key}",
            "Content-Type":  "application/json",
            "X-Qrawl-SDK":   f"qrawl-python/{SDK_VERSION}",
        }

    def _request(self, method: str, path: str, **kwargs) -> Any:
        response = self._client.request(method, path, **kwargs)
        return self._handle(response)

    def _handle(self, response: httpx.Response) -> Any:
        try:
            data = response.json()
        except Exception:
            raise QrawlError(f"Non-JSON response: {response.status_code}", response.status_code)

        if not data.get("success"):
            err     = data.get("error", {})
            code    = err.get("code", "INTERNAL")
            message = err.get("message", f"HTTP {response.status_code}")

            if code == "UNAUTHORIZED"    or response.status_code == 401:
                raise QrawlAuthError(message, response.status_code)
            if code == "QUOTA_EXCEEDED"  or response.status_code == 429:
                raise QrawlQuotaError(message, response.status_code)
            if code == "CLOUD_FEATURE":
                raise QrawlCloudFeatureError(message)

            raise QrawlError(message, response.status_code, code)

        return data.get("data")

    # ── Scrape ────────────────────────────────────────────────────

    def scrape(
        self,
        url:     str,
        options: Optional[ScrapeOptions] = None,
        **kwargs,
    ) -> ScrapeResult:
        """
        Scrape a single URL and return its content.

        Args:
            url:     The URL to scrape
            options: ScrapeOptions (format, screenshot, js_rendering, pii_filter)
            **kwargs: Shorthand — e.g. format="markdown", pii_filter=True

        Returns:
            ScrapeResult with .page.content (Markdown by default)
        """
        opts = _merge_options(ScrapeOptions, options, kwargs)
        data = self._request("POST", "/scrape", json={"url": url, "options": opts.model_dump(exclude_none=True)})
        return ScrapeResult.model_validate(data)

    # ── Crawl ─────────────────────────────────────────────────────

    def crawl(
        self,
        url:     str,
        options: Optional[CrawlOptions] = None,
        on_page: Optional[Callable[[Page], None]] = None,
        **kwargs,
    ) -> CrawlResult:
        """
        Crawl a website with BFS and return all discovered pages.

        Args:
            url:     Seed URL
            options: CrawlOptions (depth, max_pages, format, pii_filter, etc.)
            on_page: Optional callback called for each page as it arrives (streaming)
            **kwargs: Shorthand — e.g. depth=3, max_pages=100, pii_filter=True

        Returns:
            CrawlResult with .pages list
        """
        opts = _merge_options(CrawlOptions, options, kwargs)
        data = self._request("POST", "/crawl", json={"url": url, "options": opts.model_dump(exclude_none=True, by_alias=True)})
        return CrawlResult.model_validate(data)

    # ── Search ────────────────────────────────────────────────────

    def search(
        self,
        query:   str,
        options: Optional[SearchOptions] = None,
        **kwargs,
    ) -> SearchResult:
        """
        Search the web and return results with optional full-page content.

        Args:
            query:   Search query string
            options: SearchOptions (limit, scrape_content, site, after, etc.)
            **kwargs: Shorthand — e.g. limit=5, scrape_content=True

        Returns:
            SearchResult with .results list
        """
        opts = _merge_options(SearchOptions, options, kwargs)
        data = self._request("POST", "/search", json={"query": query, "options": opts.model_dump(exclude_none=True)})
        return SearchResult.model_validate(data)

    # ── Map ───────────────────────────────────────────────────────

    def map(
        self,
        url:     str,
        options: Optional[MapOptions] = None,
        **kwargs,
    ) -> MapResult:
        """
        Discover all URLs on a domain via sitemap or link discovery.

        Returns:
            MapResult with .urls list and .total count
        """
        opts = _merge_options(MapOptions, options, kwargs)
        data = self._request("POST", "/map", json={"url": url, "options": opts.model_dump(exclude_none=True)})
        return MapResult.model_validate(data)

    # ── Batch scrape ──────────────────────────────────────────────

    def batch_scrape(
        self,
        urls:    List[str],
        format:  str = "markdown",
        **kwargs,
    ) -> BatchScrapeResult:
        """
        Scrape multiple URLs concurrently.

        Args:
            urls:   List of URLs to scrape (max 500)
            format: Output format (markdown, json, html, text)

        Returns:
            BatchScrapeResult with .results and .failed lists
        """
        data = self._request("POST", "/batch-scrape", json={
            "urls": urls,
            "options": {"format": format, **kwargs},
        })
        return BatchScrapeResult.model_validate(data)

    # ── Job management ────────────────────────────────────────────

    def get_job(self, job_id: str) -> CrawlResult:
        """Get the result of a crawl job by ID."""
        data = self._request("GET", f"/crawl/{job_id}")
        return CrawlResult.model_validate(data)

    def cancel_job(self, job_id: str) -> bool:
        """Cancel an in-progress crawl job."""
        data = self._request("DELETE", f"/crawl/{job_id}")
        return data.get("cancelled", False)

    def close(self):
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


# ── Async client ──────────────────────────────────────────────────

class AsyncQrawlClient:
    """
    Async qrawl cloud API client using httpx.AsyncClient.

    Use with `async with` or call `.aclose()` when done.

    Example:
        async with AsyncQrawlClient(api_key="qr-...") as client:
            result = await client.scrape("https://example.com")
    """

    def __init__(
        self,
        api_key:  Optional[str] = None,
        base_url: str           = DEFAULT_BASE_URL,
        timeout:  float         = DEFAULT_TIMEOUT,
    ):
        key = api_key or os.environ.get("QRAWL_API_KEY", "")
        if not key:
            raise QrawlAuthError("api_key is required. Get a key at https://qrawl.dev/dashboard")

        self._key    = key
        self._client = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type":  "application/json",
                "X-Qrawl-SDK":   f"qrawl-python/{SDK_VERSION}",
            },
            timeout=timeout,
        )

    async def _request(self, method: str, path: str, **kwargs) -> Any:
        response = await self._client.request(method, path, **kwargs)
        return self._handle(response)

    def _handle(self, response: httpx.Response) -> Any:
        # Reuse the same logic as the sync client
        return QrawlClient._handle(self, response)  # type: ignore[arg-type]

    async def scrape(self, url: str, **kwargs) -> ScrapeResult:
        opts = _merge_options(ScrapeOptions, None, kwargs)
        data = await self._request("POST", "/scrape", json={"url": url, "options": opts.model_dump(exclude_none=True)})
        return ScrapeResult.model_validate(data)

    async def crawl(self, url: str, **kwargs) -> CrawlResult:
        opts = _merge_options(CrawlOptions, None, kwargs)
        data = await self._request("POST", "/crawl", json={"url": url, "options": opts.model_dump(exclude_none=True)})
        return CrawlResult.model_validate(data)

    async def search(self, query: str, **kwargs) -> SearchResult:
        opts = _merge_options(SearchOptions, None, kwargs)
        data = await self._request("POST", "/search", json={"query": query, "options": opts.model_dump(exclude_none=True)})
        return SearchResult.model_validate(data)

    async def map(self, url: str, **kwargs) -> MapResult:
        opts = _merge_options(MapOptions, None, kwargs)
        data = await self._request("POST", "/map", json={"url": url, "options": opts.model_dump(exclude_none=True)})
        return MapResult.model_validate(data)

    async def batch_scrape(self, urls: List[str], format: str = "markdown", **kwargs) -> BatchScrapeResult:
        data = await self._request("POST", "/batch-scrape", json={"urls": urls, "options": {"format": format, **kwargs}})
        return BatchScrapeResult.model_validate(data)

    async def aclose(self):
        await self._client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        await self.aclose()


# ── Helpers ───────────────────────────────────────────────────────

def _merge_options(cls, options, kwargs):
    """Merge an options object with shorthand kwargs."""
    if options is not None:
        if kwargs:
            merged = options.model_dump(exclude_none=True)
            merged.update({k: v for k, v in kwargs.items() if v is not None})
            return cls.model_validate(merged)
        return options
    return cls.model_validate({k: v for k, v in kwargs.items() if v is not None})
