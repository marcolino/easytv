const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, components, session, globalShortcut, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

// Isolate development preferences and browser sessions from installed builds.
if (!app.isPackaged) {
  const devData = path.join(app.getPath('appData'), 'easytv-dev');
  fs.mkdirSync(devData, { recursive: true });
  app.setPath('userData', devData);
  app.setPath('sessionData', devData);
}

const tvCatalogue = require('./tv-catalogue').createTVCatalogue(app, [...require('./config/tvs.json'), ...require('./config/services.json')]);
const channels = tvCatalogue.channels;
const { createRadioCatalogue } = require('./radio-browser');
const radioCatalogue = createRadioCatalogue(app, require('./config/radios.json'));
const radios = radioCatalogue.radios;
const { dictionaries, languages, resolveLanguage, translate } = require('./i18n');
const { createPreferences } = require('./preferences');
const buildInfo = require('./config/build-info.json');
const appVersion = require('../package.json').version;
const appTitle = `EasyTV ${appVersion} · build ${buildInfo.build}`;
const appIcon = path.join(__dirname, '../assets/logos/easytv.png');
// The system tray is disabled unless explicitly enabled.
const trayEnabled = process.env.EASYTV_TRAY === '1';
const preferences = createPreferences(app, channels, radios);
let settingsScreenOpen = false;
let previewLanguage = null;

function systemLanguages() {
  return app.getPreferredSystemLanguages();
}

function t(key, values) {
  return translate(resolveLanguage(previewLanguage || preferences.get().language, systemLanguages()), key, values);
}
let mainWindow = null;
let streamWindow = null;
let tray = null;
let currentChannelId = null;
let currentRadioId = null;
let lastSelection = null;
let previousSelection = null;

function rememberSelection(type, id) {
  if (lastSelection?.type === type && lastSelection.id === id)
    return;
  previousSelection = lastSelection;
  lastSelection = { type, id };
}

function showChannelDigits() {
  const win = BrowserWindow.getFocusedWindow() || streamWindow || mainWindow;
  if (!win || win.isDestroyed())
    return;
  win.webContents.executeJavaScript(`(() => {
    const host = document.fullscreenElement || document.body;
    if (!host || /^(VIDEO|IFRAME)$/.test(host.tagName)) return;
    let osd = document.getElementById('easytv-number-osd');
    if (!osd) {
      osd = document.createElement('div');
      osd.id = 'easytv-number-osd';
      Object.assign(osd.style, { position: 'fixed', left: '4vw', bottom: '4vh', zIndex: '2147483647', background: 'rgba(255,255,255,.75)', color: '#111', padding: '.15em .4em', borderRadius: '8px', font: 'bold 8vh system-ui', pointerEvents: 'none', transition: 'opacity 100ms' });
    }
    host.appendChild(osd);
    const digits = ${JSON.stringify(channelDigits)};
    if (digits) osd.textContent = digits;
    osd.style.opacity = digits ? '1' : '0';
  })()`).catch(() => {});
}

// Conventional TV-style numeric channel selection.
let channelDigits = '';
let channelTimer = null;
// The Escape shortcut belongs only to the focused streaming window.
let escapeShortcutOwner = null;
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// ------------------------------------------------------------
// Channel selection
// ------------------------------------------------------------
function cancelChannelNumber() {
  if (channelTimer) {
    clearTimeout(channelTimer);
    channelTimer = null;
  }
  channelDigits = '';
  showChannelDigits();
}

