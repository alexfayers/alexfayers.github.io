#!/usr/bin/env python3
"""Build mycode.rocks: site.toml + public GitHub data -> one static index.html.

Standard library only. The output makes no outside requests until the play
button is pressed; the frog and the fonts are inlined.

    python3 build.py                       # fetch from GitHub, write _site/index.html
    python3 build.py --fixture data.json   # build offline from saved data
    python3 build.py --dump data.json      # also save the fetched data
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import math
import os
import random
import re
import time
import tomllib
import urllib.error
import urllib.request
from collections import Counter
from datetime import UTC, date, datetime, timedelta
from html import escape
from pathlib import Path
from typing import Any

HERE = Path(__file__).parent
API = "https://api.github.com"
WEEKS = 12
THEMES = ["fever", "ting", "bliss", "copy", "89", "desire"]


def api_get(path: str) -> tuple[int, Any]:
    """GET a GitHub API path. Returns (status, parsed JSON or None)."""
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "mycode.rocks-build"}
    if token := os.environ.get("GITHUB_TOKEN"):
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(API + path, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read()
            return response.status, json.loads(body) if body else None
    except urllib.error.HTTPError as error:
        return error.code, None


def is_showable(repo: dict[str, Any], exclude: set[str]) -> bool:
    """Only ever show repos that are public, original, live and not excluded."""
    return (
        repo.get("private") is False
        and repo.get("visibility", "public") == "public"
        and not repo.get("fork")
        and not repo.get("archived")
        and repo["name"] not in exclude
    )


def fetch_weekly_commits(user: str, name: str) -> list[int]:
    """The owner's commits per week for the last WEEKS weeks, oldest first."""
    for _ in range(5):
        status, body = api_get(f"/repos/{user}/{name}/stats/participation")
        if status == 200 and body and body.get("owner"):
            return [int(n) for n in body["owner"][-WEEKS:]]
        if status != 202:  # 202 means GitHub is still computing; anything else, give up
            break
        time.sleep(3)
    return [0] * WEEKS


def fetch(cfg: dict[str, Any]) -> dict[str, Any]:
    """Collect everything the page needs from the public GitHub API."""
    user = cfg["user"]
    exclude = set(cfg.get("exclude", []))
    raw: list[dict[str, Any]] = []
    for page in range(1, 11):
        status, body = api_get(f"/users/{user}/repos?type=owner&sort=pushed&per_page=100&page={page}")
        if status != 200:
            raise SystemExit(f"GitHub returned {status} listing repos; not building.")
        raw.extend(body)
        if len(body) < 100:
            break

    repos = [
        {
            "name": r["name"],
            "description": r.get("description") or "",
            "language": r.get("language") or "",
            "pushed_at": r["pushed_at"],
        }
        for r in raw
        if is_showable(r, exclude)
    ]
    repos.sort(key=lambda r: r["pushed_at"], reverse=True)

    cutoff = (datetime.now(UTC) - timedelta(weeks=WEEKS)).isoformat()
    weeks = [0] * WEEKS
    for repo in [r for r in repos if r["pushed_at"] >= cutoff][:15]:
        for i, count in enumerate(fetch_weekly_commits(user, repo["name"])):
            weeks[i] += count

    return {"built": date.today().isoformat(), "repos": repos, "weeks": weeks}


