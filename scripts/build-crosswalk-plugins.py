#!/usr/bin/env python3
"""Mirror TS Tracks Probe for old Crosswalk/Lampa installations."""

from pathlib import Path
from urllib.request import Request, urlopen

TS_TRACKS_URL = (
    "https://raw.githubusercontent.com/lampame/main/main/"
    "tsTracksProbe/tsTracksProbe.js"
)


def download_text(url: str) -> str:
    request = Request(url, headers={"User-Agent": "Proton4-lampac-mirror/1.0"})
    with urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8")


def build_ts_tracks() -> None:
    source = download_text(TS_TRACKS_URL)
    header = '''/*
 * Mirrored for Proton4/lampac.
 * Upstream: https://github.com/lampame/main/blob/main/tsTracksProbe/tsTracksProbe.js
 * Source code is unchanged apart from this provenance header.
 */
'''
    Path("tsTracksProbe.js").write_text(header + source, encoding="utf-8")


def main() -> None:
    build_ts_tracks()
    print("Built tsTracksProbe.js")


if __name__ == "__main__":
    main()
