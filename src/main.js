const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, components } = require('electron');
const path = require('node:path');
const channels = require('./channels');

let mainWindow = null;
let streamWindow = null;
let tray = null;
const appIcon = path.join(__dirname, '../assets/logos/easytv.png');

app.commandLine.appendSwitch(
  'autoplay-policy',
  'no-user-gesture-required'
);

function createMainWindow() {
  mainWindow = new BrowserWindow({
    //fullscreen: true,
    width: 1000,
    height: 666,
    minWidth: 700,
    minHeight: 500,
    title: 'EasyTV',
    icon: appIcon,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function hideCursor(window) {
  const script = `
    (() => {
      const style = document.createElement('style');
      style.textContent = '* { cursor: none !important; }';
      document.documentElement.appendChild(style);

      let timer;

      function showCursor() {
        style.textContent = '* { cursor: auto !important; }';
        clearTimeout(timer);
        timer = setTimeout(() => {
          style.textContent = '* { cursor: none !important; }';
        }, 2500);
      }

      document.addEventListener('mousemove', showCursor);
      document.addEventListener('keydown', showCursor);
    })();
  `;

  window.webContents.executeJavaScript(script).catch(() => {});
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
    /*
    if (input.type !== 'keyDown') return;
    console.log('KEY:', input.key, 'TYPE:', input.type);
    */

    console.log('KEY EVENT:', input.key, input.type, input.code);

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

      if (channel.id === 'tv8') {
        const activated = await currentWindow.webContents.executeJavaScript(`
          new Promise(resolve => {
            let attempts = 0;

            const checkPlayer = () => {
              const id = window.SkyPlayer?.getAllSessions?.()[0];
              const player = id && window.SkyPlayer[id];

              if (player?.setFullscreen && player.getState() === 'playing') {
                try {
                  player.setFullscreen(true);
                  resolve('fullscreen requested');
                  return;
                } catch (error) {
                  console.error('TV8 fullscreen error:', error);
                }
              }

              if (++attempts >= 120) {
                resolve('player not ready');
                return;
              }

              setTimeout(checkPlayer, 500);
            };

            checkPlayer();
          });
        `);

        console.log('TV8 fullscreen:', activated);
      }

      // NOVE: enable audio and fullscreen.
      if (channel.id === 'nove') {
        const activated = await currentWindow.webContents.executeJavaScript(`
          new Promise(resolve => {
            let attempts = 0;

            const checkPlayer = () => {
              const video = document.querySelector('video');
              const fullscreenButton = document.querySelector(
                '.vjs-fullscreen-control'
              );

              if (video && fullscreenButton && !video.paused) {
                video.muted = false;
                video.volume = 1;

                const player = videojs?.getPlayer?.(video.id);

                if (player) {
                  player.requestFullscreen();
                  resolve('audio enabled, fullscreen requested');
                  return;
                }

                fullscreenButton.click();
                resolve('audio enabled, fullscreen clicked');
                return;
              }

              if (++attempts >= 120) {
                resolve('player not ready');
                return;
              }

              setTimeout(checkPlayer, 500);
            };

            checkPlayer();
          });
        `);

        console.log('NOVE:', activated);
      }
      // NOVE: unmute the HTML video element.
      // if (channel.id === 'nove') {
      //   await new Promise(resolve => setTimeout(resolve, 1500));

      //   await currentWindow.webContents.executeJavaScript(`
      //     const video = document.querySelector('video');

      //     if (video) {
      //       video.muted = false;
      //       video.volume = 1;
      //     }
      //   `);
      // }
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

ipcMain.handle('open-channel', (event, channelId) => {
  openChannel(channelId);
});

app.whenReady().then(async () => {
  // console.log('Initializing Widevine components...');
  // console.log('APP NAME:', app.getName());
  // console.log('APP PATH:', app.getAppPath());
  // console.log('WINDOW ID:', mainWindow?.getNativeWindowHandle());

  try {
    await components.whenReady();
    // console.log('Widevine components ready:', components.status());
  } catch (error) {
    console.error('Widevine components error:', error, '-', 'status:', components.status());
  }

  createMainWindow();
  createTray();

  app.on('activate', () => {
    if (!mainWindow) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  // Keep EasyTV running in the system tray.
});

app.on('before-quit', () => {
  if (streamWindow && !streamWindow.isDestroyed()) {
    streamWindow.destroy();
  }
});