def ordinal(n: int) -> str:
    """12 -> '12th'."""
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def fireworks() -> str:
    """Bursts of little diamonds for the front, as inline SVG. Same every build."""
    rng = random.Random(1995)
    bursts = [
        (300, 70, 78, ["#c8e03a", "#e3261b", "#ffffff"], 70),
        (36, 70, 90, ["#f39200", "#8e44ad", "#e3261b"], 60),
        (330, 285, 120, ["#e3261b", "#ffffff", "#f7a8b8"], 110),
        (215, 338, 26, ["#f8d200", "#e3261b", "#f7a8b8"], 30),
    ]
    shapes = []
    for cx, cy, radius, colours, count in bursts:
        for _ in range(count):
            angle = rng.uniform(0, 2 * math.pi)
            dist = radius * math.sqrt(rng.uniform(0.08, 1))
            x, y = cx + dist * math.cos(angle), cy + dist * math.sin(angle)
            size = rng.uniform(2.5, 5.5)
            turn = math.degrees(angle) + 90
            shapes.append(
                f'<path d="M0,{-size * 1.6:.1f} L{size * 0.6:.1f},0 L0,{size:.1f} L{-size * 0.6:.1f},0Z" '
                f'fill="{rng.choice(colours)}" transform="translate({x:.0f},{y:.0f}) rotate({turn:.0f})"/>'
            )
    return "".join(shapes)


