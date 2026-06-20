"""qrawl exception classes."""
from __future__ import annotations
from typing import Optional


class QrawlError(Exception):
    """Base exception for all qrawl errors."""

    def __init__(self, message: str, status_code: Optional[int] = None, code: Optional[str] = None):
        super().__init__(message)
        self.message     = message
        self.status_code = status_code
        self.code        = code or "INTERNAL"

    def __repr__(self) -> str:
        return f"{type(self).__name__}(code={self.code!r}, message={self.message!r})"


class QrawlAuthError(QrawlError):
    """Raised when authentication fails (invalid/expired/missing API key)."""
    def __init__(self, message: str, status_code: int = 401):
        super().__init__(message, status_code, "UNAUTHORIZED")


class QrawlQuotaError(QrawlError):
    """Raised when the monthly page quota is exceeded."""
    def __init__(self, message: str, status_code: int = 429):
        super().__init__(message, status_code, "QUOTA_EXCEEDED")


class QrawlCloudFeatureError(QrawlError):
    """
    Raised when a cloud-only feature is requested but no API key is set,
    or when the feature requires a higher plan.
    """
    def __init__(self, message: str):
        super().__init__(
            message + " — get a key at https://qrawl.dev/dashboard",
            403,
            "CLOUD_FEATURE",
        )


class QrawlRateLimitError(QrawlError):
    """Raised when the API rate limit is hit (distinct from quota)."""
    def __init__(self, message: str = "Rate limit exceeded. Please slow down requests."):
        super().__init__(message, 429, "RATE_LIMITED")


class QrawlNetworkError(QrawlError):
    """Raised when a network error occurs (timeout, DNS failure, etc.)."""
    def __init__(self, message: str):
        super().__init__(message, None, "NETWORK_ERROR")
