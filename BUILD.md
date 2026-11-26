# EasyTV — Build and Development Guide

## Toolchain

EasyTV uses CommonJS JavaScript, Electron, electron-builder, hls.js and locally bundled Open Sans.

| Component | Version / requirement |
|---|---|
| Node.js | 22.x development target |
| Electron | Castlabs `46.0.0-alpha.7+wvcus` |
| electron-builder | `^26.18.1` |
| hls.js | `^1.6.0` |
| @fontsource/open-sans | `^5.2.0` |

Use the Castlabs distribution, not standard Electron, to retain Widevine support. Install Git, npm and platform-specific packaging tools (including the tools required for NSIS cross-builds on Linux).

```bash
git clone https://github.com/marcolino/easytv.git
cd easytv
npm install
mkdir -p .tmp .electron-cache
npm run check
npm start
```

The Electron dependency is fetched from the Castlabs GitHub repository. If Git attempts SSH access without a configured key, use an appropriate HTTPS URL rewrite in your Git configuration.

## Commands

| Command | Purpose |
|---|---|
| `npm start` | Linux development launch using X11/XWayland |
| `npm run start:wayland` | Native Wayland development launch |
| `npm run check` | JavaScript syntax and translation checks |
| `npm run build` | Check, then build Windows and Linux packages |
| `npm run build:win` | Windows x64 NSIS installer |
| `npm run build:linux` | Linux x64 Debian package |
| `npm run pack:linux` | Unpacked Linux x64 application |
| `npm run vm` | Launch virt-manager |

The launch scripts set project-local `TMPDIR` and `electron_config_cache`. Set `EASYTV_TRAY=1` to enable the optional tray. There is no TVSET or application-managed system shutdown. Use the kiosk supervisor for any shutdown or shell redirection after EasyTV exits.

## Source layout

```text
src/
  config/
    tvs.json
    radios.json
    services.json
    build-info.json
  locales/
    en.json
    it.json
    fr.json
    de.json
    translation-overrides.json
  main.js
  preload.js
  preferences.js
  tv-catalogue.js
  radio-browser.js
  logo-finder.js
  reset-profile.js
  i18n.js
  renderer/
scripts/
  increment-build.js
  i18n-check.js
  i18n-translate.js
  i18n-sort.js
package.json
electron-builder.yml
```

`main.js` owns Electron windows, input routing, playback supervision and IPC. `preload.js` exposes renderer operations. Preferences manage favorites, groups and playback settings; catalogue modules manage station definitions and persistent edits. Services are represented internally as TV entries with a `service` flag, but have a separate factory JSON file. The renderer owns the Home, Settings, radio and direct-TV interfaces.

For checkouts predating the configuration-directory migration, use `bash migrate-config.sh` from the project root after applying the relevant update. Preserve local JSON edits and the build counter; remove obsolete root-level configuration copies only after verifying migration. Translation dictionaries remain in `src/locales/`.

## Factory data and profiles

Factory definitions use stable IDs, names, URLs, optional numbers, logos, groups and favorite flags. See [README.md](README.md) for the current default favorites. Keep IDs stable to preserve saved references. Numbers must be unique across TV, radio and services; valid numbers are integers from 0 to 9999, or null for unnumbered entries. Keep unselected factory entries available in the catalogue. The default number input placeholder is empty.

Development and packaged profiles are separate (`~/.config/easytv-dev/` and `~/.config/easytv/` on Linux). User files include `settings.json`, `tv-catalogue.json`, `radio-catalogue.json` and `logo-cache.json`. Do not package these files or browser sessions. Existing custom entries and saved overrides can affect factory-number changes; test migrations with conflicting numbers and duplicate service URLs. Radio migration can match existing stations by normalized name or stream URL. Avoid destructive deduplication of personal entries.

Reset moves active profile JSON files (including temporary counterparts if present) to a unique `reset-backup-*` directory, rolls back moves if an error occurs, and restarts the application on success. Cookies and DRM data are intentionally retained. Test both profile isolation and backup restoration.

## Translation maintenance

The interface supports English, Italian, French and German. Use stable English source keys and preserve interpolation placeholders. Keep manually approved translations in `src/locales/translation-overrides.json`, including intentionally identical values such as `Web` in Italian.

| Command | Purpose |
|---|---|
| `npm run i18n:check` | Validate translation coverage |
| `npm run i18n:sync` | Synchronize dictionaries and apply overrides |
| `npm run i18n:translate` | Synchronize and request missing translations from MyMemory |
| `npm run i18n:prune` | Remove obsolete dictionary keys |
| `npm run i18n:sort` | Sort dictionary keys without changing values |
| `npm run i18n` | Translate and validate |

Review automatic translations before committing. Builds validate translations but do not automatically request new ones. Backend number-validation errors currently use English messages; do not assume all backend errors are localized.

## Interface conventions

