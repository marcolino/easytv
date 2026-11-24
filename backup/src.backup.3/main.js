const {
  app, BrowserWindow, ipcMain, Tray, Menu,
  nativeImage, components, session, globalShortcut, dialog
} = require('electron');

const path = require('node:path');
const { execFile } = require('node:child_process');
const channels = require('./tvs.json');
const radios = require('./radios.json');
const { createPreferences } = require('./preferences');
const buildInfo = require('./build-info.json');
const appVersion = require('../package.json').version;

const appTitle = `EasyTV ${appVersion} · build ${buildInfo.build}`;
const appIcon = path.join(__dirname, '../assets/logos/easytv.png');

// The system tray is disabled unless explicitly enabled.
const trayEnabled = process.env.EASYTV_TRAY === '1';
const tvsetEnabled = process.env.TVSET === '1';
const preferences = createPreferences(app, channels, radios);
let settingsScreenOpen = false;

let mainWindow = null;
let streamWindow = null;
let tray = null;
let currentChannelId = null;

// Conventional TV-style numeric channel selection.
let channelDigits = '';
let channelTimer = null;

// The Escape shortcut belongs only to the focused streaming window.
let escapeShortcutOwner = null;

app.commandLine.appendSwitch(
  'autoplay-policy',
  'no-user-gesture-required'
);

// ------------------------------------------------------------
// Channel selection
// ------------------------------------------------------------

function cancelChannelNumber() {
  if (channelTimer) {
    clearTimeout(channelTimer);
    channelTimer = null;
  }

  channelDigits = '';
}

function handleChannelDigit(digit) {
  channelDigits += digit;

  if (channelTimer) {
    clearTimeout(channelTimer);
    channelTimer = null;
  }

  if (channelDigits.length >= 3) {
    selectNumberedChannel();
    return;
  }

  channelTimer = setTimeout(selectNumberedChannel, 1500);
}

function selectNumberedChannel() {
  if (channelTimer) {
    clearTimeout(channelTimer);
    channelTimer = null;
  }

  if (!channelDigits) return;

  const number = Number(channelDigits);
  channelDigits = '';

  const channel = channels.find(item => item.number === number);

  if (!channel) {
    console.log(`EasyTV: channel ${number} not available`);
    return;
  }

  openChannel(channel.id);
}

function changeChannel(direction) {
  const orderedChannels = channels
    .filter(channel => Number.isInteger(channel.number))
    .sort((a, b) => a.number - b.number);

  if (orderedChannels.length === 0) return;

  const currentIndex = orderedChannels.findIndex(
    channel => channel.id === currentChannelId
  );

  const nextIndex = currentIndex === -1
    ? (direction > 0 ? 0 : orderedChannels.length - 1)
    : (currentIndex + direction + orderedChannels.length)
      % orderedChannels.length;

  openChannel(orderedChannels[nextIndex].id);
}

// ------------------------------------------------------------
// Keyboard and IR remote commands
// ------------------------------------------------------------

function handleRemoteInput(event, input) {
  if (input.type !== 'keyDown') return false;
  if (settingsScreenOpen && BrowserWindow.getFocusedWindow() === mainWindow) return false;

  if (input.control || input.alt || input.meta || input.isAutoRepeat) {
    return false;
  }

  const key = input.key;

  // Numeric channel selection.
  if (/^[0-9]$/.test(key)) {
    event.preventDefault();
    handleChannelDigit(key);
    return true;
  }

  // Confirm numeric entry immediately.
  if ((key === 'Enter' || key === 'NumpadEnter') && channelDigits) {
    event.preventDefault();
    selectNumberedChannel();
    return true;
  }

  // Correct numeric entry.
  if (key === 'Backspace' && channelDigits) {
    event.preventDefault();

    channelDigits = channelDigits.slice(0, -1);

    if (channelTimer) {
      clearTimeout(channelTimer);
      channelTimer = null;
    }

    if (channelDigits) {
      channelTimer = setTimeout(selectNumberedChannel, 1500);
    }

    return true;
  }

  // Escape cancels pending numeric entry.
  if (key === 'Escape' && channelDigits) {
    event.preventDefault();
    cancelChannelNumber();
    return true;
  }

  // HOME: return to channel selection.
  if (key === 'Home') {
    event.preventDefault();
    cancelChannelNumber();

    if (streamWindow && !streamWindow.isDestroyed()) {
      streamWindow.close();
    } else if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }

    return true;
  }

  // Channel up.
  if (key === 'PageUp') {
    event.preventDefault();
    cancelChannelNumber();
    changeChannel(+1);
    return true;
  }

  // Channel down.
  if (key === 'PageDown') {
    event.preventDefault();
    cancelChannelNumber();
    changeChannel(-1);
    return true;
  }

  return false;
}

