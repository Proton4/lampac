#!/usr/bin/env python3
"""Build Proton4 mirrors of Lampa plugins for old Crosswalk runtimes."""

from pathlib import Path
from urllib.request import Request, urlopen

NIGHTINGALE_URL = (
    "https://raw.githubusercontent.com/lampame/main/main/"
    "Nightingale/Nightingale.js"
)
TS_TRACKS_URL = (
    "https://raw.githubusercontent.com/lampame/main/main/"
    "tsTracksProbe/tsTracksProbe.js"
)


def download_text(url: str) -> str:
    request = Request(url, headers={"User-Agent": "Proton4-lampac-mirror/1.0"})
    with urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8")


def build_nightingale() -> None:
    source = download_text(NIGHTINGALE_URL)
    marker = "  'use strict';\n"
    if marker not in source:
        raise RuntimeError("Unexpected Nightingale source: strict-mode marker not found")

    polyfill = r'''

  /* Crosswalk 5 / Chromium 34 compatibility.
     The upstream plugin calls Promise.prototype.finally, which is absent
     in this runtime. Keep the upstream logic and add only this polyfill. */
  if (typeof Promise !== 'undefined' && !Promise.prototype['finally']) {
    Promise.prototype['finally'] = function (callback) {
      var PromiseCtor = this.constructor || Promise;
      return this.then(
        function (value) {
          return PromiseCtor.resolve(callback()).then(function () {
            return value;
          });
        },
        function (reason) {
          return PromiseCtor.resolve(callback()).then(function () {
            throw reason;
          });
        }
      );
    };
  }
'''

    header = '''/*
 * Nightingale - Crosswalk 5 compatibility build for Proton4/lampac.
 * Upstream: https://github.com/lampame/main/blob/main/Nightingale/Nightingale.js
 * Compatibility change: Promise.prototype.finally polyfill for Chromium 34.
 */
'''
    output = header + source.replace(marker, marker + polyfill, 1)
    Path("nightingale-xwalk5.js").write_text(output, encoding="utf-8")


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
    build_nightingale()
    build_ts_tracks()
    print("Built nightingale-xwalk5.js and tsTracksProbe.js")


if __name__ == "__main__":
    main()
