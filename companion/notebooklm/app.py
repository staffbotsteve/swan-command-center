"""
Swan Command Center — NotebookLM companion service.

Thin FastAPI shim around NotebookLM's web app, authenticated via a
cookies.txt file exported from a Chrome session signed in to the
target Google account.

Calibrated against a HAR capture from sactoswan@gmail.com on 2026-04-26.
The app name is `LabsTailwindUi` (not `NotebookLmUi`). All operations
are POSTs to /_/LabsTailwindUi/data/batchexecute with an `rpcids` query
param identifying the operation.

WARNING: this depends on NotebookLM's INTERNAL web endpoints. Google
ships changes regularly. When the service breaks, expect a few hours
of network-tab-inspection + endpoint patching to recover. There is
no official API and no SLA.
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
import urllib.parse
from http.cookiejar import MozillaCookieJar
from typing import Any, Optional

import requests
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

# ─── Config ────────────────────────────────────────────────────────────────

SHARED_SECRET = os.environ.get("SHARED_SECRET")
COOKIES_PATH = os.environ.get("COOKIES_PATH", "/secrets/cookies.txt")
NOTEBOOKLM_BASE = "https://notebooklm.google.com"
APP_NAME = "LabsTailwindUi"  # confirmed via HAR 2026-04-26
BATCHEXECUTE_PATH = f"/_/{APP_NAME}/data/batchexecute"

if not SHARED_SECRET:
    raise SystemExit("SHARED_SECRET not set")

# Allow injecting cookies.txt via base64-encoded env var (cleaner than a Fly
# volume — easier to rotate when Google's session cookies expire). If
# COOKIES_TXT_B64 is set, decode it to /tmp/cookies.txt on startup and
# point COOKIES_PATH at it.
import base64 as _b64
_cookies_b64 = os.environ.get("COOKIES_TXT_B64")
if _cookies_b64:
    _decoded = _b64.b64decode(_cookies_b64).decode("utf-8")
    _path = "/tmp/cookies.txt"
    with open(_path, "w", encoding="utf-8") as _fp:
        _fp.write(_decoded)
    os.chmod(_path, 0o600)
    COOKIES_PATH = _path

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("notebooklm-companion")

app = FastAPI(title="swan-notebooklm-companion", version="0.2.0")

# ─── Auth & session helpers ────────────────────────────────────────────────


def require_secret(authorization: Optional[str]) -> None:
    if not authorization or authorization != f"Bearer {SHARED_SECRET}":
        raise HTTPException(status_code=401, detail="unauthorized")


def google_session() -> requests.Session:
    """A requests.Session loaded with the user's Google cookies."""
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
                "Chrome/147.0.0.0 Safari/537.36"
            ),
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "Origin": NOTEBOOKLM_BASE,
            "Referer": NOTEBOOKLM_BASE + "/",
            "X-Same-Domain": "1",
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        }
    )
    return s


# ─── Bootstrap tokens (scraped from the home-page HTML) ────────────────────
#
# The batchexecute URL needs three session-bound query parameters:
#   bl    — backend version (e.g. boq_labs-tailwind-frontend_20260423.09_p0)
#   f.sid — frontend session id (a 19-digit number)
#   at    — anti-CSRF token, ALSO required in the request body
# All three are embedded in the home-page HTML inside a JSON blob assigned
# to a global variable (WIZ_global_data or similar). We scrape them once at
# cold start and reuse for ~30 minutes; on stale-token errors we re-scrape.

_token_cache: dict[str, Any] = {"bl": None, "fsid": None, "at": None, "expires": 0}
_token_lock = threading.Lock()
TOKEN_TTL_SECONDS = 1800  # 30 minutes


