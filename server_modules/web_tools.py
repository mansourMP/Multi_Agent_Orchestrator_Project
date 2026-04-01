from __future__ import annotations

import html
import re
from typing import Any, Dict, List
from urllib import parse as urlparse
from urllib import request as urlrequest


DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36"
)


def _fetch_url(url: str, *, timeout: int = 15) -> str:
    request = urlrequest.Request(
        str(url or "").strip(),
        headers={
            "User-Agent": DEFAULT_USER_AGENT,
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    with urlrequest.urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8", "ignore")


def _strip_html(raw_html: str) -> str:
    text = re.sub(r"(?is)<script[^>]*>.*?</script>", " ", str(raw_html or ""))
    text = re.sub(r"(?is)<style[^>]*>.*?</style>", " ", text)
    text = re.sub(r"(?is)<noscript[^>]*>.*?</noscript>", " ", text)
    text = re.sub(r"(?is)<br\s*/?>", "\n", text)
    text = re.sub(r"(?is)</p\s*>", "\n\n", text)
    text = re.sub(r"(?is)<[^>]+>", " ", text)
    text = html.unescape(text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def web_fetch(url: str) -> str:
    normalized_url = str(url or "").strip()
    if not normalized_url:
        raise RuntimeError("web_fetch requires a URL.")
    raw_html = _fetch_url(normalized_url)
    cleaned = _strip_html(raw_html)
    if not cleaned:
        return f"Fetched {normalized_url} but could not extract readable text."
    excerpt = cleaned[:12000].rstrip()
    return f"Source: {normalized_url}\n\n{excerpt}"


def _clean_result_url(url: str) -> str:
    normalized = str(url or "").strip()
    if normalized.startswith("//"):
        return f"https:{normalized}"
    return normalized


def web_search(query: str) -> List[Dict[str, str]]:
    normalized_query = str(query or "").strip()
    if not normalized_query:
        return []
    encoded_query = urlparse.quote_plus(normalized_query)
    html_text = _fetch_url(f"https://html.duckduckgo.com/html/?q={encoded_query}")
    pattern = re.compile(
        r'(?is)<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="(?P<url>[^"]+)"[^>]*>(?P<title>.*?)</a>.*?'
        r'<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>(?P<snippet>.*?)</a>'
    )
    results: List[Dict[str, str]] = []
    seen: set[str] = set()
    for match in pattern.finditer(html_text):
        url = _clean_result_url(html.unescape(match.group("url") or ""))
        title = _strip_html(match.group("title") or "")
        snippet = _strip_html(match.group("snippet") or "")
        if not url or url in seen:
            continue
        seen.add(url)
        results.append({"title": title[:240], "url": url[:1200], "snippet": snippet[:600]})
        if len(results) >= 5:
            break
    return results