// ------------------------------------------------------------
// Main channel-selection window
// ------------------------------------------------------------

function createMainWindow() {
  settingsScreenOpen = false;
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 666,
    minWidth: 700,
    minHeight: 500,
    title: appTitle,
    fullscreen: true,
    icon: appIcon,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      partition: 'persist:easytv',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    if (handleRemoteInput(event, input)) return;

    if (input.key === 'F11') {
      event.preventDefault();
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    } else if (input.key === 'Escape' && !settingsScreenOpen && mainWindow.isFullScreen()) {
      event.preventDefault();
      mainWindow.setFullScreen(false);
    }
  });

  const notifyFullscreen = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(
        'main-fullscreen-changed',
        mainWindow.isFullScreen()
      );
    }
  };

  mainWindow.on('enter-full-screen', notifyFullscreen);
  mainWindow.on('leave-full-screen', notifyFullscreen);

  const startupWindow = mainWindow;
  startupWindow.loadFile(path.join(__dirname, 'renderer/index.html'));
  const saved = preferences.get().lastStation;
  if (saved?.type === 'tv' && channels.some(c => c.id === saved.id)) {
    startupWindow.webContents.once('did-finish-load', () => {
      if (!startupWindow.isDestroyed() && !streamWindow) openChannel(saved.id);
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ------------------------------------------------------------
// Cursor auto-hide
// ------------------------------------------------------------

function hideCursor(window) {
  const script = `
    (() => {
      if (window.__easyTVCursorInstalled) return;
      window.__easyTVCursorInstalled = true;

      const style = document.createElement('style');
      style.id = 'easytv-cursor-style';

      document.documentElement.appendChild(style);

      // Initially hidden; mouse activity shows the cursor
      // for approximately 2.5 seconds.
      let lastActivity = Date.now() - 3000;

      function updateCursor() {
        const hidden = Date.now() - lastActivity >= 2500;

        const css = hidden
          ? 'html, body, *, *::before, *::after { cursor: none !important; }'
          : 'html, body, *, *::before, *::after { cursor: auto !important; }';

        if (!style.isConnected) {
          document.documentElement.appendChild(style);
        }

        if (style.textContent !== css) {
          style.textContent = css;
        }
      }

      function onActivity(event) {
        if (!event.isTrusted) return;

        lastActivity = Date.now();
        updateCursor();
      }

      document.addEventListener('mousemove', onActivity, true);
      document.addEventListener('keydown', onActivity, true);
      document.addEventListener('pointermove', onActivity, true);

      updateCursor();

      setInterval(updateCursor, 250);
    })();
  `;

  window.webContents.executeJavaScript(script).catch(console.error);
}

// ------------------------------------------------------------
// Mediaset audio recovery
// ------------------------------------------------------------

function recoverMediasetAudio(window) {
  const script = `
    (() => {
      if (window.__easyTVAudioRecoveryInstalled) return;
      window.__easyTVAudioRecoveryInstalled = true;

      const recoveryTimers = new WeakMap();

      function recover(video) {
        if (video.paused || video.ended) return;

        if (video.muted || video.volume === 0) {
          video.muted = false;
          video.volume = 1;

          console.log('EasyTV: Mediaset audio recovered');
        }
      }

      function scheduleRecovery(video) {
        if (recoveryTimers.has(video)) return;

        const timer = setTimeout(() => {
          recoveryTimers.delete(video);
          recover(video);
        }, 1500);

        recoveryTimers.set(video, timer);
      }

      setInterval(() => {
        for (const video of document.querySelectorAll('video')) {
          if (!video.paused && !video.ended) {
            scheduleRecovery(video);
          }
        }
      }, 500);
    })();
  `;

  window.webContents.executeJavaScript(script).catch(console.error);
}

// ------------------------------------------------------------
// Mediaset fullscreen layout (CSS, no player-button clicking)
// ------------------------------------------------------------

function installMediasetFullscreen(window) {
  const script = `
    (() => {
      if (window.__easyTVMediasetFullscreen) return;
      window.__easyTVMediasetFullscreen = true;

      const style = document.createElement('style');
      style.id = 'easytv-mediaset-fullscreen';

      style.textContent = \`
        html, body {
          margin: 0 !important;
          width: 100% !important;
          height: 100% !important;
          overflow: hidden !important;
          background: black !important;
        }

        .persistent-video-player {
          position: fixed !important;
          inset: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          z-index: 2147483647 !important;
          background: black !important;
        }

        .persistent-video-player video {
          width: 100% !important;
          height: 100% !important;
          object-fit: contain !important;
        }
      \`;

      document.documentElement.appendChild(style);
    })();
  `;

  window.webContents.executeJavaScript(script).catch(console.error);
}

// ------------------------------------------------------------
// Escape shortcut for streaming windows
// ------------------------------------------------------------

function disableStreamEscapeShortcut(window) {
  if (escapeShortcutOwner !== window) return;

  globalShortcut.unregister('Escape');
  escapeShortcutOwner = null;
}

function enableStreamEscapeShortcut(window) {
  if (window.isDestroyed()) return;
  if (escapeShortcutOwner === window) return;

  if (escapeShortcutOwner) {
    disableStreamEscapeShortcut(escapeShortcutOwner);
  }

  const registered = globalShortcut.register('Escape', () => {
    if (window.isDestroyed()) return;
    if (BrowserWindow.getFocusedWindow() !== window) return;

    if (channelDigits) {
      cancelChannelNumber();
      return;
    }

    console.log('EasyTV: Escape closes streaming');
    window.close();
  });

  if (registered) {
    escapeShortcutOwner = window;
  } else {
    console.warn('EasyTV: could not register Escape shortcut');
  }
}

// ------------------------------------------------------------
// Streaming window
// ------------------------------------------------------------

function openChannel(channelId) {
  const channel = channels.find(item => item.id === channelId);
  if (!channel) return;
  try { preferences.remember('tv', channel.id); }
  catch (error) { console.error('EasyTV: unable to remember channel:', error); }

  const previousWindow =
    streamWindow && !streamWindow.isDestroyed()
      ? streamWindow
      : null;

  currentChannelId = channel.id;

  // Register the replacement before closing the previous stream.
  streamWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: `EasyTV - ${channel.name}`,
    autoHideMenuBar: true,
    fullscreen: true,
    webPreferences: {
      partition: 'persist:easytv',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const currentWindow = streamWindow;

  currentWindow.on('focus', () => {
    enableStreamEscapeShortcut(currentWindow);
  });

  currentWindow.on('blur', () => {
    disableStreamEscapeShortcut(currentWindow);
  });

  if (previousWindow) {
    previousWindow.close();
    currentWindow.focus();
  }

  currentWindow.webContents.setAudioMuted(false);

  currentWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    if (handleRemoteInput(event, input)) return;

    // Close streaming even when the broadcaster uses DOM fullscreen.
    if (input.key === 'Escape') {
      event.preventDefault();

      if (!currentWindow.isDestroyed()) {
        currentWindow.close();
      }

      return;
    }

    // Developer tools.
    if (
      input.key === 'F12' ||
      (input.control && input.shift &&
       input.key.toLowerCase() === 'i')
    ) {
      event.preventDefault();
      currentWindow.webContents.toggleDevTools();
    }
  });

  currentWindow.webContents.on('dom-ready', async () => {
    if (currentWindow.isDestroyed()) return;

    currentWindow.webContents.setAudioMuted(false);
    hideCursor(currentWindow);

    if (channel.group === 'MEDIASET') {
      installMediasetFullscreen(currentWindow);
      recoverMediasetAudio(currentWindow);
    }

    try {
      // RaiPlay: start playback.
      if (channel.group === 'RAI') {
        await currentWindow.webContents.executeJavaScript(`
          document.querySelector('.play-over-video')?.click();
        `);
      }

      // LA7: click the fake overlay to start playback.
      if (channel.id === 'la7') {
        await new Promise(resolve => setTimeout(resolve, 1500));

        if (currentWindow.isDestroyed()) return;

        await currentWindow.webContents.executeJavaScript(`
          document.querySelector(
            '#player_tgla7_fake .fake.container-icon'
          )?.click();
        `);
      }

      // TV8: maintain fullscreen, including after advertisements.
      if (channel.id === 'tv8') {
        const activated = await currentWindow.webContents.executeJavaScript(`
          (() => {
            if (window.__easyTV8Supervisor) {
              return 'fullscreen supervisor already installed';
            }

            let lastPlayer = null;
            let lastAttempt = 0;
            let restoring = false;

            function getPlayer() {
              const id = window.SkyPlayer?.getAllSessions?.()[0];
              return id ? window.SkyPlayer[id] : null;
            }

            function restoreFullscreen(player) {
              if (!player || restoring) return;

              const now = Date.now();

              if (now - lastAttempt < 2000) return;

              try {
                if (player.getState?.() !== 'playing') return;

                if (player.getFullscreen?.()) return;

                lastAttempt = now;
                restoring = true;

                console.log('TV8: requesting fullscreen');

                const result = player.setFullscreen(true);

                Promise.resolve(result)
                  .catch(error => {
                    console.warn('TV8 fullscreen error:', error);
                  })
                  .finally(() => {
                    restoring = false;
                  });

              } catch (error) {
                restoring = false;
                console.warn('TV8 fullscreen exception:', error);
              }
            }

            function checkPlayer() {
              const player = getPlayer();
              if (!player) return;

              if (player !== lastPlayer) {
                console.log('TV8: player instance detected/changed');
                lastPlayer = player;

                if (player.on && player.Events?.AD_BREAK_END) {
                  player.on(player.Events.AD_BREAK_END, () => {
                    console.log('TV8: advertisement break ended');

                    setTimeout(() => {
                      restoreFullscreen(getPlayer());
                    }, 1000);
                  });
                }
              }

              restoreFullscreen(player);
            }

            const timer = setInterval(checkPlayer, 1000);

            window.__easyTV8Supervisor = {
              timer,
              checkPlayer
            };

            checkPlayer();

            return 'TV8 fullscreen supervisor installed';
          })();
        `);

        console.log('TV8:', activated);
      }

      // NOVE: enable audio and maintain fullscreen.
      if (channel.id === 'nove') {
        const activated = await currentWindow.webContents.executeJavaScript(`
          (() => {
            if (window.__easyNoveSupervisor) {
              return 'NOVE supervisor already installed';
            }

            let lastAttempt = 0;
            let busy = false;

            async function checkPlayer() {
              const video = document.querySelector('video');

              const player = video &&
                window.videojs?.getPlayer?.(video.id);

              if (!video || !player) return;

              if (video.muted) video.muted = false;
              if (video.volume !== 1) video.volume = 1;

              if (video.paused || video.readyState < 2) return;

              if (player.isFullscreen?.()) return;

              if (busy || Date.now() - lastAttempt < 3000) return;

              lastAttempt = Date.now();
              busy = true;

              try {
                console.log('NOVE: requesting fullscreen');

                await player.requestFullscreen();

                await new Promise(resolve => setTimeout(resolve, 500));

                console.log(
                  'NOVE fullscreen:',
                  player.isFullscreen()
                );
              } catch (error) {
                console.warn(
                  'NOVE fullscreen failed:',
                  error.message
                );
              } finally {
                busy = false;
              }
            }

            const timer = setInterval(checkPlayer, 1000);

            window.__easyNoveSupervisor = {
              timer,
              checkPlayer
            };

            checkPlayer();

            return 'NOVE supervisor installed';
          })();
        `);

        console.log('NOVE:', activated);
      }

    } catch (error) {
      console.error('EasyTV autoplay/fullscreen error:', error);
    }
  });

  currentWindow.on('closed', () => {
    disableStreamEscapeShortcut(currentWindow);

    // Ignore closure of a stream replaced by another channel.
    if (streamWindow !== currentWindow) return;

    streamWindow = null;
    currentChannelId = null;

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  if (currentWindow.isFocused()) {
    enableStreamEscapeShortcut(currentWindow);
  }

  currentWindow.loadURL(channel.url);
}

// ------------------------------------------------------------
// Optional system tray
// ------------------------------------------------------------

function createTray() {
  const icon = nativeImage.createFromPath(appIcon);

  tray = new Tray(icon);
  tray.setToolTip('EasyTV');

  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Apri EasyTV',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createMainWindow();
        }
      }
    },
    {
      label: 'Chiudi streaming',
      click: () => {
        if (streamWindow && !streamWindow.isDestroyed()) {
          streamWindow.close();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Esci',
      click: () => app.quit()
    }
  ]));

  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createMainWindow();
    }
  });
}

