const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, components, session } = require('electron');
const path = require('node:path');
const channels = require('./channels');
const buildInfo = require('./build-info.json');
const appVersion = require('../package.json').version;
const appTitle = `EasyTV ${appVersion} · build ${buildInfo.build}`;

let mainWindow = null;
let streamWindow = null;
let tray = null;
const appIcon = path.join(__dirname, '../assets/logos/easytv.png');

// Enable the system tray only when explicitly requested.
const trayEnabled = process.env.EASYTV_TRAY === '1';

app.commandLine.appendSwitch(
  'autoplay-policy',
  'no-user-gesture-required'
);

// Conventional TV channel selection: 1, 12, 48, 51, etc.
let channelDigits = '';
let channelTimer = null;

function handleChannelDigit(digit) {
  channelDigits += digit;

  if (channelTimer) {
    clearTimeout(channelTimer);
  }

  // Maximum three digits.
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

function cancelChannelNumber() {
  if (channelTimer) {
    clearTimeout(channelTimer);
    channelTimer = null;
  }

  channelDigits = '';
}

function handleChannelKeyboard(event, input, isStreaming = false) {
  if (input.type !== 'keyDown') return false;

  // Ignore modifier combinations and auto-repeat.
  if (input.control || input.alt || input.meta || input.isAutoRepeat) {
    return false;
  }

  const key = input.key;

  if (/^[0-9]$/.test(key)) {
    event.preventDefault();
    handleChannelDigit(key);
    return true;
  }

  if (key === 'Enter' && channelDigits) {
    event.preventDefault();
    selectNumberedChannel();
    return true;
  }

  if (key === 'Backspace' && channelDigits) {
    event.preventDefault();
    channelDigits = channelDigits.slice(0, -1);

    if (channelTimer) clearTimeout(channelTimer);

    channelTimer = channelDigits
      ? setTimeout(selectNumberedChannel, 1500)
      : null;

    return true;
  }

  if (key === 'Escape' && channelDigits) {
    event.preventDefault();
    cancelChannelNumber();
    return true;
  }

  return false;
}

function createMainWindow() {
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

    if (handleChannelKeyboard(event, input)) return;

    if (input.key === 'F11') {
      event.preventDefault();
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    } else if (input.key === 'Escape' && mainWindow.isFullScreen()) {
      event.preventDefault();
      mainWindow.setFullScreen(false);
    }
  });

  const notifyFullscreen = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('main-fullscreen-changed', mainWindow.isFullScreen());
    }
  };
  mainWindow.on('enter-full-screen', notifyFullscreen);
  mainWindow.on('leave-full-screen', notifyFullscreen);

  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function hideCursor(window) {
  const script = `
    (() => {
      if (window.__easyTVCursorInstalled) return;
      window.__easyTVCursorInstalled = true;

      const style = document.createElement('style');
      style.id = 'easytv-cursor-style';

      document.documentElement.appendChild(style);

      // Initially hidden; real activity shows the cursor for 2.5 seconds.
      let lastActivity = Date.now() - 3000;

      function updateCursor() {
        const hidden = Date.now() - lastActivity >= 2500;

        const css = hidden
          ? 'html, body, *, *::before, *::after { cursor: none !important; }'
          : 'html, body, *, *::before, *::after { cursor: auto !important; }';

        // Reattach if the player replaced the document head.
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

function openChannel(channelId) {
  const channel = channels.find(item => item.id === channelId);
  if (!channel) return;

  if (streamWindow && !streamWindow.isDestroyed()) {
    streamWindow.close();
  }

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


  currentWindow.webContents.setAudioMuted(false);

  currentWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape') {
      event.preventDefault();
      currentWindow.close();
      return;
    }

    if (input.key === 'F12' ||
        (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      event.preventDefault();
      currentWindow.webContents.toggleDevTools();
    }
  });

  currentWindow.webContents.on('dom-ready', async () => {
    if (currentWindow.isDestroyed()) return;

    currentWindow.webContents.setAudioMuted(false);
    hideCursor(currentWindow);

    try {
      // RaiPlay: start playback.
      if (channel.group === 'RAI') {
        await currentWindow.webContents.executeJavaScript(`
          document.querySelector('.play-over-video')?.click();
        `);
      }

      // Mediaset: wait for playback and activate fullscreen.
      if (channel.group === 'MEDIASET') {
        const activated = await currentWindow.webContents.executeJavaScript(`
          new Promise(resolve => {
            let attempts = 0;

            const checkPlayer = () => {
              if (document.fullscreenElement) {
                resolve('already fullscreen');
                return;
              }

              const video = [...document.querySelectorAll('video')]
                .find(v => !v.paused && v.readyState >= 2);

              const buttons = document.querySelectorAll(
                '.persistent-video-player footer button'
              );

              const button = buttons[buttons.length - 1];

              if (video && button) {
                const rect = button.getBoundingClientRect();

                if (rect.width > 0 && rect.height > 0) {
                  button.click();

                  setTimeout(() => {
                    if (document.fullscreenElement) {
                      resolve('fullscreen activated');
                    } else if (++attempts >= 120) {
                      resolve('fullscreen activation failed');
                    } else {
                      checkPlayer();
                    }
                  }, 500);

                  return;
                }
              }

              if (++attempts >= 120) {
                resolve('player or fullscreen button not ready');
                return;
              }

              setTimeout(checkPlayer, 500);
            };

            checkPlayer();
          });
        `);

        console.log('Mediaset fullscreen:', activated);
      }

      // LA7: click the fake overlay to start playback.
      if (channel.id === 'la7') {
        await new Promise(resolve => setTimeout(resolve, 1500));

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
            // Avoid installing multiple supervisors.
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

              // Avoid repeated fullscreen requests.
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

                // Register listener on each new player instance.
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

            // Monitor player changes and fullscreen state.
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

              // Enable audio.
              if (video.muted) video.muted = false;
              if (video.volume !== 1) video.volume = 1;

              // Wait until actual playback.
              if (video.paused || video.readyState < 2) return;

              // Already fullscreen.
              if (player.isFullscreen?.()) return;

              if (busy || Date.now() - lastAttempt < 3000) return;

              lastAttempt = Date.now();
              busy = true;

              try {
                console.log('NOVE: requesting fullscreen');

                await player.requestFullscreen();

                await new Promise(resolve => setTimeout(resolve, 500));

                console.log('NOVE fullscreen:', player.isFullscreen());
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
    if (streamWindow === currentWindow) {
      streamWindow = null;
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  currentWindow.loadURL(channel.url);
}

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

ipcMain.handle('get-channels', () => channels);
ipcMain.handle('get-app-info', () => ({
  version: appVersion,
  build: buildInfo.build,
  fullscreen: mainWindow?.isFullScreen() ?? false
}));

ipcMain.handle('open-channel', (event, channelId) => {
  openChannel(channelId);
});

app.whenReady().then(async () => {
  try {
    await components.whenReady();
  } catch (error) {
    console.error('Widevine components error:', error, '-', 'status:', components.status());
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
  // Keep EasyTV running in the system tray, if enabled.
  if (!trayEnabled) {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (streamWindow && !streamWindow.isDestroyed()) {
    streamWindow.destroy();
  }
});
