# Building EasyTV

This document describes how to prepare the development environment, validate the source code, and build EasyTV for Linux and Windows.

## 1. Requirements

### Common requirements

- Git
- Node.js and npm
- Internet connection
- A clone of the EasyTV repository

The project uses:

- Electron (Castlabs build with Widevine support)
- electron-builder

The Electron dependency is defined in `package.json`:

```json
"electron": "github:castlabs/electron-releases#v46.0.0-alpha.7+wvcus"
```

Do not replace it with the standard Electron package: the Castlabs build is used for Widevine support.

### Linux build environment

A Linux distribution with a graphical desktop is recommended. The build has been tested on Ubuntu.

### Windows build environment

- Windows 10 or Windows 11, 64-bit
- Node.js and npm
- Git for Windows
- Microsoft Visual C++ Redistributable 2015–2022 (x64)

The Visual C++ Redistributable is required by the native components used by Electron.

A Windows virtual machine can be used to build and test the Windows version from a Linux host.

## 2. Get the source code

Clone the repository:

```bash
git clone https://github.com/marcolino/easytv.git
cd easytv
```

Install dependencies:

```bash
npm install
```

For subsequent installations, if the repository contains a synchronized `package-lock.json`, you can use:

```bash
npm ci
```

## 3. Validate the source

Run the syntax checks:

```bash
npm run check
```

This checks the JavaScript files:

- `src/main.js`
- `src/preload.js`
- `src/channels.js`

## 4. Build for Linux

The Linux build uses the configuration in `electron-builder.yml`.

The current configuration generates a Debian package (`.deb`).

### Build the Debian package

```bash
npm run dist:linux:deb
```

Alternatively:

```bash
npm run dist:linux
```

### Build an unpacked application directory

Useful for testing before creating an installer:

```bash
npm run pack:linux
```

### Output

Build artifacts are written to:

```text
dist/
```

The Debian package will have a name similar to:

```text
easytv_1.0.0_amd64.deb
```

Install the package locally for testing:

```bash
sudo apt install ./dist/easytv_1.0.0_amd64.deb
```

## 5. Build for Windows

The Windows build is produced using electron-builder and the NSIS installer target.

**Important:** Build the Windows version on Windows. A Windows VM running on a Linux host is suitable.

### 5.1 Prepare the Windows environment

Install:

1. Node.js and npm.
2. Git for Windows.
3. Microsoft Visual C++ Redistributable 2015–2022 (x64).

Restart Windows after installing the Visual C++ Redistributable if required.

Open Command Prompt or Git Bash and clone the repository:

```bash
git clone https://github.com/marcolino/easytv.git
cd easytv
```

### 5.2 Install dependencies

From Windows Command Prompt:

```cmd
npm install
```

Check the installed Electron version:

```cmd
node -p "require('electron/package.json').version"
```

It should report:

```text
46.0.0-alpha.7+wvcus
```

Check that Electron can start:

```cmd
npx electron --version
```

### 5.3 Prepare the Windows application icon

The Windows installer requires an `.ico` file.

The source image is:

```text
assets/logos/easytv-512.png
```

Generate the ICO file from the project root:

```cmd
npx --yes png-to-ico assets/logos/easytv-512.png > assets/logos/easytv.ico
```

The resulting file should be:

```text
assets/logos/easytv.ico
```

### 5.4 Windows configuration

The following Windows configuration must be present at the end of `electron-builder.yml`:

```yaml
win:
  target:
    - nsis
  icon: assets/logos/easytv.ico

nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
```

Keep the existing Linux configuration unchanged.

### 5.5 Build the Windows installer

From Windows Command Prompt:

```cmd
npx electron-builder --win nsis --x64
```

### Output

The installer is generated in:

```text
dist/
```

Expected output:

```text
dist/
├── EasyTV Setup 1.0.0.exe
└── EasyTV Setup 1.0.0.exe.blockmap
```

The `.exe` file is the installer to distribute.

### 5.6 Test the installed application

1. Run `EasyTV Setup 1.0.0.exe`.
2. Complete the installation.
3. Launch EasyTV from the Start menu or desktop shortcut.
4. Check that the channel-selection window opens.
5. Test a normal live stream.
6. Test a DRM-protected channel, such as Canale 5.
7. Check that playback and audio work correctly.

The first launch may need internet access to initialize or download Widevine components.

## 6. Development and testing

### Run on Linux

```bash
npm start
```

### Run on Windows

```cmd
npx electron .
```

The Windows development command is used instead of the Linux-specific `npm start` script.

### Run syntax checks

On either platform:

```bash
npm run check
```

## 7. Build summary

| Platform | Command | Result |
|---|---|---|
| Linux | `npm run pack:linux` | Unpacked application |
| Linux | `npm run dist:linux:deb` | Debian installer |
| Windows | `npx electron-builder --win nsis --x64` | Windows NSIS installer |

## 8. Important notes

- Use the Castlabs Electron distribution specified in `package.json`.
- Keep the Linux build configuration intact when adding or changing Windows settings.
- The Windows `.ico` file is required by the Windows packaging configuration.
- Windows builds should be tested on Windows, including when using a virtual machine.
- The Windows installer is currently unsigned. A code-signing certificate would be needed to sign it.
- Do not distribute a build until both ordinary streaming and DRM-protected playback have been tested.
- Build artifacts are stored in `dist/` and should not be committed to the source repository.
