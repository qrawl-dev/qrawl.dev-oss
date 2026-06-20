"""
qrawl Python SDK tests

Run: pip install pytest pytest-httpx && pytest tests/
"""
import pytest
import json
from unittest.mock import patch, MagicMock

from qrawl import QrawlClient, QrawlAuthError, QrawlQuotaError, QrawlCloudFeatureError


# ── Fixtures ──────────────────────────────────────────────────────

MOCK_CRAWL = {
    "id": "job-123", "url": "https://example.com", "status": "complete",
    "pages": [{
        "url": "https://example.com", "title": "Example", "content": "# Hello",
        "format": "markdown", "status_code": 200, "crawled_at": "2025-06-01T00:00:00Z",
        "metadata": { "word_count": 1, "links": [] }
    }],
    "pages_discovered": 1, "pages_crawled": 1, "pages_skipped": 0,
    "skipped_reasons": [], "elapsed_ms": 800,
    "started_at": "2025-06-01T00:00:00Z", "completed_at": "2025-06-01T00:00:01Z",
}

MOCK_SCRAPE = {
    "url": "https://example.com",
    "page": {
        "url": "https://example.com", "title": "Example", "content": "# Hello World",
        "format": "markdown", "status_code": 200, "crawled_at": "2025-06-01T00:00:00Z",
        "metadata": { "description": "A test page", "word_count": 3, "links": [] }
    },
    "elapsed_ms": 320,
}

MOCK_SEARCH = {
    "query": "web scraping",
    "results": [
        { "url": "https://example.com/1", "title": "Article 1", "description": "Snippet 1", "position": 1 },
        { "url": "https://example.com/2", "title": "Article 2", "description": "Snippet 2", "position": 2 },
    ],
    "total": 2, "elapsed_ms": 450,
}

MOCK_MAP = {
    "url": "https://example.com",
    "urls": ["https://example.com/", "https://example.com/about", "https://example.com/docs"],
    "total": 3, "elapsed_ms": 120,
}


def ok(data):
    return {"success": True, "data": data, "requestId": "req-test"}

def err(code, message, status=400):
    return {"success": False, "error": {"code": code, "message": message}, "requestId": "req-test"}


# ── Client instantiation ──────────────────────────────────────────

class TestClientInit:
    def test_raises_without_key(self):
        with pytest.raises(QrawlAuthError):
            QrawlClient(api_key="")

    def test_reads_env_var(self, monkeypatch):
        monkeypatch.setenv("QRAWL_API_KEY", "qr-from-env")
        client = QrawlClient()
        assert client._key == "qr-from-env"

    def test_context_manager(self):
        with QrawlClient(api_key="qr-test") as client:
            assert client._key == "qr-test"


# ── Scrape ────────────────────────────────────────────────────────

class TestScrape:
    def test_returns_scrape_result(self, respx_mock):
        import httpx, respx
        respx_mock.post("https://api.qrawl.dev/v1/scrape").mock(
            return_value=httpx.Response(200, json=ok(MOCK_SCRAPE))
        )
        client = QrawlClient(api_key="qr-test")
        result = client.scrape("https://example.com")
        assert result.url == "https://example.com"
        assert result.page.title == "Example"
        assert result.page.content == "# Hello World"
        assert result.page.format == "markdown"

    def test_passes_format_option(self, respx_mock):
        import httpx
        req = None
        def capture(request):
            nonlocal req
            req = request
            return httpx.Response(200, json=ok(MOCK_SCRAPE))
        respx_mock.post("https://api.qrawl.dev/v1/scrape").mock(side_effect=capture)

        client = QrawlClient(api_key="qr-test")
        client.scrape("https://example.com", format="json")
        body = json.loads(req.content)
        assert body["options"]["format"] == "json"

    def test_raises_auth_error_on_401(self, respx_mock):
        import httpx
        respx_mock.post("https://api.qrawl.dev/v1/scrape").mock(
            return_value=httpx.Response(401, json=err("UNAUTHORIZED", "Invalid API key", 401))
        )
        client = QrawlClient(api_key="qr-bad")
        with pytest.raises(QrawlAuthError):
            client.scrape("https://example.com")

    def test_raises_quota_error_on_429(self, respx_mock):
        import httpx
        respx_mock.post("https://api.qrawl.dev/v1/scrape").mock(
            return_value=httpx.Response(429, json=err("QUOTA_EXCEEDED", "Quota exceeded", 429))
        )
        client = QrawlClient(api_key="qr-test")
        with pytest.raises(QrawlQuotaError):
            client.scrape("https://example.com")


# ── Crawl ─────────────────────────────────────────────────────────

class TestCrawl:
    def test_returns_crawl_result(self, respx_mock):
        import httpx
        respx_mock.post("https://api.qrawl.dev/v1/crawl").mock(
            return_value=httpx.Response(200, json=ok(MOCK_CRAWL))
        )
        client = QrawlClient(api_key="qr-test")
        result = client.crawl("https://example.com", depth=2)
        assert result.status == "complete"
        assert result.pages_crawled == 1
        assert len(result.pages) == 1

    def test_sends_options(self, respx_mock):
        import httpx
        captured = {}
        def capture(request):
            captured.update(json.loads(request.content))
            return httpx.Response(200, json=ok(MOCK_CRAWL))
        respx_mock.post("https://api.qrawl.dev/v1/crawl").mock(side_effect=capture)

        client = QrawlClient(api_key="qr-test")
        client.crawl("https://example.com", depth=3, max_pages=50, pii_filter=True)

        assert captured["options"].get("pii_filter") is True
        assert captured["options"].get("depth") == 3
        assert captured["options"].get("max_pages") == 50


# ── Search ────────────────────────────────────────────────────────

class TestSearch:
    def test_returns_search_result(self, respx_mock):
        import httpx
        respx_mock.post("https://api.qrawl.dev/v1/search").mock(
            return_value=httpx.Response(200, json=ok(MOCK_SEARCH))
        )
        client = QrawlClient(api_key="qr-test")
        result = client.search("web scraping")
        assert result.query == "web scraping"
        assert len(result.results) == 2
        assert result.results[0].title == "Article 1"

    def test_sends_limit(self, respx_mock):
        import httpx
        captured = {}
        def capture(request):
            captured.update(json.loads(request.content))
            return httpx.Response(200, json=ok(MOCK_SEARCH))
        respx_mock.post("https://api.qrawl.dev/v1/search").mock(side_effect=capture)

        client = QrawlClient(api_key="qr-test")
        client.search("test", limit=3)
        assert captured["options"]["limit"] == 3


# ── Map ───────────────────────────────────────────────────────────

class TestMap:
    def test_returns_map_result(self, respx_mock):
        import httpx
        respx_mock.post("https://api.qrawl.dev/v1/map").mock(
            return_value=httpx.Response(200, json=ok(MOCK_MAP))
        )
        client = QrawlClient(api_key="qr-test")
        result = client.map("https://example.com")
        assert result.total == 3
        assert "https://example.com/about" in result.urls


# ── Async client ──────────────────────────────────────────────────

class TestAsyncClient:
    @pytest.mark.asyncio
    async def test_async_scrape(self, respx_mock):
        import httpx
        from qrawl import AsyncQrawlClient
        respx_mock.post("https://api.qrawl.dev/v1/scrape").mock(
            return_value=httpx.Response(200, json=ok(MOCK_SCRAPE))
        )
        async with AsyncQrawlClient(api_key="qr-test") as client:
            result = await client.scrape("https://example.com")
            assert result.page.title == "Example"