def _scrape_bootstrap(s: requests.Session) -> dict[str, str]:
    """Fetch the home page HTML and extract bl, f.sid, at."""
    log.info("scraping bootstrap tokens from %s", NOTEBOOKLM_BASE)
    r = s.get(NOTEBOOKLM_BASE + "/", timeout=20)
    if r.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"home page fetch failed: HTTP {r.status_code}",
        )
    html = r.text

    # The three tokens live inside `window.WIZ_global_data = {...}`:
    #   KjTSIf  — bl  (backend version, e.g. boq_labs-tailwind-frontend_…)
    #   FdrFJe  — f.sid  (numeric session id)
    #   SNlM0e  — at  (anti-CSRF token, "ALkAt…:<unix-ms>")
    # Confirmed via /tmp/notebooklm_home.html on 2026-04-26.
    m = re.search(r'"KjTSIf"\s*:\s*"([^"]+)"', html)
    bl = m.group(1) if m else None

    m = re.search(r'"FdrFJe"\s*:\s*"(-?\d+)"', html)
    fsid = m.group(1) if m else None

    m = re.search(r'"SNlM0e"\s*:\s*"([^"]+)"', html)
    at = m.group(1) if m else None

    if not (bl and fsid and at):
        # Fallback: try scraping any JS-encoded versions.
        log.warning(
            "bootstrap scrape partial: bl=%s fsid=%s at=%s",
            bool(bl), bool(fsid), bool(at),
        )
        raise HTTPException(
            status_code=502,
            detail=(
                "could not extract NotebookLM bootstrap tokens — "
                "page format may have changed"
            ),
        )
    return {"bl": bl, "fsid": fsid, "at": at}


def get_bootstrap(s: requests.Session, force: bool = False) -> dict[str, str]:
    with _token_lock:
        now = time.time()
        if (
            not force
            and _token_cache["bl"]
            and _token_cache["expires"] > now
        ):
            return {
                "bl": _token_cache["bl"],
                "fsid": _token_cache["fsid"],
                "at": _token_cache["at"],
            }
        toks = _scrape_bootstrap(s)
        _token_cache.update(toks)
        _token_cache["expires"] = now + TOKEN_TTL_SECONDS
        return toks


# ─── batchexecute call helper ──────────────────────────────────────────────

_reqid_counter = [100000]


def _next_reqid() -> int:
    _reqid_counter[0] += 100000
    return _reqid_counter[0]


def call_rpc(
    rpcid: str,
    args: Any,
    *,
    source_path: str = "/",
    s: Optional[requests.Session] = None,
) -> Any:
    """Invoke a single batchexecute RPC and return the parsed result.

    args is the python structure that becomes the second element of
    the RPC tuple after JSON-encoding. The wire format is:

        f.req=[[[<rpcid>, <json string of args>, null, "generic"]]]
        at=<at>

    The response is JSON prefixed with `)]}'` and is a list of
    ["wrb.fr", <rpcid>, <json string result>, ...] envelopes plus
    metadata. We unwrap and json-decode the result string.
    """
    if s is None:
        s = google_session()
    toks = get_bootstrap(s)

    args_str = json.dumps(args, separators=(",", ":"))
    f_req = json.dumps([[[rpcid, args_str, None, "generic"]]], separators=(",", ":"))

    params = {
        "rpcids": rpcid,
        "source-path": source_path,
        "bl": toks["bl"],
        "f.sid": toks["fsid"],
        "hl": "en",
        "_reqid": str(_next_reqid()),
        "rt": "c",
    }
    body = urllib.parse.urlencode({"f.req": f_req, "at": toks["at"]})

    url = NOTEBOOKLM_BASE + BATCHEXECUTE_PATH + "?" + urllib.parse.urlencode(params)
    r = s.post(url, data=body, timeout=60)

    # 401/403 most likely means the at token is stale — retry once with a
    # fresh scrape.
    if r.status_code in (401, 403):
        log.warning("batchexecute %s -> %d; re-scraping tokens", rpcid, r.status_code)
        toks = get_bootstrap(s, force=True)
        params["bl"] = toks["bl"]
        params["f.sid"] = toks["fsid"]
        body = urllib.parse.urlencode({"f.req": f_req, "at": toks["at"]})
        url = NOTEBOOKLM_BASE + BATCHEXECUTE_PATH + "?" + urllib.parse.urlencode(params)
        r = s.post(url, data=body, timeout=60)

    if r.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"batchexecute {rpcid} HTTP {r.status_code}: {r.text[:200]}",
        )

    text = r.text
    # Strip the )]}' anti-XSSI prefix.
    if text.startswith(")]}'"):
        text = text[4:].lstrip()
    # Wire format puts a length prefix line before each JSON envelope, e.g.:
    #   42
    #   [["wrb.fr","<rpcid>","[…]",…],…]
    # We grab the first envelope that matches our rpcid.
    try:
        # Find the first "[" and parse from there as JSON list of envelopes.
        first_bracket = text.find("[")
        if first_bracket < 0:
            raise ValueError("no json found in response")
        # The full body is a sequence of <length>\n<json>\n blocks; concatenate
        # all JSON arrays.
        envelopes: list[Any] = []
        i = 0
        while i < len(text):
            j = text.find("[", i)
            if j < 0:
                break
            # naive bracket matching
            depth = 0
            k = j
            in_str = False
            esc = False
            while k < len(text):
                ch = text[k]
                if in_str:
                    if esc:
                        esc = False
                    elif ch == "\\":
                        esc = True
                    elif ch == '"':
                        in_str = False
                else:
                    if ch == '"':
                        in_str = True
                    elif ch == "[":
                        depth += 1
                    elif ch == "]":
                        depth -= 1
                        if depth == 0:
                            chunk = text[j : k + 1]
                            try:
                                envelopes.extend(json.loads(chunk))
                            except Exception:
                                pass
                            i = k + 1
                            break
                k += 1
            else:
                break
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"batchexecute {rpcid} parse error: {e}",
        )

    for env in envelopes:
        if (
            isinstance(env, list)
            and len(env) >= 3
            and env[0] == "wrb.fr"
            and env[1] == rpcid
        ):
            payload = env[2]
            if payload in (None, "null", ""):
                return None
            try:
                return json.loads(payload)
            except Exception:
                return payload
    raise HTTPException(
        status_code=502,
        detail=f"batchexecute {rpcid}: rpcid not found in response envelopes",
    )


