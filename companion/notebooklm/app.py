"""
Swan Command Center — NotebookLM companion service.

Thin FastAPI shim around NotebookLM's web app, authenticated via a
cookies.txt file exported from a Chrome session signed in to the
target Google account.

Deployed to Fly.io. Worker calls via HTTPS with a shared bearer secret.

WARNING: this depends on NotebookLM's INTERNAL web endpoints. Google
ships changes regularly. When the service breaks, expect a few hours
of network-tab-inspection + endpoint patching to recover. There is
no official API and no SLA.
"""

from __future__ import annotations

import os
import json
import logging
from http.cookiejar import MozillaCookieJar
from typing import Optional

import requests
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel

# ─── Config ────────────────────────────────────────────────────────────────

SHARED_SECRET = os.environ.get("SHARED_SECRET")
COOKIES_PATH = os.environ.get("COOKIES_PATH", "/secrets/cookies.txt")
NOTEBOOKLM_BASE = "https://notebooklm.google.com"

if not SHARED_SECRET:
    raise SystemExit("SHARED_SECRET not set")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("notebooklm-companion")

app = FastAPI(title="swan-notebooklm-companion", version="0.1.0")

# ─── Auth helpers ──────────────────────────────────────────────────────────


def require_secret(authorization: Optional[str]) -> None:
    """Reject any request without the matching bearer secret."""
    if not authorization or authorization != f"Bearer {SHARED_SECRET}":
        raise HTTPException(status_code=401, detail="unauthorized")


def google_session() -> requests.Session:
    """Build a requests.Session loaded with the user's Google cookies."""
    s = requests.Session()
    cj = MozillaCookieJar()
    if not os.path.exists(COOKIES_PATH):
        raise HTTPException(
            status_code=503,
            detail=f"cookies.txt not present at {COOKIES_PATH} — run setup",
        )
    cj.load(COOKIES_PATH, ignore_discard=True, ignore_expires=True)
    for c in cj:
        s.cookies.set(c.name, c.value, domain=c.domain, path=c.path)
    s.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            "Origin": NOTEBOOKLM_BASE,
            "Referer": NOTEBOOKLM_BASE + "/",
        }
    )
    return s


# ─── Health check ──────────────────────────────────────────────────────────


@app.get("/health")
def health():
    """Public health endpoint. Returns whether cookies are loadable
    (without revealing their contents)."""
    cookies_ok = os.path.exists(COOKIES_PATH)
    cookie_count = 0
    if cookies_ok:
        try:
            cj = MozillaCookieJar()
            cj.load(COOKIES_PATH, ignore_discard=True, ignore_expires=True)
            cookie_count = sum(1 for _ in cj)
        except Exception as e:
            log.error("cookie load: %s", e)
            cookies_ok = False
    return {"ok": True, "cookies_loadable": cookies_ok, "cookie_count": cookie_count}


# ─── Models ────────────────────────────────────────────────────────────────


class CreateNotebookBody(BaseModel):
    title: str


class AddSourceBody(BaseModel):
    notebook_id: str
    url: str


class QueryBody(BaseModel):
    notebook_id: str
    question: str


class GenerateReportBody(BaseModel):
    notebook_id: str
    style: Optional[str] = "briefing"  # briefing | deep_dive | slide_deck


# ─── Endpoints (placeholders — see comments) ───────────────────────────────
#
# The exact NotebookLM internal endpoints are NOT publicly documented.
# Each handler below sketches the call pattern; the URL paths and
# payload shapes need to be confirmed by inspecting actual NotebookLM
# web traffic in DevTools (Network tab, filter to XHR, perform the
# action in the UI, copy the request).
#
# For the first deploy, every endpoint that calls NotebookLM returns a
# 501 Not Implemented with a clear note about what needs to be wired.
# Health and auth work. The shape of the public API is final.


@app.get("/notebooks")
def list_notebooks(authorization: Optional[str] = Header(None)):
    require_secret(authorization)
    s = google_session()
    # TODO(steven-network-tab): replace with the real list endpoint.
    # Likely something like:
    #   GET https://notebooklm.google.com/api/notebooks/list
    # or a batched RPC call to:
    #   POST https://notebooklm.google.com/_/NotebookLmUi/data/batchexecute
    # Inspect DevTools → Network → XHR while loading the NotebookLM
    # home page, copy the URL + payload, paste here.
    raise HTTPException(
        status_code=501,
        detail="list_notebooks endpoint not yet wired — see code comment",
    )


@app.post("/notebooks")
def create_notebook(body: CreateNotebookBody, authorization: Optional[str] = Header(None)):
    require_secret(authorization)
    s = google_session()
    # TODO(steven-network-tab): create-notebook endpoint goes here
    raise HTTPException(
        status_code=501,
        detail="create_notebook endpoint not yet wired — see code comment",
    )


@app.post("/sources")
def add_source(body: AddSourceBody, authorization: Optional[str] = Header(None)):
    require_secret(authorization)
    s = google_session()
    # TODO(steven-network-tab): add-source-by-url endpoint goes here
    raise HTTPException(
        status_code=501,
        detail="add_source endpoint not yet wired — see code comment",
    )


@app.post("/query")
def query(body: QueryBody, authorization: Optional[str] = Header(None)):
    require_secret(authorization)
    s = google_session()
    # TODO(steven-network-tab): query (chat-with-notebook) endpoint
    raise HTTPException(
        status_code=501,
        detail="query endpoint not yet wired — see code comment",
    )


@app.post("/reports")
def generate_report(body: GenerateReportBody, authorization: Optional[str] = Header(None)):
    require_secret(authorization)
    s = google_session()
    # TODO(steven-network-tab): generate-report endpoint
    raise HTTPException(
        status_code=501,
        detail="generate_report endpoint not yet wired — see code comment",
    )
