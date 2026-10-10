# EasyTorrent: Crosswalk / Chromium 34 compatibility build

Current build: **2.1.0.5-xwalk5-r2**.

## Install in Lampa

Disable every other EasyTorrent entry in Lampa's extensions list. Do not run the original and this compatibility build together. Add this URL as an extension:

```text
https://proton4.github.io/lampac/easytorrent2.1.0.5-xwalk5.js
```

Completely close and restart Lampa (or restart the TV Box). Then check Settings → EasyTorrent and the torrent results for a movie and a series. Do not clear Lampa application data just to replace the extension.

Fallback source URL, if GitHub Pages is unavailable:

```text
https://raw.githubusercontent.com/Proton4/lampac/main/easytorrent2.1.0.5-xwalk5.js
```

The extension filename follows the upstream filename. Its About screen retains the upstream version text `1.1.0 Beta`. The diagnostic object `window.EasyTorrentXWalk5` identifies this compatibility build as `2.1.0.5-xwalk5-r2`.

## Changes

The plugin is compiled to ES5 with Babel targeting Chromium 34. The single file includes core-js and whatwg-fetch; there is no runtime library CDN or Babel compiler to load. Modern syntax, Unicode regexp literals, and the two dynamically constructed Unicode regexps are adapted. The original scoring rules and settings schema remain unchanged. The original author is DarkestClouds (@darkestclouds); the Ukrainian adaptation is by cevamnelampaplagin.

The original plugin accepts configuration schema 2.1. As in upstream, incompatible or invalid configuration can fall back to defaults. This compatibility build does not change that migration behavior.

## Verified

- Pinned source Git blob and final ES5 syntax, including all bundled dependencies.
- Offline smoke tests with missing newer APIs: initialization, settings/event registration, seven Latin/Cyrillic torrent samples, movie and series scoring, sorting/filtering, duplicate loading, Promise/fetch/JSON over mocked XMLHttpRequest.

See `easytorrent2.1.0.5-xwalk5.build.json` and `easytorrent2.1.0.5-xwalk5.runtime-tests.json` for scope and limitations. Dependency notices are in `easytorrent2.1.0.5-xwalk5.LICENSES.txt`.

**Not verified:** the actual TV Box/Crosswalk executable, real Lampa UI layout, QR service, remote Supabase access, or TLS/certificate trust. JavaScript polyfills cannot repair OS certificate or TLS problems. The upstream CSS is retained, so old-engine spacing may differ. This is not a guarantee of every function on every firmware.

## Rebuild

```sh
npm ci --prefix tools/easytorrent-xwalk
node tools/easytorrent-xwalk/build.cjs
```

The build script uses an immutable upstream commit and verifies its blob hash. The GitHub Actions workflow rebuilds when `tools/easytorrent-xwalk/build.cjs` changes or when started manually. Polyfill dependencies must not be passed through Babel's `transform-typeof-symbol` again: doing so caused the initial r1 bootstrap failure, fixed in r2.