# ─── Health check ──────────────────────────────────────────────────────────


@app.get("/health")
def health():
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
    return {
        "ok": True,
        "cookies_loadable": cookies_ok,
        "cookie_count": cookie_count,
        "tokens_cached": bool(_token_cache["bl"]),
    }


# ─── Models ────────────────────────────────────────────────────────────────


class CreateNotebookBody(BaseModel):
    title: Optional[str] = ""


class RenameNotebookBody(BaseModel):
    notebook_id: str
    title: str


class AddSourceBody(BaseModel):
    notebook_id: str
    url: str


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class QueryBody(BaseModel):
    notebook_id: str
    source_ids: list[str]  # sources to ground the answer in
    question: str
    history: list[ChatMessage] = []
    # uuid identifying the conversation thread inside the notebook.
    # If omitted the companion generates one. Pass the same value to
    # continue a thread across turns.
    chat_session_id: Optional[str] = None


class GenerateReportBody(BaseModel):
    notebook_id: str
    source_ids: list[str]
    # Confirmed: "interactive_mindmap". Likely (pending capture):
    # "briefing_doc", "study_guide", "faq", "timeline", "audio_overview".
    style: str = "interactive_mindmap"


# ─── Endpoints ─────────────────────────────────────────────────────────────


@app.get("/notebooks")
def list_notebooks(authorization: Optional[str] = Header(None)):
    """Return all notebooks for the signed-in account.

    Calibrated rpcid: ub2Bae   args: [[2]]
    """
    require_secret(authorization)
    result = call_rpc("ub2Bae", [[2]], source_path="/")
    return {"raw": result}


@app.post("/notebooks")
def create_notebook(
    body: CreateNotebookBody, authorization: Optional[str] = Header(None)
):
    """Create a new (empty) notebook. Title is optional — NotebookLM creates
    the notebook with whatever title you pass, and the UI defaults to empty.

    Calibrated rpcid: CCqFvf   args: [<title>, null, null, [2], [1, …flags…]]
    """
    require_secret(authorization)
    args = [
        body.title or "",
        None,
        None,
        [2],
        [1, None, None, None, None, None, None, None, None, None, [1]],
    ]
    result = call_rpc("CCqFvf", args, source_path="/")
    return {"raw": result}


