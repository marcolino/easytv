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

The following is the recommended simplified script naming scheme. Check your local `package.json` if you have not yet applied that cleanup.

| Command | Purpose | Increments build number? |
|---|---|---|
| `npm start` | Development launch using XWayland | No |
| `npm run start:wayland` | Development launch using native Wayland | No |
| `npm run check` | JavaScript syntax checks | No |
| `npm run build:win` | Windows x64 NSIS installer | Yes |
| `npm run build:linux` | Linux x64 Debian package | Yes |
| `npm run pack:linux` | Unpacked Linux application | Yes |
| `npm run vm` | Open virt-manager | No |

With this naming scheme, npm runs `prebuild:win`, `prebuild:linux`, or `prepack:linux` automatically before the corresponding packaging command. Each hook executes `node scripts/increment-build.js`.

**If your project still uses `dist:win`, `dist:linux`, or `dist:linux:deb`**, use those names instead until you update `package.json`; the matching `predist:*` hooks provide the same counter behavior. Do not make a build script invoke a wrapper that recursively invokes the same npm script.

### Build number and version

- The semantic application version is in `package.json` (currently `1.0.0`).
- The package build counter is in `src/build-info.json` (the `build` field).
- `scripts/increment-build.js` increments the counter **before** a packaging command starts.
- Development launches and syntax checks do not increment it.
- A failed build still consumes a build number; this is expected with pre-build hooks.
- The build number is shared across Windows and Linux builds, rather than maintained separately per platform.
- The main-window title and channel-selection header show the version and build number, e.g. `EasyTV 1.0.0 · build 42`.
- Running `npm start` after a build displays the most recently stored build number; it does not generate a new one.

Use `npm run build:win` / `npm run build:linux` rather than invoking `npx electron-builder` directly if you want automatic build numbering. Direct electron-builder commands bypass npm's pre-script hooks.

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
| `5`, `1`, `Enter` | Open TGCOM24 immediately |
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
