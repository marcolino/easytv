# EasyTV — Build and Development Guide

This document describes how to install dependencies, run EasyTV locally, test keyboard/remote controls, and build distributable packages.

## Technology

- Electron
- Node.js
- JavaScript (CommonJS)
- electron-builder
- Castlabs Electron with Widevine support

### Important versions

| Component | Version |
|---|---|
| Electron | `46.0.0-alpha.7+wvcus` |
| electron-builder | `^26.18.1` in `package.json` |
| Node.js | 22.x (development target) |

The project uses the Castlabs Electron distribution rather than standard Electron. Do not replace it with standard Electron: Widevine support is required.

## Requirements

- Node.js 22.x and npm
- Git
- Platform-specific build tools where required
- For Windows packaging from Linux: the tools required by electron-builder for the selected NSIS target

## Clone and install

```bash
git clone https://github.com/marcolino/easytv.git
cd easytv
npm install
```

The Electron dependency is obtained from the Castlabs GitHub repository.

If Git attempts to access the public repository through SSH and no SSH key is configured, use an HTTPS URL rewrite:

```bash
git config --global url."https://github.com/".insteadOf "git@github.com:"
```

## Development

Check JavaScript syntax:

```bash
npm run check
```

Launch EasyTV on Linux through XWayland:

```bash
npm start
```

Launch using native Wayland instead:

```bash
npm run start:wayland
```

Enable the optional tray for a development launch:

```bash
EASYTV_TRAY=1 npm start
```

The default start script already sets `TMPDIR` and `electron_config_cache` inside the project. Create their directories if necessary:

```bash
mkdir -p .tmp .electron-cache
```

The tray is disabled by default. When enabled, it offers **Apri EasyTV**, **Chiudi streaming**, and **Esci** and can keep the application running after its windows close.

## npm scripts

The following commands are defined in the current `package.json`.

| Command | Purpose | Increments build number? |
|---|---|---|
| `npm start` | Development launch using XWayland | No |
| `npm run start:wayland` | Development launch using native Wayland | No |
| `npm run check` | JavaScript syntax and translation checks | No |
| `npm run i18n:sync` | Add missing translation keys | No |
| `npm run i18n:check` | Validate translations | No |
| `npm run i18n:prune -- --dry-run` | Preview unused keys | No |
| `npm run i18n:prune` | Remove unused keys | No |
| `npm run i18n:translate` | Sync and translate using MyMemory | No |
| `npm run i18n` | Translate and check | No |
| `npm run build` | Translation checks and Windows/Linux packages | Yes (per target) |
| `npm run build:win` | Windows x64 NSIS installer | Yes |
| `npm run build:linux` | Linux x64 Debian package | Yes |
| `npm run pack:linux` | Unpacked Linux application | Yes |
| `npm run vm` | Open virt-manager | No |

With this naming scheme, npm runs `prebuild:win`, `prebuild:linux`, or `prepack:linux` automatically before the corresponding packaging command. Each hook executes `node scripts/increment-build.js`.

**If your project still uses `dist:win`, `dist:linux`, or `dist:linux:deb`**, use those names instead until you update `package.json`; the matching `predist:*` hooks provide the same counter behavior. Do not make a build script invoke a wrapper that recursively invokes the same npm script.

### Build number and version

- The semantic application version is in `package.json` (currently `1.0.0`).
- The package build counter is in `src/config/build-info.json` (the `build` field).
- `scripts/increment-build.js` increments the counter **before** a packaging command starts.
- Development launches and syntax checks do not increment it.
- A failed build still consumes a build number; this is expected with pre-build hooks.
- The build number is shared across Windows and Linux builds, rather than maintained separately per platform.
- The main-window title and channel-selection header show the version and build number, e.g. `EasyTV 1.0.0 · build 42`.
- Running `npm start` after a build displays the most recently stored build number; it does not generate a new one.

Use `npm run build:win` / `npm run build:linux` rather than invoking `npx electron-builder` directly if you want automatic build numbering. Direct electron-builder commands bypass npm's pre-script hooks.

## Source maintenance

Use two spaces for indentation (no tabs) and a blank line between function declarations. Keep genuine runtime errors and build/translation command output; avoid routine development logging. The direct TV player depends on `hls.js`, installed by `npm install`. FFmpeg and VLC are optional diagnostic tools, not runtime dependencies.

Translation dictionaries are in `src/locales/` (en, it, fr, de). Review the dry-run output before pruning: the static scanner may miss dynamically constructed keys. Do not automatically prune during packaging.

Original stations are in `src/config/tvs.json` and `src/config/radios.json`. The main process manages persistent user catalogues, preferences and logo lookup. Renderer files contain the Home/settings interface and separate TV and radio players. Keep broadcaster-specific web-player code intact when changing direct playback.