@app.patch("/notebooks/{notebook_id}")
def rename_notebook(
    notebook_id: str,
    body: RenameNotebookBody,
    authorization: Optional[str] = Header(None),
):
    """Rename a notebook.

    Calibrated rpcid: s0tc2d   args: [<id>, [[null, null, null, [null, <title>]]]]
    """
    require_secret(authorization)
    args = [notebook_id, [[None, None, None, [None, body.title]]]]
    result = call_rpc(
        "s0tc2d", args, source_path=f"/notebook/{notebook_id}"
    )
    return {"raw": result}


@app.post("/sources")
def add_source(body: AddSourceBody, authorization: Optional[str] = Header(None)):
    """Add a URL (Website or YouTube) as a new source in a notebook.

    Calibrated rpcid: izAoDd
    args: [
      [[null,null,null,null,null,null,null,[<url>],null,null,1]],
      <notebook_id>,
      [2],
      [1, …flags…],
    ]
    """
    require_secret(authorization)
    args = [
        [
            [
                None, None, None, None, None, None, None,
                [body.url],
                None, None, 1,
            ]
        ],
        body.notebook_id,
        [2],
        [1, None, None, None, None, None, None, None, None, None, [1]],
    ]
    result = call_rpc(
        "izAoDd", args, source_path=f"/notebook/{body.notebook_id}"
    )
    return {"raw": result}


# ─── NOT YET CALIBRATED — need second HAR capture ──────────────────────────


def _new_chat_session_id() -> str:
    import uuid
    return str(uuid.uuid4())


# Roles in the wire format: 1 = user, 2 = assistant.
_ROLE_TO_INT = {"user": 1, "assistant": 2}


def _parse_streamed_envelopes(text: str) -> list:
    """Parse a length-prefixed JSON-envelope stream into a flat list."""
    if text.startswith(")]}'"):
        text = text[4:].lstrip()
    envelopes: list = []
    i = 0
    while i < len(text):
        j = text.find("[", i)
        if j < 0:
            break
        depth = 0
        k = j
        in_str = False
        esc = False
        while k < len(text):
            ch = text[k]
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
            else:
                if ch == '"':
                    in_str = True
                elif ch == "[":
                    depth += 1
                elif ch == "]":
                    depth -= 1
                    if depth == 0:
                        chunk = text[j : k + 1]
                        try:
                            envelopes.extend(json.loads(chunk))
                        except Exception:
                            pass
                        i = k + 1
                        break
            k += 1
        else:
            break
    return envelopes


def _extract_answer_text(envelopes: list) -> Optional[str]:
    """Extract the assistant's clean answer text from the streamed response.

    The streamed response is a sequence of envelopes:

      ["wrb.fr", <service_id>, <payload_json_string>]   # answer chunks
      ["di", …]                                          # data info
      ["af.httprm", …]                                   # http metadata
      ["e", …]                                           # end-of-stream

    Each `wrb.fr` payload, when JSON-decoded, has the answer text at
    position [0][0]. The stream emits multiple wrb.fr envelopes:

      - early ones contain Gemini's "thinking" trace ("**Initiating
        the Analysis**\n…")
      - later ones contain the streaming partial answer
      - the LAST wrb.fr envelope contains the complete final answer

    So we walk the envelopes in reverse, find the last wrb.fr,
    decode its payload, and return position [0][0].
    """
    for env in reversed(envelopes):
        if (
            isinstance(env, list)
            and len(env) >= 3
            and env[0] == "wrb.fr"
            and isinstance(env[2], str)
        ):
            try:
                payload = json.loads(env[2])
            except Exception:
                continue
            if (
                isinstance(payload, list)
                and payload
                and isinstance(payload[0], list)
                and payload[0]
                and isinstance(payload[0][0], str)
            ):
                return payload[0][0]
    return None


CHAT_SERVICE_PATH = (
    "/_/LabsTailwindUi/data/"
    "google.internal.labs.tailwind.orchestration.v1."
    "LabsTailwindOrchestrationService/GenerateFreeFormStreamed"
)


