# EasyTV

EasyTV is a simple desktop application for watching Italian live TV channels.

It provides a straightforward channel-selection window. Select a channel and EasyTV opens its live stream in a separate window.

## Features

- Simple channel selection interface.
- Live streams from Italian TV channels.
- Full-screen video playback.
- System tray integration.
- Support for DRM-protected streams through Widevine.

### Available channels

- Rai 1
- Rai 2
- Rai 3
- Rai News 24
- Canale 5
- Rete 4
- Italia 1
- TGCOM24
- La7
- TV8
- NOVE

Channel availability and streaming quality depend on the broadcasters' services and your internet connection.

## Installation

Download the installer for your operating system from the project's Releases page:

**[EasyTV releases](https://github.com/marcolino/easytv/releases)**

### Windows

1. Download `EasyTV Setup` for Windows.
2. Run the installer.
3. Follow the installation instructions.
4. Launch EasyTV from the Start menu or desktop shortcut.

Windows may display a security warning because the installer is not digitally signed. Only install software downloaded from the official project repository.

### Linux

On Ubuntu or a compatible Debian-based distribution:

1. Download the `.deb` package.
2. Open it with your software installer.
3. Install EasyTV.
4. Launch it from your applications menu.

Alternatively, install it from a terminal:

```bash
sudo apt install ./easytv_1.0.0_amd64.deb
```

## Using EasyTV

1. Start EasyTV.
2. Select the channel you want to watch.
3. The live stream opens in its own window.
4. Close the video window when you want to return to channel selection.

EasyTV can remain running in the system tray, so you can reopen the main window without restarting the application.

## Troubleshooting

**The stream does not start**

- Check your internet connection.
- Try another channel.
- Check whether the broadcaster's website is working.

**A channel displays a black screen or an error**

Some broadcasters use DRM protection or change their streaming services. Playback may temporarily stop working when their services change.

**The application starts but protected streams do not play**

Widevine components may need to be downloaded or initialized. Make sure EasyTV has internet access and try again.

## Project

- Source code: https://github.com/marcolino/easytv
- Releases: https://github.com/marcolino/easytv/releases

EasyTV is an independent desktop application. It does not host or provide the TV streams; streams are supplied by the respective broadcasters.
