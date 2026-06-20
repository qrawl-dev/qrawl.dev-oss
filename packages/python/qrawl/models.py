"""
qrawl Python SDK — type models

Mirrors the TypeScript @qrawl/types package.
"""
from __future__ import annotations
from typing import Optional, List, Literal, Any, Dict
from pydantic import BaseModel, Field
from datetime import datetime


OutputFormat = Literal["markdown", "json", "html", "text"]


# ── Input options ─────────────────────────────────────────────────

class CrawlOptions(BaseModel):
    depth:          Optional[int]          = Field(default=3,    ge=1, le=10)
    max_pages:      Optional[int]          = Field(default=500,  ge=1)
    format:         Optional[OutputFormat] = "markdown"
    respect_robots: Optional[bool]        = True
    crawl_delay:    Optional[int]          = 1000
    same_domain:    Optional[bool]        = True
    exclude:        Optional[List[str]]   = None
    include:        Optional[List[str]]   = None
    # Cloud-only
    pii_filter:     Optional[bool]        = None
    scan_tos:       Optional[bool]        = None
    js_rendering:   Optional[bool]        = None
    webhook:        Optional[str]         = None


class ScrapeOptions(BaseModel):
    format:       Optional[OutputFormat] = "markdown"
    screenshot:   Optional[bool]        = False
    wait_for:     Optional[str]         = None
    # Cloud-only
    js_rendering: Optional[bool]        = None
    pii_filter:   Optional[bool]        = None


class SearchOptions(BaseModel):
    limit:          Optional[int]          = Field(default=10, ge=1, le=50)
    scrape_content: Optional[bool]        = False
    format:         Optional[OutputFormat] = "markdown"
    site:           Optional[str]         = None
    after:          Optional[str]         = None
    before:         Optional[str]         = None
    # Cloud-only
    include_images: Optional[bool]        = None
    include_news:   Optional[bool]        = None


class MapOptions(BaseModel):
    depth:            Optional[int]  = Field(default=2, ge=1, le=5)
    include_external: Optional[bool] = False


# ── Output types ──────────────────────────────────────────────────

class PageMetadata(BaseModel):
    description:  Optional[str]  = None
    og_image:     Optional[str]  = None
    author:       Optional[str]  = None
    published_at: Optional[str]  = None
    word_count:   int            = 0
    links:        List[str]      = Field(default_factory=list)


class Page(BaseModel):
    url:         str
    title:       Optional[str]
    content:     str
    format:      OutputFormat
    status_code: int
    crawled_at:  str
    metadata:    PageMetadata
    screenshot:  Optional[str] = None  # base64 PNG


class SkipReason(BaseModel):
    url:    str
    reason: Literal["robots", "excluded", "max-depth", "max-pages", "error", "tos"]
    detail: Optional[str] = None


class TosFlag(BaseModel):
    url:      str
    clause:   str
    severity: Literal["warn", "block"]


class CrawlResult(BaseModel):
    id:               str
    url:              str
    status:           Literal["complete", "partial", "failed"]
    pages:            List[Page]
    pages_discovered: int
    pages_crawled:    int
    pages_skipped:    int
    skipped_reasons:  List[SkipReason]
    elapsed_ms:       int
    started_at:       str
    completed_at:     str
    # Cloud-only
    pii_redacted:     Optional[int]      = None
    tos_flags:        Optional[List[TosFlag]] = None
    compliant:        Optional[bool]     = None


class ScrapeResult(BaseModel):
    url:         str
    page:        Page
    elapsed_ms:  int
    pii_redacted: Optional[int] = None


class MapResult(BaseModel):
    url:       str
    urls:      List[str]
    total:     int
    elapsed_ms: int


class SearchResultItem(BaseModel):
    url:          str
    title:        str
    description:  str
    content:      Optional[str] = None
    page:         Optional[Page] = None
    position:     int
    published_at: Optional[str] = None
    source:       Optional[str] = None


class SearchResult(BaseModel):
    query:     str
    results:   List[SearchResultItem]
    total:     int
    elapsed_ms: int


class BatchScrapeResult(BaseModel):
    id:        str
    status:    Literal["complete", "partial", "failed"]
    results:   List[ScrapeResult]
    failed:    List[Dict[str, str]]
    total:     int
    succeeded: int
    elapsed_ms: int