@app.post("/query")
def query(body: QueryBody, authorization: Optional[str] = Header(None)):
    """Ask a question grounded in a notebook's sources (chat).

    Calibrated against HAR capture 2026-04-26.

    Endpoint: POST /_/LabsTailwindUi/data/.../GenerateFreeFormStreamed
    Body:     f.req=[null, "<inner_json>"] & at=<token>
    Inner:    [
                [[[<source_ids>]]],
                "<question>",
                [[<msg>, null, <role_int>], ...],   # history, chronological
                [2, null, [1], [1]],                # mode/flags
                "<chat_session_id>",
                null, null,
                "<notebook_id>",
                <turn_index>,
              ]

    Response is a streamed sequence of length-prefixed JSON envelopes.
    Chrome strips the body in HAR exports so the exact envelope shape
    isn't captured; we parse generically and best-effort-extract the
    longest text payload as the answer.
    """
    require_secret(authorization)
    s = google_session()
    toks = get_bootstrap(s)

    chat_session_id = body.chat_session_id or _new_chat_session_id()
    history_payload = [
        [m.content, None, _ROLE_TO_INT.get(m.role.lower(), 1)]
        for m in body.history
    ]
    turn_index = (len(body.history) // 2) + 1

    inner = [
        [[list(body.source_ids)]],
        body.question,
        history_payload,
        [2, None, [1], [1]],
        chat_session_id,
        None,
        None,
        body.notebook_id,
        turn_index,
    ]
    f_req = json.dumps([None, json.dumps(inner, separators=(",", ":"))],
                       separators=(",", ":"))

    params = {
        "bl": toks["bl"],
        "f.sid": toks["fsid"],
        "hl": "en",
        "_reqid": str(_next_reqid()),
        "rt": "c",
    }
    body_str = urllib.parse.urlencode({"f.req": f_req, "at": toks["at"]})

    url = NOTEBOOKLM_BASE + CHAT_SERVICE_PATH + "?" + urllib.parse.urlencode(params)
    headers = {
        # The chat endpoint requires this JSPB extension header.
        "X-Goog-Ext-353267353-Jspb": "[null,null,null,282611]",
    }
    r = s.post(url, data=body_str, headers=headers, timeout=120)

    if r.status_code in (401, 403):
        log.warning("chat -> %d; re-scraping tokens", r.status_code)
        toks = get_bootstrap(s, force=True)
        params["bl"] = toks["bl"]
        params["f.sid"] = toks["fsid"]
        body_str = urllib.parse.urlencode({"f.req": f_req, "at": toks["at"]})
        url = NOTEBOOKLM_BASE + CHAT_SERVICE_PATH + "?" + urllib.parse.urlencode(params)
        r = s.post(url, data=body_str, headers=headers, timeout=120)

    if r.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"chat HTTP {r.status_code}: {r.text[:200]}",
        )

    envelopes = _parse_streamed_envelopes(r.text)
    answer = _extract_answer_text(envelopes)
    return {
        "chat_session_id": chat_session_id,
        "turn_index": turn_index,
        "answer": answer,
        "raw_envelopes": envelopes,
    }


@app.post("/reports")
def generate_report(
    body: GenerateReportBody, authorization: Optional[str] = Header(None)
):
    """Kick off generation of a Studio artifact (mind map confirmed).

    Calibrated rpcid: yyryJe   args:
      [
        [[[<source_ids>]]],
        null, null, null, null,
        [<style_string>, [["[CONTEXT]", ""]], ""],
        null,
        [2, null, [1], [1]],
      ]

    Confirmed style: "interactive_mindmap".
    Likely (pending capture): "briefing_doc", "study_guide", "faq",
    "timeline", "audio_overview". Pass whatever the UI uses internally.

    NOTE: For interactive_mindmap, NotebookLM generates the content
    client-side and the browser then uploads the result back via rpcid
    CYK0Xb. Server-side artifacts (briefing, audio overview) generate
    on Google's servers and the client polls for completion. This
    handler only fires the kickoff; result polling is the caller's job.
    """
    require_secret(authorization)
    args = [
        [[[sid] for sid in body.source_ids]],
        None, None, None, None,
        [body.style, [["[CONTEXT]", ""]], ""],
        None,
        [2, None, [1], [1]],
    ]
    result = call_rpc(
        "yyryJe", args, source_path=f"/notebook/{body.notebook_id}"
    )
    return {"raw": result}