def render(cfg: dict[str, Any], data: dict[str, Any]) -> str:
    """Turn config and data into the finished page. Every value is escaped."""
    user = cfg["user"]
    repos: list[dict[str, Any]] = data["repos"]
    weeks: list[int] = data["weeks"]
    built = date.fromisoformat(data["built"])

    def repo_url(name: str) -> str:
        return escape(f"https://github.com/{user}/{name}", quote=True)

    def link(url: str, label: str) -> str:
        if not url.startswith("https://"):
            return escape(label)
        return f'<a href="{escape(url, quote=True)}" rel="me noopener">{escape(label)}</a>'

    def inline(path: str, mime: str) -> str:
        return f"data:{mime};base64," + base64.b64encode((HERE / path).read_bytes()).decode()

    # The lineup: most recently pushed repos.
    repos_html = "".join(
        f'<li><a href="{repo_url(r["name"])}">{escape(r["name"])}</a></li> ' for r in repos[: cfg.get("max_repos", 6)]
    )

    # Bullets: generated numbers first, then the hand-written ones.
    year_ago = (built - timedelta(days=365)).isoformat()
    languages = Counter(r["language"] for r in repos if r["language"] and r["pushed_at"] >= year_ago)
    facts = [f"{len(repos)} public repos", f"{max(weeks)} commits in the busiest week"]
    if languages:
        facts.append(f"Mostly {languages.most_common(1)[0][0]}")
    facts += cfg.get("facts", [])
    facts_html = "".join(f"<li>{escape(fact)}</li> " for fact in facts)

    # Commits per week, set-times style. Last row is the current week.
    peak = max(weeks) or 1
    monday = built - timedelta(days=built.weekday())
    rows_html = ""
    for i, count in enumerate(weeks):
        start = monday - timedelta(weeks=len(weeks) - 1 - i)
        rows_html += (
            f"<li><span>{start.strftime('%-d %b')}</span>"
            f'<span class="bar"><i style="width:{max(round(count / peak * 100), 1)}%"></i></span>'
            f"<b>{count}</b></li>"
        )

    music_html = ""
    for act in cfg.get("music", []):
        services = [("Spotify", "spotify"), ("Apple Music", "apple"), ("YouTube", "youtube")]
        links = " &bull; ".join(link(act[key], label) for label, key in services if act.get(key))
        text = f" <span>({escape(act['text'])})</span>" if act.get("text") else ""
        music_html += f"<li><b>{escape(act['name'])}</b>{text}<br>{links}</li>"

    links_html = "".join(f"<li>{link(item['url'], item['label'])}</li>" for item in cfg.get("links", []))

    rainbow = "".join(
        " " if c == " " else f'<span class="i{i % 5}">{escape(c)}</span>'
        for i, c in enumerate(cfg.get("strapline", ""))
    )

    intro = re.sub(r"_(.+?)_", lambda m: f"<u>{m.group(1)}</u>", escape(cfg["intro"]))

    # 24-point starburst, and a zigzag edge for the callout boxes.
    burst = ", ".join(
        f"{50 + r * math.sin(i * math.pi / 12):.1f}% {50 - r * math.cos(i * math.pi / 12):.1f}%"
        for i in range(24)
        for r in [50 if i % 2 == 0 else 40]
    )
    teeth = 28
    top = [f"{i * 100 / teeth:.1f}% {0 if i % 2 else 7}px" for i in range(teeth + 1)]
    bottom = [f"{i * 100 / teeth:.1f}% calc(100% - {0 if i % 2 else 7}px)" for i in range(teeth, -1, -1)]
    zig = ", ".join(top + bottom)

    # Each build prints in one style by default; a one-line script re-rolls it per visit.
    theme = cfg.get("theme") or THEMES[built.toordinal() % len(THEMES)]
    names = ",".join(f'"{name}"' for name in THEMES)
    script = f'var t=[{names}];document.currentScript.parentNode.className="t-"+t[Math.floor(Math.random()*t.length)]'
    player = (HERE / "player.js").read_text(encoding="utf-8")
    script_hashes = " ".join(
        "'sha256-" + base64.b64encode(hashlib.sha256(code.encode()).digest()).decode() + "'" for code in (script, player)
    )
    tracks = [[track["id"], track["title"]] for track in cfg.get("tracks", [])]
    player_html = (
        '<button id="play" class="play" type="button" aria-label="Play a random track by BIRDSTARE" '
        f'data-tracks="{escape(json.dumps(tracks), quote=True)}"><i aria-hidden="true"></i><span>Play</span></button>'
        '<p id="now" class="now" aria-live="polite">Loads YouTube when you press play</p>'
        if tracks
        else ""
    )

    page = (HERE / "template.html").read_text(encoding="utf-8")
    fields = {
        "THEME": theme,
        "SCRIPT": f"<script>{script}</script>",
        "SCRIPT_HASH": script_hashes,
        "PLAYER": player_html,
        "PLAYER_SCRIPT": f"<script>{player}</script>" if tracks else "",
        "NAME": escape(cfg["name"]),
        "INTRO": intro,
        "RAINBOW": rainbow,
        "FROG": inline("frog.gif", "image/gif"),
        "FONT_NORMAL": inline("fonts/archivo-latin-wdth-normal.woff2", "font/woff2"),
        "FONT_ITALIC": inline("fonts/archivo-latin-wdth-italic.woff2", "font/woff2"),
        "FONT_NAMES": inline("fonts/bebas-neue-latin-400-normal.woff2", "font/woff2"),
        "FIREWORKS": fireworks(),
        "BURST": burst,
        "ZIG": zig,
        "COMMITS": str(sum(weeks)),
        "WEEKS": str(len(weeks)),
        "REPOS": repos_html,
        "FACTS": facts_html,
        "ROWS": rows_html,
        "MUSIC": music_html,
        "LINKS": links_html,
        "GITHUB": link(f"https://github.com/{user}", f"github.com/{user}"),
        "DATE_SHORT": built.strftime("%d.%m.%y"),
        "BUILT_LONG": escape(f"{built.strftime('%A').upper()} {ordinal(built.day)} {built.strftime('%B %Y').upper()}"),
    }
    for key, value in fields.items():
        page = page.replace("{{" + key + "}}", value)
    return page


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--fixture", type=Path, help="build from this saved data instead of calling GitHub")
    parser.add_argument("--dump", type=Path, help="save the fetched data here")
    parser.add_argument("--out", type=Path, default=HERE / "_site" / "index.html")
    args = parser.parse_args()

    cfg = tomllib.loads((HERE / "site.toml").read_text(encoding="utf-8"))
    data = json.loads(args.fixture.read_text(encoding="utf-8")) if args.fixture else fetch(cfg)
    if args.dump:
        args.dump.write_text(json.dumps(data, indent=2), encoding="utf-8")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(render(cfg, data), encoding="utf-8")
    print(f"wrote {args.out} ({len(data['repos'])} repos, {sum(data['weeks'])} commits)")


if __name__ == "__main__":
    main()
