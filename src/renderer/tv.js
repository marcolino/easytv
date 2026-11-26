(async () => {
  const api = window.easyTV, $ = id => document.getElementById(id);
  const [info, prefs, locale] = await Promise.all([api.currentDirectTV(), api.getPreferences(), api.getI18n()]);
  if (!info)
    return;
  const lang = prefs.language === 'auto' ? locale.systemLanguage : prefs.language;
  const t = key => locale.dictionaries[lang]?.[key] || key;
  const video = $('video');
  const frame = $('last-frame'), spinner = $('loading-spinner');
  const frameContext = frame.getContext('2d');
  let hasFrame = false;
  let connecting = true;
  let buffering = false;
  let bufferingTimer;

  function rememberFrame() {
    if (connecting || failed || video.paused || video.readyState < 2 || !video.videoWidth || !frameContext)
      return;
    try {
      const scale = Math.min(1, 1280 / video.videoWidth);
      const width = Math.round(video.videoWidth * scale);
      const height = Math.round(video.videoHeight * scale);
      if (frame.width !== width || frame.height !== height) {
        frame.width = width;
        frame.height = height;
      }
      frameContext.drawImage(video, 0, 0, width, height);
      hasFrame = true;
    }
    catch {
      // A frame may not be accessible on every platform.
    }
  }

  function showLoading() {
    frame.hidden = !hasFrame;
    spinner.hidden = false;
  }

  function clearBuffering() {
    clearTimeout(bufferingTimer);
    bufferingTimer = undefined;
    buffering = false;
  }

  function showBuffering() {
    if (connecting || failed || video.paused || buffering)
      return;
    buffering = true;
    // Keep the native frozen video visible until an actual reconnect.
    spinner.hidden = false;
  }

  function scheduleBuffering() {
    if (connecting || failed || buffering || bufferingTimer !== undefined)
      return;
    bufferingTimer = setTimeout(() => {
      bufferingTimer = undefined;
      showBuffering();
    }, 1000);
  }

  video.addEventListener('waiting', scheduleBuffering);

  const frameTimer = setInterval(rememberFrame, 500);
  let hls, timer, lastProgress = Date.now(), lastTime = -1, attempts = 0, failed = false, retryTimer, generation = 0;
  $('name').textContent = info.channel.name;
  $('web').textContent = t('Official player');
  $('retry').textContent = t('Retry');
  for (const id of ['web', 'retry']) {
    $(id).title = $(id).textContent;
    $(id).setAttribute('aria-label', $(id).title);
  }
  $('web').hidden = !info.channel.url;
  $('web').onclick = () => api.directTVWeb();
  $('retry').onclick = () => {
    attempts = 0;
    start();
  };

  function reveal() {
    document.body.classList.remove('idle');
    $('overlay').classList.remove('hidden');
    clearTimeout(timer);
    if (!failed && !connecting)
      timer = setTimeout(() => {
        if (!failed) {
          document.body.classList.add('idle');
          $('overlay').classList.add('hidden');
        }
      }, 2500);
  }
  for (const event of ['pointermove', 'pointerdown', 'keydown', 'focusin'])
    document.addEventListener(event, reveal);

  function stop() {
    clearBuffering();
    generation++;
    clearTimeout(retryTimer);
    if (hls) {
      hls.destroy();
      hls = null;
    }
    video.pause();
    video.removeAttribute('src');
    video.load();
  }

  function fail(reason) {
    if (failed)
      return;
    rememberFrame();
    failed = true;
    showLoading();
    console.warn('Direct TV:', reason);
    stop();
    $('status').textContent = t('Reconnecting...');
    reveal();
    if (attempts++ < 2) {
      retryTimer = setTimeout(start, 3000);
      return;
    }
    spinner.hidden = true;
    if (info.mode === 'auto') {
      api.directTVWeb();
      return;
    }
    $('status').textContent = t('Direct streaming failed');
    $('web').disabled = $('retry').disabled = false;
  }

  function start() {
    stop();
    failed = false;
    connecting = true;
    showLoading();
    $('web').disabled = $('retry').disabled = true;
    lastProgress = Date.now();
    lastTime = -1;
    $('status').textContent = t('Connecting to TV channel...');
    reveal();
    const token = generation;
    if (!window.Hls?.isSupported()) {
      fail('HLS/MSE unavailable');
      return;
    }
    hls = new Hls({ enableWorker: true });
    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (data.fatal && token === generation)
        fail(data.details);
    });
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (token === generation)
        video.play().catch(e => fail(e.message));
    });
    hls.loadSource(info.channel.directUrl);
    hls.attachMedia(video);
  }
  video.addEventListener('playing', () => {
    connecting = false;
    clearBuffering();
    frame.hidden = true;
    spinner.hidden = true;
    rememberFrame();
    $('status').textContent = t('Live TV');
    clearTimeout(timer);
    $('overlay').classList.add('hidden');
    $('web').disabled = $('retry').disabled = false;
    timer = setTimeout(() => document.body.classList.add('idle'), 2500);
  });
  video.addEventListener('resize', () => {
    $('quality').textContent = video.videoHeight ? `${video.videoWidth} × ${video.videoHeight}` : '';
  });
  const programmeInfo = $('programme-info');
  const programmeBanner = $('programme-banner');
  let programmeData = null, programmeTimer, bannerTimer, epgPending = false;
  programmeInfo.setAttribute('aria-label', t('Programme information'));
  $('programme-channel').textContent = info.channel.name;

  function renderProgramme() {
    const current = programmeData?.current;
    const next = programmeData?.next;
    $('programme-current').textContent = current ? `${t('Now')}: ${window.epgUI.line(current, lang)}` : '';
    $('programme-next').textContent = next ? `${t('Next')}: ${window.epgUI.line(next, lang)}` : '';
    $('programme-progress').hidden = !current;
    $('programme-progress').value = window.epgUI.progress(current);
    if (!current && !next) $('programme-current').textContent = t('No programme information');
    programmeBanner.textContent = window.epgUI.title(current, lang);
  }

  async function refreshProgramme() {
    if (epgPending) return;
    epgPending = true;
    try { programmeData = await api.getEPGNowNext(info.channel.id); }
    catch { programmeData = null; }
    finally { epgPending = false; }
    renderProgramme();
  }

  void refreshProgramme();
  const epgTimer = setInterval(refreshProgramme, 15000);
  const progressTimer = setInterval(renderProgramme, 1000);
  document.addEventListener('keydown', event => {
    if (event.key !== 'F3' || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    clearTimeout(programmeTimer);
    programmeInfo.hidden = !programmeInfo.hidden;
    if (!programmeInfo.hidden) {
      void refreshProgramme();
      programmeTimer = setTimeout(() => { programmeInfo.hidden = true; }, 5000);
    }
  });
  const banner = $('channel-banner');
  banner.textContent = info.channel.name;

  function fitBanner() {
    banner.style.fontSize = '46vh';
    const textWidth = document.createRange();
    textWidth.selectNodeContents(banner);
    const measured = textWidth.getBoundingClientRect().width;
    if (measured > innerWidth * .92)
      banner.style.fontSize = (innerHeight * .46 * innerWidth * .92 / measured) + 'px';
  }
  video.addEventListener('playing', () => {
    fitBanner();
    banner.classList.add('visible');
    programmeBanner.classList.add('visible');
    bannerTimer = setTimeout(() => {
      banner.classList.remove('visible');
      programmeBanner.classList.remove('visible');
    }, 1500);
  }, { once: true });
  const watchdog = setInterval(() => {
    if (failed)
      return;
    if (video.currentTime !== lastTime) {
      lastTime = video.currentTime;
      lastProgress = Date.now();
      if (!connecting) {
        clearBuffering();
        spinner.hidden = true;
      }
    }
    else if (Date.now() - lastProgress > 20000)
      fail('No playback progress');
    else if (Date.now() - lastProgress >= 1000)
      showBuffering();
  }, 250);
  window.addEventListener('pagehide', () => {
    clearInterval(epgTimer);
    clearInterval(progressTimer);
    clearTimeout(programmeTimer);
    clearTimeout(bannerTimer);
    clearInterval(watchdog);
    clearInterval(frameTimer);
    clearTimeout(timer);
    stop();
  });
  start();
})().catch(console.error);
