#!/usr/bin/env python3
"""Extract reproducible color, typography, geometry, and motion evidence from CSS."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
import urllib.request
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse


COLOR_RE = re.compile(r"#[0-9a-fA-F]{3,8}\b|(?:rgb|rgba|hsl|hsla)\([^)]*\)")
FONT_RE = re.compile(r"font-family\s*:\s*([^;}]+)", re.I)
FONT_FACE_RE = re.compile(r"@font-face\s*{([^}]+)}", re.I | re.S)
KEYFRAME_RE = re.compile(r"@(?:-webkit-)?keyframes\s+([\w-]+)", re.I)
URL_RE = re.compile(r"url\(([^)]+)\)", re.I)


def read_source(source: str) -> tuple[bytes, dict[str, str]]:
    parsed = urlparse(source)
    if parsed.scheme in {"http", "https"}:
        request = urllib.request.Request(
            source,
            headers={"User-Agent": "ark-ui-evidence/1.0", "Accept-Encoding": "gzip"},
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read()
            headers = {key.lower(): value for key, value in response.headers.items()}
        if body.startswith(b"\x1f\x8b"):
            body = gzip.decompress(body)
        return body, headers

    path = Path(source).expanduser().resolve()
    return path.read_bytes(), {"path": str(path)}


def top(counter: Counter[str], limit: int = 30) -> list[dict[str, object]]:
    return [{"value": value, "count": count} for value, count in counter.most_common(limit)]


def summarize_url(value: str) -> str:
    value = value.strip(" \"'")
    if value.startswith("data:"):
        media_type = value[5:].split(";", 1)[0] or "application/octet-stream"
        return f"data:{media_type};base64,(embedded {len(value):,} chars)"
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", help="CSS URL or local file")
    parser.add_argument("--limit", type=int, default=30, help="Maximum entries per list")
    args = parser.parse_args()

    body, headers = read_source(args.source)
    text = body.decode("utf-8", errors="replace")
    normalized_colors = Counter(match.group(0).lower().replace(" ", "") for match in COLOR_RE.finditer(text))
    fonts = Counter(" ".join(match.group(1).strip().split()) for match in FONT_RE.finditer(text))
    font_faces = []
    for block in FONT_FACE_RE.findall(text):
        family = FONT_RE.search(block)
        sources = [summarize_url(url) for url in URL_RE.findall(block)]
        font_faces.append({"family": family.group(1).strip() if family else None, "sources": sources[:8]})

    features = {
        "clip_path": len(re.findall(r"(?:-webkit-)?clip-path\s*:", text, re.I)),
        "mask": len(re.findall(r"(?:-webkit-)?mask(?:-image)?\s*:", text, re.I)),
        "mix_blend_mode": len(re.findall(r"mix-blend-mode\s*:", text, re.I)),
        "backdrop_filter": len(re.findall(r"(?:-webkit-)?backdrop-filter\s*:", text, re.I)),
        "orientation_queries": len(re.findall(r"orientation\s*:", text, re.I)),
        "reduced_motion_queries": len(re.findall(r"prefers-reduced-motion", text, re.I)),
        "keyframes": sorted(set(KEYFRAME_RE.findall(text)))[: args.limit],
    }

    result = {
        "source": args.source,
        "retrieval_headers": headers,
        "decoded_bytes": len(body),
        "sha256": hashlib.sha256(body).hexdigest(),
        "colors": top(normalized_colors, args.limit),
        "font_families": top(fonts, args.limit),
        "font_faces": font_faces[: args.limit],
        "features": features,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
