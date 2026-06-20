"""
qrawl LangChain integration

Provides:
  - QrawlLoader:      Document loader for crawl/scrape → Document[]
  - QrawlSearchTool:  Tool for web search in agent chains
  - QrawlScrapeTool:  Tool for scraping a specific URL

Install:
    pip install "qrawl[langchain]"

Usage:
    from qrawl.langchain import QrawlLoader, QrawlSearchTool
    from langchain_openai import OpenAIEmbeddings, ChatOpenAI
    from langchain.vectorstores import FAISS
    from langchain.chains import RetrievalQA

    # Index a whole docs site
    loader = QrawlLoader(
        api_key="qr-YOUR_KEY",
        url="https://docs.example.com",
        mode="crawl",
        crawl_options={"depth": 3, "max_pages": 100},
    )
    docs  = loader.load()
    store = FAISS.from_documents(docs, OpenAIEmbeddings())
    qa    = RetrievalQA.from_chain_type(ChatOpenAI(), retriever=store.as_retriever())
    print(qa.run("How do I authenticate?"))
"""

from __future__ import annotations
from typing import List, Optional, Literal, Dict, Any

from qrawl import QrawlClient
from qrawl.models import Page

try:
    from langchain_core.documents import Document
    from langchain_core.document_loaders import BaseLoader
    from langchain_core.tools import BaseTool
    from pydantic import Field
    _LANGCHAIN_AVAILABLE = True
except ImportError:
    _LANGCHAIN_AVAILABLE = False
    # Provide stub base classes so the module can be imported without langchain
    class BaseLoader:       # type: ignore
        pass
    class BaseTool:         # type: ignore
        pass
    class Document:         # type: ignore
        def __init__(self, page_content: str, metadata: dict):
            self.page_content = page_content
            self.metadata     = metadata


LoaderMode = Literal["scrape", "crawl", "search"]


# ── QrawlLoader ───────────────────────────────────────────────────

class QrawlLoader(BaseLoader):
    """
    LangChain Document Loader for qrawl.

    Each crawled/scraped page becomes one Document:
      page_content = Markdown text
      metadata     = {url, title, description, word_count, crawled_at, source}

    Args:
        api_key:       qrawl.dev API key
        url:           URL to scrape/crawl, or search query string
        mode:          "scrape" | "crawl" | "search"
        crawl_options: dict passed to client.crawl()
        scrape_options: dict passed to client.scrape()
        search_options: dict passed to client.search()

    Example — load a docs site:
        loader = QrawlLoader(api_key="qr-...", url="https://docs.example.com", mode="crawl")
        docs = loader.load()

    Example — load search results:
        loader = QrawlLoader(api_key="qr-...", url="LangChain agents", mode="search",
                             search_options={"limit": 10, "scrape_content": True})
        docs = loader.load()
    """

    def __init__(
        self,
        api_key:        str,
        url:            str,
        mode:           LoaderMode          = "scrape",
        crawl_options:  Optional[Dict]      = None,
        scrape_options: Optional[Dict]      = None,
        search_options: Optional[Dict]      = None,
    ):
        self._client  = QrawlClient(api_key=api_key)
        self._url     = url
        self._mode    = mode
        self._crawl   = crawl_options  or {}
        self._scrape  = scrape_options or {}
        self._search  = search_options or {}

    def load(self) -> List[Document]:
        if self._mode == "scrape":
            return self._load_scrape()
        if self._mode == "crawl":
            return self._load_crawl()
        if self._mode == "search":
            return self._load_search()
        raise ValueError(f"Unknown mode: {self._mode}")

    def lazy_load(self):
        """Yield documents one at a time."""
        for doc in self.load():
            yield doc

    def _load_scrape(self) -> List[Document]:
        result = self._client.scrape(self._url, format="markdown", **self._scrape)
        return [_page_to_doc(result.page)]

    def _load_crawl(self) -> List[Document]:
        result = self._client.crawl(self._url, format="markdown", **self._crawl)
        return [_page_to_doc(p) for p in result.pages]

    def _load_search(self) -> List[Document]:
        result = self._client.search(
            self._url,
            scrape_content=True,
            format="markdown",
            **self._search,
        )
        return [
            _page_to_doc(r.page)
            for r in result.results
            if r.page is not None
        ]


# ── QrawlSearchTool ───────────────────────────────────────────────

class QrawlSearchTool(BaseTool):
    """
    LangChain Tool for web search via qrawl.

    Invoke with a search query string.
    Returns formatted results the LLM can reason over.

    Example:
        from langchain.agents import AgentExecutor, create_tool_calling_agent
        from langchain_openai import ChatOpenAI

        tools = [QrawlSearchTool(api_key="qr-...")]
        agent = create_tool_calling_agent(ChatOpenAI(), tools, prompt)
        AgentExecutor(agent=agent, tools=tools).invoke({"input": "..."})
    """

    name:        str = "qrawl_search"
    description: str = (
        "Search the web for current information. "
        "Input: a search query string. "
        "Returns titles, URLs, and content snippets from relevant pages. "
        "Use for questions about current events, recent releases, or live data."
    )

    _client: Any = None
    _limit:  int = 5
    _scrape_content: bool = False

    def __init__(self, api_key: str, limit: int = 5, scrape_content: bool = False):
        super().__init__()
        self._client        = QrawlClient(api_key=api_key)
        self._limit         = limit
        self._scrape_content = scrape_content

    def _run(self, query: str) -> str:
        result = self._client.search(
            query,
            limit=self._limit,
            scrape_content=self._scrape_content,
        )
        if not result.results:
            return f'No results found for: "{query}"'

        parts = []
        for i, r in enumerate(result.results, 1):
            part = [f"{i}. **{r.title}**\n   URL: {r.url}\n   {r.description}"]
            if r.content:
                part.append(f"\n{r.content[:1500]}")
            parts.append("\n".join(part))

        return "\n\n---\n\n".join(parts)

    async def _arun(self, query: str) -> str:
        # Async version — runs sync in executor for simplicity
        import asyncio
        return await asyncio.get_event_loop().run_in_executor(None, self._run, query)


# ── QrawlScrapeTool ───────────────────────────────────────────────

class QrawlScrapeTool(BaseTool):
    """
    LangChain Tool that fetches and reads a specific URL.

    Input: a valid http/https URL.
    Returns: page title + full Markdown content.
    """

    name:        str = "qrawl_scrape"
    description: str = (
        "Fetch and read the content of a specific URL as Markdown. "
        "Input: a valid http/https URL. "
        "Returns the page title and full content. "
        "Use when you have a specific URL you need to read."
    )

    _client: Any = None

    def __init__(self, api_key: str):
        super().__init__()
        self._client = QrawlClient(api_key=api_key)

    def _run(self, url: str) -> str:
        url = url.strip()
        if not url.startswith("http"):
            return f"Error: input must be a valid URL, got: {url!r}"
        result = self._client.scrape(url, format="markdown")
        title  = result.page.title or url
        return f"# {title}\n\n{result.page.content}"

    async def _arun(self, url: str) -> str:
        import asyncio
        return await asyncio.get_event_loop().run_in_executor(None, self._run, url)


# ── Helpers ───────────────────────────────────────────────────────

def _page_to_doc(page: Page) -> Document:
    return Document(
        page_content=page.content,
        metadata={
            "source":      page.url,
            "url":         page.url,
            "title":       page.title or "",
            "description": page.metadata.description or "",
            "word_count":  page.metadata.word_count,
            "crawled_at":  page.crawled_at,
            "og_image":    page.metadata.og_image or "",
        },
    )
