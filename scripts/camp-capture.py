"""
mitmproxy 插件：只落盘王者营地相关请求（kohcamp.qq.com）

用法：
  mitmweb -s scripts/camp-capture.py --listen-port 8080
  或
  mitmdump -s scripts/camp-capture.py --listen-port 8080

抓到后看：scripts/captures/
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from mitmproxy import http

OUT_DIR = Path(__file__).resolve().parent / "captures"
HOST_HINTS = ("kohcamp.qq.com", "camp.qq.com", "mlol.qq.com", "game.qq.com")


def _interesting(host: str) -> bool:
    h = (host or "").lower()
    return any(x in h for x in HOST_HINTS)


def response(flow: http.HTTPFlow) -> None:
    host = flow.request.pretty_host
    if not _interesting(host):
        return

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%f")
    safe_path = flow.request.path.split("?")[0].replace("/", "_").strip("_") or "root"
    name = f"{ts}_{flow.request.method}_{host}_{safe_path[:80]}.json"

    try:
        body_text = flow.response.get_text(strict=False) if flow.response else None
    except Exception:
        body_text = None

    try:
        req_text = flow.request.get_text(strict=False)
    except Exception:
        req_text = None

    record = {
        "time": ts,
        "method": flow.request.method,
        "url": flow.request.pretty_url,
        "status": flow.response.status_code if flow.response else None,
        "request_headers": dict(flow.request.headers),
        "request_body": req_text,
        "response_headers": dict(flow.response.headers) if flow.response else {},
        "response_body": body_text[:200_000] if body_text else None,
    }

    (OUT_DIR / name).write_text(
        json.dumps(record, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"[camp-capture] saved {name}")
