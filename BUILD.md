# EasyTV — Build and Development Guide

## Requirements and setup

Use Node.js 22, npm and Git. EasyTV uses Castlabs Electron `46.0.0-alpha.7+wvcus`, electron-builder `^26.18.1`, hls.js and locally packaged Open Sans. Do not substitute standard Electron for Castlabs without evaluating DRM support.

```bash
git clone https://github.com/marcolino/easytv.git
cd easytv
npm ci
npm run check
npm start
```

If the public Castlabs Git dependency is resolved via SSH, configure Git to use HTTPS instead:

```bash
git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"
git config --global --add url."https://github.com/".insteadOf "git@github.com:"
```

Commit `package-lock.json` alongside dependency or version changes. Use `npm ci` for reproducible builds. On Linux, `npm start` uses XWayland; `npm run start:wayland` uses native Wayland. `EASYTV_TRAY=1 npm start` enables the optional tray. Create `.tmp` and `.electron-cache` if needed.

## Source layout

| Path | Purpose |
|---|---|
| `src/main.js`, `src/preload.js` | Electron lifecycle, playback windows, keyboard commands and IPC |
| `src/preferences.js` | Persistent preferences and factory defaults |
| `src/tv-catalogue.js`, `src/radio-browser.js` | Catalogue management |
| `src/logo-finder.js` | Logo discovery and cache |
| `src/config-transfer.js`, `src/reset-profile.js` | Configuration transfer, backup and reset |
| `src/config/` | Factory TV, radio, services and build metadata JSON |
| `src/renderer/` | Home, Settings, direct TV and radio interfaces |
| `src/locales/` | English, Italian, French and German dictionaries and overrides |
| `scripts/` | Build, translation and release utilities |
| `tests/` | Node.js regression tests |
| `.github/workflows/` | Hosted packaging and release workflows |

Use two-space indentation, clear separation between functions and English source/documentation. Preserve the Home group heading style (`14px`, `0.3px` letter spacing, `#4d7dde`, `0 0 10px` margin). Keep user-facing strings translated and controls accessible with tooltips. Do not add routine development logging to production playback.

## Validation

```bash
npm test
npm run check
```

`npm run check` includes syntax checks, translation validation and the Node regression suite. Tests use temporary profiles, not the real user profile. Coverage includes configuration round trips, order-independent service number overrides, unique factory IDs and numbers, playback preferences and last station persistence, factory reset preserving browser sessions, and import rollback after an injected write failure.

## Translation maintenance

```bash
npm run i18n:sync
npm run i18n:translate
npm run i18n:prune
npm run i18n:sort
npm run i18n:check
```

Protect manually approved translations in `src/locales/translation-overrides.json`, including intentionally identical strings such as Web. Sync applies overrides without network translation; translate uses the automatic translation service. Sort preserves values. Builds validate translations but do not automatically translate them.

## Local packaging

```bash
npm run build:linux  # Debian x64
npm run pack:linux   # unpacked Linux x64
npm run build:win    # Windows NSIS x64
npm run build        # checks, Windows and Linux packages
```

Output is in `dist/`. Local pre-build hooks increment `src/config/build-info.json`. The CI workflow invokes electron-builder directly and does not increment or commit this counter; identify CI builds by tag, commit and workflow run. Preserve existing build metadata when applying updates.

## GitHub Actions and releases

The **Build macOS** workflow builds Intel and Apple Silicon packages. The **Build release packages** workflow builds Linux x64 (Debian and AppImage), Windows x64 (NSIS), macOS arm64 and macOS x64 (DMG and ZIP). It runs validation on each runner, generates the macOS icon from the PNG source, verifies macOS binary architecture and collects installers with platform-specific names.

Manual runs upload artifacts for 14 days. A pushed version tag matching `package.json` triggers the same builds and creates a draft GitHub Release with SHA-256 checksums after all jobs succeed. The draft must be reviewed and published manually. The four-platform manual workflow has succeeded; tag-triggered draft creation still needs verification for the first release.

### Release 1.1.0

From a clean checkout with the release documentation installed:

```bash
npm version 1.1.0 --no-git-tag-version
npm run check
git add package.json package-lock.json README.md BUILD.md CHANGELOG.md
git commit -m "Prepare EasyTV 1.1.0"
git push origin main
```

Ensure all preceding source changes are committed and pushed before tagging. Review the diff, run the manual build if desired, then:

```bash
git tag -a v1.1.0 -m "EasyTV 1.1.0"
git push origin v1.1.0
```

Review the resulting draft at https://github.com/marcolino/easytv/releases. Verify all seven installers and `SHA256SUMS.txt`, and replace generated notes with the 1.1.0 section of CHANGELOG.md if desired. Do not publish until the desired runtime checks are complete; label macOS builds experimental. Download the assets and run `sha256sum -c SHA256SUMS.txt` on Linux.

### macOS and DRM

The current macOS packages are not Developer ID signed or notarized. Packaging for both architectures has succeeded, but Gatekeeper, runtime and DRM behavior on physical Macs are unverified. Signing and notarization are future distribution work. Castlabs/Widevine availability alone does not establish Netflix compatibility on every OS. Netflix playback has been verified on Linux; test other platforms independently. Do not bypass DRM or authentication restrictions.

## Profiles and configuration safety

Development uses `easytv-dev` and packaged builds use `easytv` under the OS application-data directory. On Linux these are normally under `~/.config/`. Export/import operates on saved settings and catalogues, not browser sessions. Import validates before replacement, creates `import-backup-*` and rolls back on installation failure. Factory reset creates `reset-backup-*` and restores defaults while retaining browser sessions. Close EasyTV before manually restoring backup JSON files. Never commit personal profiles or exported configurations containing private URLs.

## Manual regression checklist

- Home, Settings, all four languages, favorites, group drag/drop and accordions.
- TV/radio search, manual add/edit/delete, Undo, logo alternatives, unique numeric shortcuts.
- Direct/Web/Auto playback, fallback, fullscreen, cursor hiding and numeric OSD.
- Radio MP3 and HLS, previous station, last-station startup and contextual F10.
- Direct TV network interruption: retained frame, prompt loading indicator, recovery and usable controls on failure.
- Export/import, cancellation, invalid data, backup, restart and preserved authentication.
- Netflix login, playback and ordinary typing; F10 returns to Home from interactive services.
- Install and run on each target OS; verify icons, fonts, audio, DRM and fullscreen. Physical macOS and IR hardware tests remain pending.

Rai Storia may require a manual Play click in its official player. Stream URLs and third-party sites can change independently of EasyTV. Do not mark untested platforms or services as verified.