function handleChannelDigit(digit) {
  channelDigits += digit;
  showChannelDigits();
  if (channelTimer) {
    clearTimeout(channelTimer);
    channelTimer = null;
  }
  if (channelDigits.length >= 4) {
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
  if (!channelDigits)
    return;
  const number = Number(channelDigits);
  channelDigits = '';
  showChannelDigits();
  const channel = channels.find(item => item.number != null && String(item.number).trim() !== "" && Number(item.number) === number);
  if (channel)
    openChannel(channel.id);
  else {
    const radio = radios.find(item => item.number != null && String(item.number).trim() !== "" && Number(item.number) === number);
    if (radio)
      openRadio(radio.id);
  }
}

function changeChannel(direction) {
  const orderedChannels = channels
    .filter(channel => Number.isInteger(channel.number))
    .sort((a, b) => a.number - b.number);
  if (orderedChannels.length === 0)
    return;
  const currentIndex = orderedChannels.findIndex(channel => channel.id === currentChannelId);
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
  if (input.type !== 'keyDown')
    return false;
  if (settingsScreenOpen && BrowserWindow.getFocusedWindow() === mainWindow)
    return false;
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
    showChannelDigits();
    if (channelTimer) {
      clearTimeout(channelTimer);
      channelTimer = null;
    }
    if (channelDigits) {
      channelTimer = setTimeout(selectNumberedChannel, 1500);
    }
    return true;
  }
  if (key === 'Backspace' && previousSelection) {
    event.preventDefault();
    const target = previousSelection;
    if (target.type === 'radio') openRadio(target.id);
    else openChannel(target.id);
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
    }
    else if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
    return true;
  }
  // Channel up.
  if (key === 'PageUp') {
    event.preventDefault();
    cancelChannelNumber();
    currentRadioId ? changeRadio(+1) : changeChannel(+1);
    return true;
  }
  // Channel down.
  if (key === 'PageDown') {
    event.preventDefault();
    cancelChannelNumber();
    currentRadioId ? changeRadio(-1) : changeChannel(-1);
    return true;
  }
  return false;
}
// ------------------------------------------------------------
// Main channel-selection window
// ------------------------------------------------------------
function handleAppShortcut(event, input, streaming = false, interactiveWeb = false) {
  if (!['F2', 'F10'].includes(input.key))
    return false;
  if (input.control || input.alt || input.meta || input.shift)
    return false;
  event.preventDefault();
  if (input.type !== 'keyDown' || input.isAutoRepeat)
    return true;
  cancelChannelNumber();
  if (input.key === 'F10' && !interactiveWeb) {
    app.quit();
  }
  else {
    if (streaming && streamWindow && !streamWindow.isDestroyed())
      streamWindow.close();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
      if (input.key === 'F2') mainWindow.webContents.send('settings-shortcut');
    }
  }
  return true;
}

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
    if (handleAppShortcut(event, input))
      return;
    if (input.type !== 'keyDown')
      return;
    if (handleRemoteInput(event, input))
      return;
    if (input.key === 'F11') {
      event.preventDefault();
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
    else if (input.key === 'Escape' && !settingsScreenOpen && mainWindow.isFullScreen()) {
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
  const startupWindow = mainWindow;
  startupWindow.loadFile(path.join(__dirname, 'renderer/index.html'));
  const saved = preferences.get().lastStation;
  if (saved && (saved.type === 'tv' ? channels : radios).some(c => c.id === saved.id)) {
    startupWindow.webContents.once('did-finish-load', () => {
      if (!startupWindow.isDestroyed() && !streamWindow)
        (saved.type === 'radio' ? openRadio(saved.id) : openChannel(saved.id));
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
  if (escapeShortcutOwner !== window)
    return;
  globalShortcut.unregister('Escape');
  escapeShortcutOwner = null;
}

function enableStreamEscapeShortcut(window) {
  if (window.isDestroyed())
    return;
  if (escapeShortcutOwner === window)
    return;
  if (escapeShortcutOwner) {
    disableStreamEscapeShortcut(escapeShortcutOwner);
  }
  const registered = globalShortcut.register('Escape', () => {
    if (window.isDestroyed())
      return;
    if (BrowserWindow.getFocusedWindow() !== window)
      return;
    if (channelDigits) {
      cancelChannelNumber();
      return;
    }
    window.close();
  });
  if (registered) {
    escapeShortcutOwner = window;
  }
  else {
    console.warn('EasyTV: could not register Escape shortcut');
  }
}
// ------------------------------------------------------------
// Streaming window
// ------------------------------------------------------------
function changeRadio(direction) {
  const ids = preferences.get().favorites.radio.filter(id => radios.some(r => r.id === id));
  if (!ids.length)
    return;
  const index = ids.indexOf(currentRadioId);
  openRadio(ids[index < 0 ? (direction > 0 ? 0 : ids.length - 1) : (index + direction + ids.length) % ids.length]);
}

function openRadio(id, preview = false) {
  const station = radios.find(r => r.id === id);
  if (!station)
    return;
  if (!preview)
    try {
      preferences.remember('radio', id);
      rememberSelection('radio', id);
    }
    catch (e) {
      console.error(e);
    }
  const previous = streamWindow;
  const win = new BrowserWindow({ fullscreen: true, autoHideMenuBar: true, title: station.name, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  streamWindow = win;
  currentRadioId = id;
  currentChannelId = null;
  if (previous && !previous.isDestroyed())
    previous.close();
  win.webContents.on('before-input-event', (event, input) => {
    if (handleAppShortcut(event, input, true))
      return;
    if (input.type !== 'keyDown')
      return;
    if (handleRemoteInput(event, input))
      return;
    if (input.key === 'Escape') {
      event.preventDefault();
      win.close();
    }
  });
  win.on('closed', () => {
    if (streamWindow !== win)
      return;
    streamWindow = null;
    currentRadioId = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
  win.loadFile(path.join(__dirname, 'renderer/radio.html'));
}

function openChannel(channelId, forceWeb = false, preview = false) {
  const channel = channels.find(item => item.id === channelId);
  if (!channel)
    return;
  if (!preview)
    try {
      preferences.remember('tv', channel.id);
      rememberSelection('tv', channel.id);
    }
    catch (error) {
      console.error('EasyTV: unable to remember channel:', error);
    }
  const mode = preferences.get().tvPlayback?.[channel.id] || (channel.directUrl ? 'direct' : 'web');
  if (channel.directUrl && (preview || !channel.url || (!forceWeb && mode !== 'web')))
    return openDirectTV(channel, preview || !channel.url ? 'direct' : mode);
  if (!channel.url)
    return;
  const previousWindow = streamWindow && !streamWindow.isDestroyed()
    ? streamWindow
    : null;
  currentRadioId = null;
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
  // Non-broadcast web pages must retain normal browser keyboard input.
  const host = new URL(channel.url).hostname;
  const interactiveWeb = Boolean(channel.service || channel.source) && !/(^|\.)raiplay\.it$/i.test(host) && !channel.directUrl;
  cancelChannelNumber();
  currentWindow.on('focus', () => {
    if (!interactiveWeb) enableStreamEscapeShortcut(currentWindow);
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
    if (handleAppShortcut(event, input, true, interactiveWeb))
      return;
    if (input.type !== 'keyDown')
      return;
    if (interactiveWeb) return;
    if (handleRemoteInput(event, input))
      return;
    // Close streaming even when the broadcaster uses DOM fullscreen.
    if (input.key === 'Escape') {
      event.preventDefault();
      if (!currentWindow.isDestroyed()) {
        currentWindow.close();
      }
      return;
    }
    // Developer tools.
    if (input.key === 'F12' ||
      (input.control && input.shift &&
        input.key.toLowerCase() === 'i')) {
      event.preventDefault();
      currentWindow.webContents.toggleDevTools();
    }
  });
  currentWindow.webContents.on('dom-ready', async () => {
    if (currentWindow.isDestroyed())
      return;
    currentWindow.webContents.setAudioMuted(false);
    if (!interactiveWeb) hideCursor(currentWindow);
    if (channel.group === 'MEDIASET') {
      installMediasetFullscreen(currentWindow);
      recoverMediasetAudio(currentWindow);
    }
    try {
      // RaiPlay: start playback.
      if (new URL(channel.url).pathname.replace(/\/$/, '') === '/dirette/raistoria' && /(^|\.)raiplay\.it$/.test(host)) {
        // Use the actual visible play control, as with a manual mouse click.
        const wc = currentWindow.webContents;
        for (let attempt = 0; attempt < 12; attempt++) {
          await new Promise(resolve => setTimeout(resolve, attempt ? 3000 : 1800));
          if (currentWindow.isDestroyed() || streamWindow !== currentWindow) break;
          const point = await wc.executeJavaScript(`(() => {
            if ([...document.querySelectorAll('video')].some(v => !v.paused && !v.ended)) return { playing: true };
            const a = document.querySelector('a[data-play-button][data-video-json="/dirette/raistoria.json"]');
            const el = a?.querySelector('.play-over-video') || a;
            if (!el) return null;
            const r = el.getBoundingClientRect();
            const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
            if (!r.width || !r.height || !a.contains(document.elementFromPoint(x, y))) return null;
            return { x, y };
          })()`);
          if (point?.playing) break;
          if (!point) continue;
          wc.sendInputEvent({ type: 'mouseMove', x: point.x, y: point.y });
          wc.sendInputEvent({ type: 'mouseDown', x: point.x, y: point.y, button: 'left', clickCount: 1 });
          wc.sendInputEvent({ type: 'mouseUp', x: point.x, y: point.y, button: 'left', clickCount: 1 });
          break;
        }
      }
      else if (channel.group === 'RAI' || new URL(channel.url).hostname === 'www.raiplay.it') {
        await currentWindow.webContents.executeJavaScript(`
          (() => {
            // RaiPlay may render its play overlay after DOM ready.
            if (window.__easyRaiPlayStart) return;
            window.__easyRaiPlayStart = true;
            const deadline = Date.now() + 45000;
            let lastClick = 0;
            let attempts = 0;
            function tryStart() {
              const videos = [...document.querySelectorAll('video')];
              if (videos.some(v => !v.paused && !v.ended)) return true;
              if (Date.now() >= deadline || attempts >= 6) return true;
              const liveButton = document.querySelector('a[data-play-button][data-video-json="' + location.pathname.replace(new RegExp('/$'), '') + '.json"]');
              const button = (liveButton?.getClientRects().length ? liveButton : null) || [...document.querySelectorAll('.play-over-video, button[aria-label], button[title], [role=button][aria-label]')].find(el => {
                if (!el.getClientRects().length || el.disabled) return false;
                return el.matches('.play-over-video') || /^(play|riproduci|avvia riproduzione)$/i.test((el.getAttribute('aria-label') || el.title || '').trim());
              });
              if (button && button.getClientRects().length && Date.now() - lastClick >= 4000) {
                lastClick = Date.now();
                attempts++;
                button.click();
              }
              return false;
            }
            if (!tryStart()) {
              const timer = setInterval(() => {
                if (tryStart()) clearInterval(timer);
              }, 250);
              window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
            }
          })();
        `);
      }
      // LA7: click the fake overlay to start playback.
      if (channel.id === 'la7') {
        await new Promise(resolve => setTimeout(resolve, 1500));
        if (currentWindow.isDestroyed())
          return;
        await currentWindow.webContents.executeJavaScript(`
          document.querySelector(
            '#player_tgla7_fake .fake.container-icon'
          )?.click();
        `);
      }
      // TV8: maintain fullscreen, including after advertisements.
      if (channel.id === 'tv8') {
        await currentWindow.webContents.executeJavaScript(`
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


                lastPlayer = player;

                if (player.on && player.Events?.AD_BREAK_END) {
                  player.on(player.Events.AD_BREAK_END, () => {


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
      }
      // NOVE: enable audio and maintain fullscreen.
      if (channel.id === 'nove') {
        await currentWindow.webContents.executeJavaScript(`
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


                await player.requestFullscreen();

                await new Promise(resolve => setTimeout(resolve, 500));
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
      }
    }
    catch (error) {
      console.error('EasyTV autoplay/fullscreen error:', error);
    }
  });
  currentWindow.on('closed', () => {
    disableStreamEscapeShortcut(currentWindow);
    // Ignore closure of a stream replaced by another channel.
    if (streamWindow !== currentWindow)
      return;
    streamWindow = null;
    currentChannelId = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
  if (currentWindow.isFocused()) {
    if (!interactiveWeb) enableStreamEscapeShortcut(currentWindow);
  }
  // One banner per channel selection; do not repeat it on automatic fallback.
  if (!forceWeb && !interactiveWeb)
    currentWindow.webContents.once('did-finish-load', () => {
      if (currentWindow.isDestroyed() || streamWindow !== currentWindow)
        return;
      currentWindow.webContents.executeJavaScript(`(() => {
      const name = ${JSON.stringify(channel.name)};
      const started = Date.now();
      const timer = setInterval(() => {
        const videos = [...document.querySelectorAll('video')];
        if (!videos.some(v => !v.paused && v.readyState >= 2) && Date.now() - started < 10000) return;
        clearInterval(timer);
        const host = document.fullscreenElement || document.body;
        if (!host || /^(VIDEO|IFRAME)$/.test(host.tagName)) return;
        const banner = document.createElement('div');
        banner.textContent = name;
        Object.assign(banner.style, {position:'fixed', inset:'0', display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none', zIndex:'2147483647', color:'#f8ffba', fontFamily:'Arial Rounded MT Bold, Trebuchet MS, system-ui, sans-serif', fontWeight:'800', fontSize:'46vh', lineHeight:'1', whiteSpace:'nowrap', opacity:'0.7', textShadow:'0 2px 12px #0005', transition:'opacity .5s'});
        host.appendChild(banner);
        const range = document.createRange(); range.selectNodeContents(banner);
        const width = range.getBoundingClientRect().width;
        if (width > innerWidth * .92) banner.style.fontSize = (innerHeight * .46 * innerWidth * .92 / width) + 'px';
        setTimeout(() => { banner.style.opacity = '0'; setTimeout(() => banner.remove(), 500); }, 1500);
      }, 250);
    })()`).catch(() => {
      });
    });
  currentWindow.loadURL(channel.url);
}
// ------------------------------------------------------------
// Optional system tray
// ------------------------------------------------------------
function createTray() {
  const icon = nativeImage.createFromPath(appIcon);
  tray = new Tray(icon);
  tray.setToolTip('EasyTV');
  updateTrayMenu();
  tray.on('click', showMainFromTray);
}

function updateTrayMenu() {
  if (!tray)
    return;
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: t('Open EasyTV'),
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
        else {
          createMainWindow();
        }
      }
    },
    {
      label: t('Close stream'),
      click: () => {
        if (streamWindow && !streamWindow.isDestroyed()) {
          streamWindow.close();
        }
      }
    },
    { type: 'separator' },
    {
      label: t('Exit'),
      click: () => app.quit()
    }
  ]));
}

function showMainFromTray() {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
  else {
    createMainWindow();
  }
}
// ------------------------------------------------------------
// Settings and deliberate power-off
// ------------------------------------------------------------
function requestPowerOff() {
  app.quit();
}
// ------------------------------------------------------------
// IPC
// ------------------------------------------------------------
let directTV = null;

function openDirectTV(channel, mode) {
  const previous = streamWindow;
  const win = new BrowserWindow({ fullscreen: true, autoHideMenuBar: true, title: channel.name,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  streamWindow = win;
  currentRadioId = null;
  currentChannelId = channel.id;
  directTV = { win, channel, mode };
  if (previous && !previous.isDestroyed())
    previous.close();
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.on('before-input-event', (event, input) => {
    if (handleAppShortcut(event, input, true))
      return;
    if (input.type !== 'keyDown' || handleRemoteInput(event, input))
      return;
    if (input.key === 'Escape') {
      event.preventDefault();
      win.close();
    }
    if (input.key === 'F12') {
      event.preventDefault();
      win.webContents.toggleDevTools();
    }
  });
  win.on('closed', () => {
    if (directTV?.win === win)
      directTV = null;
    if (streamWindow !== win)
      return;
    streamWindow = null;
    currentChannelId = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
  win.loadFile(path.join(__dirname, 'renderer/tv.html')).catch(error => {
    console.error('Direct TV:', error);
    if (streamWindow === win && mode === 'auto')
      openChannel(channel.id, true);
  });
}
ipcMain.handle('current-direct-tv', event => directTV && event.sender === directTV.win.webContents ? { channel: directTV.channel, mode: directTV.mode } : null);
ipcMain.handle('direct-tv-web', event => {
  if (directTV && event.sender === directTV.win.webContents && streamWindow === directTV.win && directTV.channel.url)
    openChannel(directTV.channel.id, true);
});
ipcMain.handle('get-radios', () => radios.map(s => ({ ...s, editable: true, original: radioCatalogue.originalIds.has(s.id) })));
ipcMain.handle('search-radios', (event, query) => {
  if (event.sender !== mainWindow?.webContents)
    throw Error('Unauthorized');
  return radioCatalogue.search(query);
});
ipcMain.handle('add-radio', (event, id) => {
  if (event.sender !== mainWindow?.webContents)
    throw Error('Unauthorized');
  return { ...radioCatalogue.add(id), editable: !radioCatalogue.originalIds.has(id) };
});
ipcMain.handle('open-radio', (event, id, preview) => {
  if (event.sender !== mainWindow?.webContents)
    throw Error('Unauthorized');
  openRadio(id, preview === true);
});
ipcMain.handle('current-radio', (event) => {
  if (event.sender !== streamWindow?.webContents || !currentRadioId)
    return null;
  return radios.find(r => r.id === currentRadioId);
});
ipcMain.handle('radio-home', (event) => {
  if (event.sender === streamWindow?.webContents && currentRadioId)
    streamWindow.close();
});
ipcMain.handle('radio-step', (event, direction) => {
  if (event.sender === streamWindow?.webContents && currentRadioId)
    changeRadio(direction === -1 ? -1 : 1);
});
ipcMain.handle('get-channels', () => channels);
ipcMain.handle('get-app-info', () => ({
  version: appVersion,
  build: buildInfo.build,
  fullscreen: mainWindow?.isFullScreen() ?? false
}));
ipcMain.handle('get-i18n', () => ({ dictionaries, languages, systemLanguage: resolveLanguage('auto', systemLanguages()) }));
ipcMain.on('preview-language', (event, language) => {
  if (mainWindow && event.sender === mainWindow.webContents) {
    previewLanguage = ['auto', ...Object.keys(languages)].includes(language) ? language : null;
    updateTrayMenu();
  }
});
ipcMain.handle('get-preferences', () => preferences.get());
ipcMain.handle('save-preferences', (_event, data) => preferences.update(data));
const configTransfer = require('./config-transfer');

ipcMain.handle('export-configuration', event => {
  tvAuthorized(event);
  if (!settingsScreenOpen) throw Error('Settings must be open');
  const file = dialog.showSaveDialogSync(mainWindow, {
    title: t('Export configuration'),
    defaultPath: path.join(app.getPath('documents'), `EasyTV-config-${new Date().toISOString().slice(0, 10)}.json`),
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (!file) return false;
  const data = configTransfer.exportConfig(app.getPath('userData'), preferences.get());
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  return true;
});

ipcMain.handle('import-configuration', event => {
  tvAuthorized(event);
  if (!settingsScreenOpen) throw Error('Settings must be open');
  const files = dialog.showOpenDialogSync(mainWindow, {
    title: t('Import configuration'), properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (!files?.length) return false;
  const data = configTransfer.validateConfig(configTransfer.readConfig(files[0]),
    [...require('./config/tvs.json'), ...require('./config/services.json')], require('./config/radios.json'));
  const answer = dialog.showMessageBoxSync(mainWindow, {
    type: 'warning', title: t('Import configuration'),
    message: t('Replace the current configuration?'),
    detail: t('TV favorites: {tv}. Radio favorites: {radio}. Groups: {groups}. A backup will be kept. EasyTV will restart.', {
      tv: data.preferences.favorites.tv.length, radio: data.preferences.favorites.radio.length, groups: data.preferences.groups.length
    }),
    buttons: [t('Cancel'), t('Import configuration')], defaultId: 0, cancelId: 0, noLink: true
  });
  if (answer !== 1) return false;
  configTransfer.importConfig(app.getPath('userData'), data);
  app.relaunch();
  app.exit(0);
  return true;
});

ipcMain.handle('reset-profile', async event => {
  tvAuthorized(event);
  if (!settingsScreenOpen)
    throw new Error('Settings must be open');
  const answer = dialog.showMessageBoxSync(mainWindow, {
    type: 'warning',
    title: t('Restore default settings'),
    message: t('Restore the default configuration?'),
    detail: t('Custom stations, favorites, groups and preferences in this profile will be reset. A backup will be kept. EasyTV will restart.'),
    buttons: [t('Cancel'), t('Restore default settings')],
    defaultId: 0, cancelId: 0, noLink: true
  });
  if (answer !== 1)
    return false;
  require('./reset-profile').resetProfile(app.getPath('userData'));
  app.relaunch();
  app.exit(0);
  return true;
});
ipcMain.handle('request-power-off', () => requestPowerOff());
ipcMain.on('settings-screen-state', (event, isOpen) => {
  if (mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents) {
    settingsScreenOpen = isOpen === true;
    if (!settingsScreenOpen) {
      previewLanguage = null;
      updateTrayMenu();
    }
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
  }
  catch (error) {
    console.error('Widevine components error:', error, '- status:', components.status());
  }
  // Block unwanted screen-sharing requests.
  const ses = session.fromPartition('persist:easytv');
  ses.setDisplayMediaRequestHandler((request, callback) => {
    console.warn('EasyTV: screen-sharing request blocked:', request.securityOrigin);
    callback({});
  });
  createMainWindow();
  if (trayEnabled) {
    createTray();
  }
  app.on('activate', () => {
    if (!mainWindow)
      createMainWindow();
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

function tvAuthorized(event) {
  if (event.sender !== mainWindow?.webContents)
    throw Error('Unauthorized');
}
ipcMain.handle('search-tvs', (e, q) => {
  tvAuthorized(e);
  return tvCatalogue.search(q);
});
ipcMain.handle('import-tv', (e, key) => {
  tvAuthorized(e);
  return tvCatalogue.importChannel(key);
});
ipcMain.handle('save-tv', (e, input, id) => {
  tvAuthorized(e);
  const conflict = input.number != null && String(input.number).trim() !== '' ? radios.find(s => s.number === Number(input.number)) : null;
  if (conflict)
    throw Error(`Channel number ${input.number} is already assigned to ${conflict.name}`);
  return tvCatalogue.save(input, id);
});
ipcMain.handle('preview-tv', (e, id) => {
  tvAuthorized(e);
  openChannel(id, false, true);
});
const deletedTVs = new Map();
ipcMain.handle('delete-tv', (e, id) => {
  tvAuthorized(e);
  if (tvCatalogue.originalIds.has(id))
    throw Error('Cannot delete original channel');
  const index = tvCatalogue.channels.findIndex(c => c.id === id);
  if (index < 0)
    throw Error('Channel not found');
  const channel = structuredClone(tvCatalogue.channels[index]);
  const before = preferences.get();
  preferences.forgetTV(id);
  tvCatalogue.remove(id);
  const token = require('node:crypto').randomUUID();
  deletedTVs.set(token, { channel, index, before });
  setTimeout(() => deletedTVs.delete(token), 9000);
  return { token, preferences: preferences.get() };
});
ipcMain.handle('restore-tv', (e, token) => {
  tvAuthorized(e);
  const entry = deletedTVs.get(token);
  if (!entry)
    throw Error('Undo expired');
  const conflict = entry.channel.number == null ? null : radios.find(s => s.number === entry.channel.number);
  if (conflict)
    throw Error(`Channel number ${entry.channel.number} is already assigned to ${conflict.name}`);
  const channel = tvCatalogue.restore(entry.channel, entry.index);
  const prefs = preferences.restoreTV(channel.id, entry.before);
  deletedTVs.delete(token);
  return { channel, preferences: prefs };
});
const deletedRadios = new Map();
ipcMain.handle('save-radio', (e, input, id) => {
  tvAuthorized(e);
  const conflict = input.number != null && String(input.number).trim() !== '' ? channels.find(s => s.number === Number(input.number)) : null;
  if (conflict)
    throw Error(`Channel number ${input.number} is already assigned to ${conflict.name}`);
  const station = radioCatalogue.save(input, id);
  return { ...station, editable: true, original: radioCatalogue.originalIds.has(station.id) };
});
ipcMain.handle('delete-radio', (e, id) => {
  tvAuthorized(e);
  if (radioCatalogue.originalIds.has(id) || !radios.some(s => s.id === id))
    throw Error('Station cannot be deleted');
  const before = preferences.get();
  preferences.forgetRadio(id);
  let entry;
  try {
    entry = radioCatalogue.remove(id);
  }
  catch (err) {
    preferences.restoreRadio(id, before);
    throw err;
  }
  const token = require('node:crypto').randomUUID();
  deletedRadios.set(token, { ...entry, before });
  setTimeout(() => deletedRadios.delete(token), 9000);
  return { token, preferences: preferences.get() };
});
ipcMain.handle('restore-radio', (e, token) => {
  tvAuthorized(e);
  const entry = deletedRadios.get(token);
  if (!entry)
    throw Error('Undo expired');
  const conflict = entry.station.number == null ? null : channels.find(s => s.number === entry.station.number);
  if (conflict)
    throw Error(`Channel number ${entry.station.number} is already assigned to ${conflict.name}`);
  const station = radioCatalogue.restore(entry.station, entry.index);
  const prefs = preferences.restoreRadio(station.id, entry.before);
  deletedRadios.delete(token);
  return { station: { ...station, editable: true }, preferences: prefs };
});
const logoFinder = require('./logo-finder').createLogoFinder(app);
ipcMain.handle('find-station-logo', (e, station, kind, force) => {
  if (e.sender !== mainWindow?.webContents && !(currentRadioId && e.sender === streamWindow?.webContents))
    return '';
  return logoFinder.find(station, kind, force === true);
});