## Build configuration

The packaging configuration is maintained in `electron-builder.yml`, with platform-specific settings for Linux, Windows, and macOS.

The global `electronDist` setting must not point to a locally installed Linux Electron distribution: electron-builder needs to obtain the appropriate Castlabs distribution for the target platform.

The Castlabs download mirror is configured as:

```yaml
electronDownload:
  mirror: https://github.com/castlabs/electron-releases/releases/download/
```

The trailing slash is important. A representative download URL is:

```text
https://github.com/castlabs/electron-releases/releases/download/v46.0.0-alpha.7+wvcus/electron-v46.0.0-alpha.7+wvcus-darwin-arm64.zip
```

## Linux build

From Linux, build the Debian package:

```bash
npm run build:linux
```

Or build an unpacked Linux application:

```bash
npm run pack:linux
```

The output is placed in `dist/`.

If the older script names are still in your `package.json`, use `npm run dist:linux:deb` or `npm run dist:linux` as appropriate.

## Windows build

The Windows x64 installer uses NSIS and can be built from the configured Linux development environment:

```bash
npm run build:win
```

The configured installer allows the user to choose the installation directory and creates Start Menu and desktop shortcuts. Output is placed in `dist/`.

The earlier `scripts/build-win.sh` wrapper performed additional checks and reported checksums. If you retain it, ensure it invokes the direct packaging script without recursion. The simplified npm script runs electron-builder directly.

Test the installer on Windows independently of a successful packaging run.

## macOS build

The macOS build targets Apple Silicon (ARM64). It is performed using a GitHub Actions macOS runner because the development environment does not include a Mac.

The workflow uses an electron-builder command equivalent to:

```bash
npx electron-builder --mac --arm64 --publish never
```

Configured targets:

- DMG
- ZIP

The macOS icon is generated from the PNG source using `sips` and `iconutil` during CI.

**Build-number caveat:** The direct macOS electron-builder command above does **not** run the Linux/Windows npm pre-build hooks. The macOS CI workflow must explicitly invoke the increment script if macOS packages should participate in the shared counter. CI-generated increments also need a deliberate strategy for persisting the updated counter back to the repository; otherwise they are local to the workflow run.

### macOS signing

The current experimental build is unsigned:

- No Apple Developer ID certificate.
- No notarization.
- No hardened-runtime distribution configuration.

This is suitable for initial testing, not for a public macOS release. A production release will require signing, an appropriate hardened-runtime configuration, and notarization.

## GitHub Actions

The macOS workflow is manually triggered and produces an artifact named `easytv-macos-arm64`, containing the generated macOS packages.

To retrieve it, open the repository on GitHub, go to **Actions**, select the completed macOS build, and download `easytv-macos-arm64` from **Artifacts**.

The workflow verifies packaging, not successful playback on a physical Mac.

## Keyboard and infrared-remote testing

EasyTV uses a common keyboard-command path in Electron's main process for numeric selection and channel switching. This is designed to work with USB infrared receivers that emit compatible keyboard events; no direct raw-IR or system-wide keyboard capture is currently implemented.

| Input | Expected action |
|---|---|
| `1`, wait 1.5 seconds | Open Rai 1 |
| `4`, `8`, wait 1.5 seconds | Open Rai News 24 |
| `PageUp` | Next channel in numeric order, wrapping around |
| `PageDown` | Previous channel in numeric order, wrapping around |
| `Home` while streaming | Close stream and return to channel list |
| `Esc` while streaming | Close stream (or cancel pending numeric entry) |
| `F11` in main window | Toggle main-window fullscreen |

**Focus behavior:** When changing channels, EasyTV must keep focus on the new streaming window. When the stream is actually closed, focus returns to the main window. The implementation registers the replacement streaming window before closing the previous one, and the old window's `closed` event must not refocus the main window.

**Linux keypad note:** With Num Lock off, Electron may report `input.key === 'Home'` with `input.code === 'Numpad7'`, `PageUp`/`Numpad9`, or `PageDown`/`Numpad3`. Command matching should primarily use `input.key`.

When IR hardware becomes available, identify it with:

```bash
lsusb
cat /proc/bus/input/devices
```

For supported Linux IR receivers, `ir-keytable` can also help inspect device mappings. A Flirc-style programmable HID receiver can be configured to emit the keyboard keys above. Other receivers may need Linux `rc-core`/LIRC configuration. Actual IR-hardware testing remains pending.

## Widevine and DRM

EasyTV uses Castlabs Electron `46.0.0-alpha.7+wvcus`. Widevine components are initialized at startup:

