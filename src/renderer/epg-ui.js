(() => {
  function title(programme, lang) {
    const titles = programme?.title || [];
    return (titles.find(v => v.lang?.split('-')[0] === lang) || titles[0])?.text || '';
  }

  function time(value, lang) {
    return new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(value);
  }

  function line(programme, lang) {
    return programme ? `${time(programme.start, lang)} – ${time(programme.stop, lang)}  ${title(programme, lang)}` : '';
  }

  function progress(programme, now = Date.now()) {
    return programme ? Math.max(0, Math.min(100, 100 * (now - programme.start) / (programme.stop - programme.start))) : 0;
  }

  window.epgUI = { title, line, progress };
})();
