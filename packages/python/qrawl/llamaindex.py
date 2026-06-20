"""
qrawl LlamaIndex integration

Provides:
  - QrawlReader:         BaseReader for loading web content as nodes
  - QrawlWebSearchTool:  FunctionTool for agent workflows
  - QrawlScrapePageTool: FunctionTool for reading a specific URL

Install:
    pip install "qrawl[llamaindex]"

Usage:
    from qrawl.llamaindex import QrawlReader
    from llama_index.core import VectorStoreIndex

    reader = QrawlReader(api_key="qr-YOUR_KEY")
    docs   = reader.load_data("https://docs.example.com", mode="crawl",
                               crawl_options={"depth": 3, "max_pages": 50})
    index  = VectorStoreIndex.from_documents(docs)
    engine = index.as_query_engine()
    print(engine.query("How do I authenticate?"))
"""

from __future__ import annotations
from typing import List, Optional, Dict, Any, Literal

from qrawl import QrawlClient
from qrawl.models import Page

try:
    from llama_index.core import Document
    from llama_index.core.readers.base import BaseReader
    from llama_index.core.tools import FunctionTool
    _LLAMA_AVAILABLE = True
except ImportError:
    _LLAMA_AVAILABLE = False
    class Document:         # type: ignore
        def __init__(self, text: str, metadata: dict = None):
            self.text     = text
            self.metadata = metadata or {}
            self.doc_id   = metadata.get("url", "") if metadata else ""
    class BaseReader:       # type: ignore
        pass
    class FunctionTool:     # type: ignore
        pass


LoaderMode = Literal["scrape", "crawl", "search"]


# ── QrawlReader ───────────────────────────────────────────────────

class QrawlReader(BaseReader):
    """
    LlamaIndex BaseReader for qrawl.

    Each page becomes one Document with text = Markdown content.

    Args:
        api_key: qrawl.dev API key

    Example:
        reader = QrawlReader(api_key="qr-...")
        docs   = reader.load_data("https://docs.example.com",
                                   mode="crawl",
                                   crawl_options={"depth": 3})
        index  = VectorStoreIndex.from_documents(docs)
    """

    def __init__(self, api_key: str):
        self._client = QrawlClient(api_key=api_key)

    def load_data(
        self,
        url_or_query:   str,
        mode:           LoaderMode     = "scrape",
        crawl_options:  Optional[Dict] = None,
        scrape_options: Optional[Dict] = None,
        search_options: Optional[Dict] = None,
    ) -> List[Document]:
        """
        Load web content as LlamaIndex Documents.

        Args:
            url_or_query:  URL (for scrape/crawl) or query string (for search)
            mode:          "scrape" | "crawl" | "search"
            crawl_options: Kwargs for client.crawl()
            scrape_options: Kwargs for client.scrape()
            search_options: Kwargs for client.search()

        Returns:
            List of Document objects
        """
        if mode == "scrape":
            result = self._client.scrape(url_or_query, format="markdown", **(scrape_options or {}))
            return [_page_to_doc(result.page)]

        if mode == "crawl":
            result = self._client.crawl(url_or_query, format="markdown", **(crawl_options or {}))
            return [_page_to_doc(p) for p in result.pages]

        if mode == "search":
            result = self._client.search(
                url_or_query,
                scrape_content=True,
                format="markdown",
                **(search_options or {}),
            )
            return [_page_to_doc(r.page) for r in result.results if r.page]

        raise ValueError(f"Unknown mode: {mode!r}. Use 'scrape', 'crawl', or 'search'.")


# ── FunctionTool factories ────────────────────────────────────────

def create_web_search_tool(api_key: str, limit: int = 5, scrape_content: bool = False) -> "FunctionTool":
    """
    Create a LlamaIndex FunctionTool for web search.

    Example:
        from llama_index.core.agent import ReActAgent
        agent = ReActAgent.from_tools([create_web_search_tool(api_key="qr-...")])
    """
    client = QrawlClient(api_key=api_key)

    def qrawl_web_search(query: str) -> str:
        """
        Search the web for current information.

        Args:
            query: The search query

        Returns:
            Formatted list of results with titles, URLs, and content
        """
        result = client.search(query, limit=limit, scrape_content=scrape_content)
        if not result.results:
            return f'No web results found for: "{query}"'

        parts = []
        for i, r in enumerate(result.results, 1):
            lines = [f"{i}. {r.title}", f"   {r.url}", f"   {r.description}"]
            if r.content:
                lines.append(f"\n{r.content[:1200]}")
            parts.append("\n".join(lines))

        return "\n\n---\n\n".join(parts)

    if _LLAMA_AVAILABLE:
        return FunctionTool.from_defaults(fn=qrawl_web_search)

    return qrawl_web_search  # type: ignore


def create_scrape_page_tool(api_key: str) -> "FunctionTool":
    """
    Create a LlamaIndex FunctionTool for scraping a specific URL.

    Example:
        tools = [create_scrape_page_tool(api_key="qr-...")]
    """
    client = QrawlClient(api_key=api_key)

    def qrawl_scrape_page(url: str) -> str:
        """
        Fetch and read the Markdown content of a specific URL.

        Args:
            url: The http/https URL to scrape

        Returns:
            Page title and full Markdown content
        """
        if not url.strip().startswith("http"):
            return f"Error: must be a valid URL, got: {url!r}"
        result = self._client.scrape(url.strip(), format="markdown")
        return f"# {result.page.title or url}\n\n{result.page.content}"

    if _LLAMA_AVAILABLE:
        return FunctionTool.from_defaults(fn=qrawl_scrape_page)

    return qrawl_scrape_page  # type: ignore


# ── Helpers ───────────────────────────────────────────────────────

def _page_to_doc(page: Page) -> Document:
    meta = {
        "source":      page.url,
        "url":         page.url,
        "title":       page.title or "",
        "description": page.metadata.description or "",
        "word_count":  str(page.metadata.word_count),
        "crawled_at":  page.crawled_at,
    }
    if _LLAMA_AVAILABLE:
        return Document(text=page.content, metadata=meta)
    return Document(text=page.content, metadata=meta)  # type: ignore
