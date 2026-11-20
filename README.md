# EasyTV

EasyTV is a simple desktop application for watching live TV channels from your computer.

It provides a fullscreen channel-selection window and opens the selected stream in a separate fullscreen window. Channels can be selected with the mouse, keyboard, or a suitably configured infrared remote control.

## Screenshots

*A picture is worth a thousand words!* :-)

![EasyTV v1 screenshot](screenshots/easytv-v2.png)

## Features

- Channel-selection interface with broadcaster logos and right-aligned channel numbers.
- Conventional Italian TV channel numbering, including Rai News 24 (48).
- Mouse selection and keyboard-based channel selection.
- TV-style numeric entry with a 1.5-second timeout and Enter/OK confirmation.
- Next/previous channel navigation and return-to-channel-list shortcuts.
- Ready for infrared remotes whose USB receiver produces compatible keyboard events; physical IR hardware integration is not yet verified.
- Fullscreen channel-selection window, F11 fullscreen toggle, and fullscreen streaming playback.
- Optional system tray, disabled by default.
- Application version and automatically incremented package build number.
- Persistent browser session for streaming websites.
- Widevine DRM support through Castlabs Electron.

## Supported platforms

| Platform | Package | Status |
|---|---|---|
| Linux x64 | Debian `.deb` | Tested |
| Windows x64 | NSIS `.exe` installer | Tested |
| macOS ARM64 | `.dmg` / `.zip` | Experimental |

**macOS note:** The macOS application has been successfully packaged, but it has not yet been tested on a physical Mac. Widevine DRM playback is not yet verified on macOS.

## Installation

### Linux

Download the Debian package and install it (adjust the filename to the downloaded release):

```bash
sudo apt install ./easytv_1.0.0_amd64.deb
```

Launch EasyTV from your applications menu.

### Windows

Download and run the EasyTV Windows installer (`.exe`). Follow the installation instructions and launch EasyTV from the Start menu or desktop shortcut.

### macOS

macOS builds are currently experimental and intended for testing on Apple Silicon (ARM64). The application is not yet signed or notarized, and compatibility with streaming services and DRM has not been verified on a physical Mac.

## Usage

1. Launch EasyTV. The channel-selection window starts fullscreen.
2. Click a channel, or enter its channel number using the keyboard.
3. The stream opens in a separate fullscreen window.
4. Press `Esc` while streaming to close the stream and return to channel selection.
5. Press `F11` in the main window to toggle fullscreen; `Esc` exits main-window fullscreen.

The channel-selection buttons remain clickable and keyboard-accessible. Their logos and labels cannot be accidentally selected by dragging if the renderer's selection-prevention styling is enabled.

### Channel numbers

| Number | Channel | Number | Channel |
|---:|---|---:|---|
| 1 | Rai 1 | 7 | LA7 |
| 2 | Rai 2 | 8 | TV8 |
| 3 | Rai 3 | 9 | NOVE |
| 4 | Rete 4 | 48 | Rai News 24 |
| 5 | Canale 5 | | |
| 6 | Italia 1 | | |

Numbers are defined explicitly in `src/channels.js`; they are independent of the order of the buttons on screen.

### Keyboard and infrared-remote controls

| Keyboard key | Typical remote button | Action |
|---|---|---|
| `0`–`9` | Number keys | Enter a channel number |
| `Enter` | OK | Confirm the entered number immediately |
| `Backspace` | Delete | Remove the last entered digit |
| `Esc` | Back | Cancel pending numeric entry; otherwise close streaming |
| `Home` | Home | Close streaming and return to the channel list |
| `PageUp` | CH+ | Next available channel in numeric order |
| `PageDown` | CH− | Previous available channel in numeric order |
| `F11` (main window) | — | Toggle main-window fullscreen |

Numeric entry waits **1.5 seconds** after the last digit unless confirmed with `Enter`. For example, `4`, `8` selects Rai News 24. CH+/CH− wrap around at the ends of the channel list.

**Infrared hardware:** EasyTV currently handles keyboard events, not raw infrared signals. A programmable USB IR receiver (such as a keyboard-emulating receiver) can be configured to send the keys above. Other receivers may require Linux `rc-core`/LIRC configuration or additional mapping. The receiver must deliver input to an EasyTV window; system-wide remote control is not implemented. Physical IR-device testing is pending.

### Optional system tray

The system tray is **disabled by default**. Closing all EasyTV windows normally exits the application.

On Linux, when launching from a terminal, enable the tray with:

```bash
EASYTV_TRAY=1 npm start
```

When enabled, the tray offers **Apri EasyTV**, **Chiudi streaming**, and **Esci**. Closing all windows then leaves EasyTV running in the tray. The environment variable is a development/launch configuration; a packaged-app settings interface has not yet been added.

## Streaming and DRM

Streaming availability and playback quality depend on the broadcaster's website, network connection, and regional restrictions.

Some channels use Widevine DRM. EasyTV uses a Castlabs Electron build with Widevine support. Successful playback may depend on the operating system, browser components, advertisements, and broadcaster changes.

## Support and development

For installation details, build numbering, build instructions, and development information, see [BUILD.md](BUILD.md).

Project repository: https://github.com/marcolino/easytv