Use two-space indentation and blank lines between functions. Keep UI tooltips and translation coverage consistent. Open Sans is bundled through Fontsource; verify font assets in packaged builds. Home group headings use 14px, 0.3px letter spacing and color `#4d7dde`. Keep logos and names vertically centered above numeric keycaps in stacking order; do not reserve extra bottom space. Settings numbers use smaller keycaps beneath names. Preserve the separate rounded channel-banner typography and color `#f8ffba`.

## Packaging and build numbers

The semantic version is in `package.json` (currently 1.0.0). The shared build counter is in `src/config/build-info.json`. The npm prebuild/prepack hooks invoke `scripts/increment-build.js` before packaging; failed builds consume a number. Development launches and checks do not increment it. `npm run build` increments separately for the Windows and Linux packages. Do not overwrite the counter in incremental updates.

Packaging configuration belongs in `electron-builder.yml`. Keep the Castlabs download mirror and avoid a global `electronDist` pointing to a host-specific Electron installation:

```yaml
electronDownload:
  mirror: https://github.com/castlabs/electron-releases/releases/download/
```

```bash
npm run build:linux
npm run build:win
# Or build both:
npm run build
```

Outputs are placed in `dist/`. Install the Debian package with `sudo apt install ./dist/easytv_1.0.0_amd64.deb` (adjust filename); use `--reinstall` when replacing the same version. Test the NSIS installer on Windows independently of successful cross-packaging. Do not recursively invoke an npm build script from its wrapper.

### macOS

The manually triggered `Build macOS` GitHub Actions workflow builds separate ARM64 (Apple Silicon) and x64 (Intel) DMG and ZIP packages on native macOS runners. Open the repository's Actions tab, select the workflow and choose Run workflow. Download `easytv-macos-arm64` or `easytv-macos-x64` from the completed run. Artifacts expire after 14 days.

The workflow generates the ICNS icon from `assets/logos/easytv-512.png`, runs source checks, uses `npm ci` when the lockfile is tracked (otherwise `npm install` with a warning), and verifies the packaged executable architecture. Keep the Castlabs dependency and download mirror. The two jobs run independently.

The workflow invokes electron-builder directly and deliberately does not increment or persist the shared local build counter. Identify CI packages by the GitHub Actions run and commit. No packages are published automatically. Experimental builds have no Developer ID signing or notarization; local ad-hoc signing may still be required by macOS. Successful packaging does not establish Widevine or playback compatibility. Test on actual Macs before distribution.

## Playback and input architecture

Direct TV and HLS radio use hls.js where applicable. Auto TV playback falls back to the official web player after direct recovery fails. Official websites control their own player UI, authentication and DRM. Castlabs Widevine components initialize at startup; never weaken browser security or bypass service restrictions to make a stream work.

Keep normal numeric input routing separate from interactive web services and Settings text entry. F10 returns from interactive services to Home and quits elsewhere; do not restore F4 or TVSET. Prevent key repeat from causing an unintended second F10 action. Channel changes must retain focus on the replacement window, not refocus Home when the old window closes. Numeric OSD must clear on confirmation or cancellation. For keypad input, match Electron's `input.key` appropriately when Num Lock is off.

Home DevTools shortcuts have previously been unreliable. For local development debugging only, use `mainWindow.webContents.openDevTools({ mode: 'detach' })` after creating the window, guarded by `!app.isPackaged`; remove temporary instrumentation before release. Do not log credentials or session tokens.

## Regression and release checklist

- [ ] Run `npm run check`; verify configuration JSON, unique default numbers, and 25 default favorites in the correct group order.
- [ ] Test a fresh profile, existing profile migration, reset and backup recovery; preserve production/development isolation.
- [ ] Test search, import, preview, manual TV with either URL, radio edits, protected controls, duplicate-number messages and Undo.
- [ ] Test alternative logo search, current-URL exclusion, no-result handling and Undo; verify saved logos after restart.
- [ ] Test group accordions, save/cancel/delete, green drop indicator, order persistence and global accordion exclusivity.
- [ ] Test Home and catalogue numbers, logo stacking, typography, OSD, numeric shortcuts across all types, recall and focus.
- [ ] Test all twelve factory radios, including HLS, reconnection and audio visualization.
- [ ] Test TV Web/Direct/Auto, fallback, fullscreen, cursor and toolbar behavior, and playback after advertisements.
- [ ] Test Netflix and each other service: login typing, session persistence, playback, F10 return and subsequent exit.
- [ ] Test Rai Storia manual playback and automatic startup separately; verify other RaiPlay channels do not regress.
- [ ] Test all four languages and translation overrides; verify bundled font assets and package icons.
- [ ] Test installers, tray, keyboard/IR mapping and Widevine playback on each target OS; sign packages as appropriate.

## Known verification limits

Linux Netflix playback and Rai 4 Web playback were confirmed by the user. Rai Storia manual fullscreen playback works, but automatic startup remains unresolved or unconfirmed. Other subscription services and all factory radio endpoints have not been comprehensively verified. Earlier Windows tests do not establish compatibility of every recent feature; macOS physical-device and DRM testing remain pending. Syntax checks and successful packaging are not substitutes for Electron runtime tests.