// ------------------------------------------------------------
// Settings and deliberate power-off
// ------------------------------------------------------------

async function requestPowerOff() {
  if (!tvsetEnabled) {
    app.quit();
    return { action: 'quit' };
  }
  if (process.platform !== 'linux') {
    return { action: 'unsupported', message: 'TVSET shutdown is supported on Linux only.' };
  }
  const answer = dialog.showMessageBoxSync(mainWindow, {
    type: 'warning', title: 'Spegnere il dispositivo?',
    message: 'Vuoi spegnere il dispositivo?',
    detail: 'EasyTV verrà chiuso e il computer sarà spento.',
    buttons: ['Annulla', 'Spegni'], defaultId: 0, cancelId: 0, noLink: true
  });
  if (answer !== 1) return { action: 'cancelled' };
  execFile('systemctl', ['poweroff'], { timeout: 10000 }, error => {
    if (error) {
      console.error('EasyTV: shutdown failed:', error);
      dialog.showErrorBox('EasyTV', 'Spegnimento non riuscito: ' + error.message);
    }
  });
  return { action: 'shutdown-requested' };
}

// ------------------------------------------------------------
// IPC
// ------------------------------------------------------------

ipcMain.handle('get-channels', () => channels);

ipcMain.handle('get-app-info', () => ({
  version: appVersion,
  build: buildInfo.build,
  fullscreen: mainWindow?.isFullScreen() ?? false,
  tvset: tvsetEnabled
}));

