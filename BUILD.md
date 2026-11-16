# EasyTV — Build and Development Guide

This document describes how to install dependencies, run EasyTV locally and build distributable packages.

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
| electron-builder | `26.18.1` |
| Node.js | 22.x |

The project uses the Castlabs Electron distribution rather than the standard Electron release.

Do not replace it with standard Electron: Widevine support is required.

## Requirements

- Node.js 22.x
- npm
- Git
- Platform-specific build tools where required

## Clone and install

```bash
git clone https://github.com/marcolino/easytv.git
cd easytv

npm install
```

The Electron dependency is obtained from the Castlabs GitHub repository.

If Git attempts to access the public repository through SSH and no SSH key is configured, use an HTTPS URL rewrite:

```bash
git config --global \
  url."https://github.com/".insteadOf \
  "git@github.com:"
```

## Development

Check the JavaScript files:

```bash
npm run check
```

Run the application:

```bash
npm start
```

On Linux, if Electron's download/cache directories need to be kept inside the project, use:

```bash
mkdir -p .tmp .electron-cache

TMPDIR="$PWD/.tmp" \
electron_config_cache="$PWD/.electron-cache" \
npm start
```

## Build configuration

Build configuration is maintained in:

```text
electron-builder.yml
```

The configuration contains platform-specific settings for Linux, Windows and macOS.

The global `electronDist` setting must not point to a locally installed Linux Electron distribution: electron-builder needs to obtain the appropriate Castlabs distribution for the target platform.

The Castlabs download mirror is configured as:

```yaml
electronDownload:
  mirror: https://github.com/castlabs/electron-releases/releases/download/
```

The trailing slash is important.

The resulting download URL must follow this pattern:

```text
https://github.com/castlabs/electron-releases/releases/download/v46.0.0-alpha.7+wvcus/electron-v46.0.0-alpha.7+wvcus-darwin-arm64.zip
```

## Linux build

Build the Debian package on Linux:

```bash
npx electron-builder --linux deb --publish never
```

The output is placed in:

```text
dist/
```

## Windows build

Build the Windows x64 installer on Windows:

```bash
npx electron-builder --win --x64 --publish never
```

The configured target is NSIS.

The installer allows the user to choose the installation directory and creates Start Menu and desktop shortcuts.

Output:

```text
dist/
```

## macOS build

The macOS build currently targets Apple Silicon (ARM64).

It is performed using a GitHub Actions macOS runner because the development environment does not include a Mac.

Build command:

```bash
npx electron-builder --mac --arm64 --publish never
```

The configured macOS targets are:

- DMG
- ZIP

The macOS icon is generated from the PNG source using macOS tools (`sips` and `iconutil`) during the CI workflow.

### macOS signing

The current experimental build is unsigned:

- No Apple Developer ID certificate.
- No notarization.
- No hardened-runtime distribution configuration.

This is suitable for initial testing, not for a public macOS release.

A production release will require Apple Developer ID signing, the appropriate hardened-runtime configuration and notarization.

## GitHub Actions

The macOS build runs on a GitHub-hosted macOS runner.

The workflow is manually triggered and produces an artifact named:

```text
easytv-macos-arm64
```

The artifact contains the generated macOS package files.

To retrieve it:

1. Open the GitHub repository.
2. Go to **Actions**.
3. Select the completed macOS build.
4. Find the **Artifacts** section.
5. Download `easytv-macos-arm64`.

The current workflow verifies that packaging completes. It does not establish that the application works correctly on a physical Mac.

## Widevine and DRM

EasyTV uses the Castlabs Electron distribution:

```text
46.0.0-alpha.7+wvcus
```

Widevine components are initialized by the application at startup:

```javascript
await components.whenReady();
```

The presence of the Widevine-enabled Electron distribution and a successful package build do not, by themselves, prove DRM playback works.

The following tests should be performed on each target operating system:

- Application startup.
- Ordinary channel playback.
- Playback of DRM-protected channels.
- Playback after advertising.
- Audio.
- Fullscreen behavior.
- Closing the stream and returning to channel selection.

Windows Canale 5 playback, including after advertising, has been tested successfully.

macOS Widevine playback remains unverified and requires testing on a physical Apple Silicon Mac.

## macOS testing checklist

When a physical Mac becomes available, test:

- [ ] Application opens successfully.
- [ ] Main channel-selection window loads.
- [ ] Channel selection works.
- [ ] Streaming window opens in fullscreen.
- [ ] Ordinary streams play.
- [ ] Canale 5 plays after advertising.
- [ ] Audio works.
- [ ] `Esc` closes the streaming window.
- [ ] System tray behavior works.
- [ ] Application can be quit and restarted normally.

## Release considerations

Before publishing a production release:

- Test the installers on their target operating systems.
- Verify Widevine playback independently on each platform.
- Sign Windows and macOS packages as appropriate.
- Complete macOS notarization.
- Verify that all required assets and icons are included.
- Keep the Electron and Castlabs versions consistent across builds.