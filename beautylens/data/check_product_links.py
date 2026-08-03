"""
Verifies the catalog's retailer links and strips the ones that are provably gone.

Both upstream sources are snapshots -- The Pudding scraped Sephora/Ulta in Jan
2021, and the Makeup API dataset is older still. Colour survives that fine;
product *pages* do not. A "View at retailer" button that 404s is worse than no
button, so this pass resolves every distinct URL once and clears source_url on
the rows whose page is confirmed dead.

    Usage:
        python data/check_product_links.py            # check, then write back
        python data/check_product_links.py --dry-run  # report only
        python data/check_product_links.py --recheck  # ignore the cache

What counts as dead, and what deliberately does not:

    dead      404, 410, DNS failure, connection refused, or a 200 that landed
              on a site root / search page (the soft-404 redirect pattern)
    ALIVE     a 2xx that returned a real document at a real product path
    unknown   403, 429, 5xx, timeouts, empty interstitial bodies

Large retailers routinely answer bots with 403 or 429, and a 5xx is their
problem rather than evidence the product is gone. Treating those as dead would
silently delete good links -- so only the unambiguous signals strip a URL, and
everything else is left alone and reported. That asymmetry is the point: this
is allowed to remove a link only when it is sure.
"""
import argparse
import json
import sys
import threading
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlparse

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from data.build_catalog_from_shades import OUT_PATH  # noqa: E402

CACHE_PATH = Path(__file__).resolve().parent / "sources" / "link_check_cache.json"

# Identify the crawler honestly rather than impersonating a browser, and stay
# slow enough that 415 checks are not a burden on anyone's origin.
USER_AGENT = "BeautyLens-link-check/1.0 (catalog link verification)"
MAX_WORKERS = 6
PER_HOST_DELAY_S = 0.7
TIMEOUT_S = 15.0

DEAD, ALIVE, UNKNOWN = "dead", "alive", "unknown"

_host_locks = defaultdict(threading.Lock)
_host_last_hit = defaultdict(float)


def _throttle(host: str) -> None:
    """One in-flight request per host at a time, spaced by PER_HOST_DELAY_S."""
    with _host_locks[host]:
        wait = PER_HOST_DELAY_S - (time.monotonic() - _host_last_hit[host])
        if wait > 0:
            time.sleep(wait)
        _host_last_hit[host] = time.monotonic()


def _is_bare_landing(final_url: str) -> bool:
    """True when a product URL has resolved to a site root or a search/category
    page -- the soft-404 pattern where a delisted product silently redirects to
    somewhere generic and answers 200. To the user that is a broken link, so it
    must not be reported as alive."""
    parsed = urlparse(final_url)
    path = parsed.path.rstrip("/")
    if path in ("", "/index.html"):
        return True
    return any(seg in path.lower() for seg in ("/search", "/category", "/shop-all", "/not-found", "/404"))


def check_one(client: httpx.Client, url: str) -> tuple:
    """Resolve a product URL the way a browser would.

    Deliberately GET, never HEAD. HEAD is not a reliable proxy on storefronts:
    sephora.com answers HEAD with 2xx and GET with a 403 bot wall, while
    ulta.com answers HEAD with 403 and GET with the real product page. A
    HEAD-based pass got both of those exactly backwards. The body is streamed
    and abandoned after the first chunk, so this costs headers, not megabytes.
    """
    host = urlparse(url).netloc
    _throttle(host)
    try:
        with client.stream("GET", url) as resp:
            code = resp.status_code
            final_url = str(resp.url)
            head = ""
            if code < 400:
                for chunk in resp.iter_text():
                    head = chunk
                    break
    except (httpx.ConnectError, httpx.UnsupportedProtocol):
        return DEAD, "connect-error"
    except httpx.HTTPError as e:
        return UNKNOWN, type(e).__name__

    if code in (404, 410):
        return DEAD, str(code)
    if code >= 400:
        # 403/429/5xx: the retailer is refusing us, not confirming the product
        # is gone. Never strip a link on this evidence.
        return UNKNOWN, str(code)
    if _is_bare_landing(final_url):
        return DEAD, "soft-404-redirect"
    if len(head.strip()) < 500 and "<html" not in head.lower():
        # A 200 with essentially no document is an interstitial, not a product.
        return UNKNOWN, "empty-body"
    return ALIVE, str(code)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--catalog", default=str(OUT_PATH))
    ap.add_argument("--dry-run", action="store_true", help="report without editing the catalog")
    ap.add_argument("--recheck", action="store_true", help="ignore cached results")
    args = ap.parse_args()

    catalog_path = Path(args.catalog)
    rows = json.loads(catalog_path.read_text(encoding="utf-8"))
    urls = sorted({r["source_url"] for r in rows if r.get("source_url")})
    print(f"{len(rows)} shades, {len(urls)} distinct URLs")

    cache = {}
    if CACHE_PATH.exists() and not args.recheck:
        cache = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        print(f"cache hit for {sum(1 for u in urls if u in cache)} URLs ({CACHE_PATH.name})")

    todo = [u for u in urls if u not in cache]
    if todo:
        print(f"checking {len(todo)} URLs (max {MAX_WORKERS} workers, "
              f"{PER_HOST_DELAY_S}s between hits per host)...")
        headers = {"User-Agent": USER_AGENT, "Accept": "*/*"}
        with httpx.Client(follow_redirects=True, timeout=TIMEOUT_S, headers=headers) as client:
            with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
                for url, (verdict, detail) in zip(todo, pool.map(lambda u: check_one(client, u), todo)):
                    cache[url] = {"verdict": verdict, "detail": detail}

        CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        CACHE_PATH.write_text(json.dumps(cache, indent=2), encoding="utf-8")
        print(f"cached -> {CACHE_PATH}")

    verdicts = Counter(cache[u]["verdict"] for u in urls)
    print("\nby verdict:")
    for v in (ALIVE, UNKNOWN, DEAD):
        print(f"  {v:8} {verdicts.get(v, 0):5}")

    print("\nresponse detail:")
    for detail, n in Counter(cache[u]["detail"] for u in urls).most_common():
        print(f"  {detail:16} {n:5}")

    by_host = defaultdict(Counter)
    for u in urls:
        by_host[urlparse(u).netloc][cache[u]["verdict"]] += 1
    print("\nby host:")
    for host, c in sorted(by_host.items(), key=lambda kv: -sum(kv[1].values()))[:10]:
        print(f"  {host:28} alive {c[ALIVE]:4}  unknown {c[UNKNOWN]:4}  dead {c[DEAD]:4}")

    dead_urls = {u for u in urls if cache[u]["verdict"] == DEAD}
    affected = sum(1 for r in rows if r.get("source_url") in dead_urls)
    print(f"\n{len(dead_urls)} dead URLs -> would clear source_url on {affected} shades")

    if args.dry_run:
        print("\n--dry-run: catalog not modified")
        return 0

    for r in rows:
        if r.get("source_url") in dead_urls:
            r["source_url"] = None

    catalog_path.write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")
    linked = sum(1 for r in rows if r.get("source_url"))
    print(f"\nwrote {catalog_path}")
    print(f"shades with a verified-or-plausible link: {linked} / {len(rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