ipcMain.handle('get-preferences', () => preferences.get());
ipcMain.handle('save-preferences', (_event, data) => preferences.update(data));
ipcMain.handle('request-power-off', () => requestPowerOff());
ipcMain.on('settings-screen-state', (event, isOpen) => {
  if (mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents) {
    settingsScreenOpen = isOpen === true;
  }
});

ipcMain.handle('open-channel', (event, channelId) => {
  openChannel(channelId);
});

// ------------------------------------------------------------
// Application lifecycle
// ------------------------------------------------------------

app.whenReady().then(async () => {
  try {
    await components.whenReady();
  } catch (error) {
    console.error(
      'Widevine components error:',
      error,
      '- status:',
      components.status()
    );
  }

  // Block unwanted screen-sharing requests.
  const ses = session.fromPartition('persist:easytv');

  ses.setDisplayMediaRequestHandler((request, callback) => {
    console.warn(
      'EasyTV: screen-sharing request blocked:',
      request.securityOrigin
    );

    callback({});
  });

  createMainWindow();

  if (trayEnabled) {
    createTray();
  }

  app.on('activate', () => {
    if (!mainWindow) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (!trayEnabled) {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (streamWindow && !streamWindow.isDestroyed()) {
    streamWindow.destroy();
  }
});