```javascript
await components.whenReady();
```

The presence of a Widevine-enabled Electron build and successful packaging do not prove DRM playback works. Test each target operating system for startup, ordinary and DRM-protected streams, playback after advertisements, audio, fullscreen, channel switching, and returning to the channel list.

Windows Canale 5 playback, including after advertising, has been tested successfully. macOS Widevine playback remains unverified on physical hardware.

## macOS testing checklist

- [ ] Application opens and channel-selection window loads.
- [ ] Main window starts fullscreen and F11 toggles fullscreen.
- [ ] Channel buttons and numeric labels display correctly.
- [ ] Mouse channel selection works.
- [ ] Numeric entry, CH+/CH−, Home, and Esc work.
- [ ] Streaming window opens fullscreen and retains focus after switching channels.
- [ ] Ordinary streams play.
- [ ] Canale 5 plays after advertising.
- [ ] Audio works.
- [ ] Optional tray behavior works when enabled (macOS menu-bar equivalent).
- [ ] Application quits and restarts normally.
- [ ] Widevine-protected streams work on physical Apple Silicon hardware.

## Catalogue and player regression tests

- [ ] Search TV and radio, clear searches and test delayed search and pagination.
- [ ] Preview, import, manually add, edit and delete stations; test undo and persistence.
- [ ] Verify logo search and preview, favorites, groups, ordering and all four languages.
- [ ] Verify direct HLS, official web playback, Auto fallback and radio reconnection.
- [ ] Verify F2, F10, numeric selection, fullscreen, channel banner and cursor hiding.
- [ ] Test on each target OS; successful Linux playback does not establish cross-platform compatibility.

## Release considerations

Before publishing a production release:

- Test installers and remote/keyboard navigation on each target OS.
- Verify Widevine playback independently on each platform.
- Verify channel-switch focus and fullscreen behavior after advertisements.
- Verify optional tray behavior and normal application shutdown.
- Sign Windows and macOS packages as appropriate; notarize macOS packages.
- Verify that all required assets, logos, icons, and build metadata are included.
- Keep Electron and Castlabs versions consistent across builds.
- Decide how the shared build counter is managed in CI and source control.

## Development and production profiles

Unpackaged Electron launches use `easytv-dev` under the OS application-data directory. Packaged launches retain the standard `easytv` profile. Close all instances before moving or backing up profiles. No automatic migration is performed.

Run `npm run i18n` explicitly when translations need updating. `npm run build` validates dictionaries but does not call MyMemory or rewrite translations.

### Restore default settings

The button at the bottom of Settings resets only the active profile after confirmation and restarts EasyTV. Custom catalogues, favorites, groups, playback modes, language preferences, last station and logo cache are reset. Browser cookies and DRM data are retained. Previous JSON files are moved to a unique `reset-backup-*` directory inside the active profile. To restore them, close EasyTV and copy the saved JSON files back to that profile, replacing the current files as needed. The other profile and packaged default catalogues are not changed.

## Playback controls and translation overrides

OFF / F10 exits EasyTV; kiosk shutdown is managed externally. Backspace recalls the previous station when no numeric entry is pending. Numeric entry shows an on-screen display where the playback surface permits it.

Approved translations belong in `src/locales/translation-overrides.json`. Run `npm run i18n:sync` to apply them without network requests. Builds do not translate automatically.

## Settings and numeric selection

TV and radio share optional unique numeric shortcuts (0–9999). Assign radio numbers in the station editor, for example 105 for Radio 105. Enter confirms immediately; otherwise selection follows the 1.5-second timeout (or four digits). The language selector lists the four supported languages; initial language detection remains automatic.

Use `npm run i18n:sort` to sort translation keys without changing values. Synchronization, pruning and translation also write sorted dictionaries.

## Interface typography

Open Sans is supplied by the production dependency `@fontsource/open-sans`. Run `npm install` after updating the dependency list. The renderer loads the font locally; no external font service is required. Verify the font assets are included in packaged builds. The channel-name banner retains its separate font stack.

### Manual TV channels

Provide a name and at least one URL: a direct stream or an HTTPS official player page. Both URLs enable automatic fallback. Original stations can be previewed; their edit and delete controls explain why those operations are unavailable. Remove original stations from favorites instead.

For interactive web services, F10 returns to EasyTV Home; a separate second press exits EasyTV. Groups can be expanded individually and reordered using their drag handles.

## Source configuration layout

Default TV, radio and service catalogues and the build counter live in `src/config/`. When updating an older checkout, run `bash migrate-config.sh` after extracting the update to move the existing JSON files, preserving local edits and the build counter. Translation dictionaries remain in `src/locales/`; user profiles are unchanged.
