'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { refresh, nowNext } = require('./epg');

function normalize(name) {
  return String(name || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function resolveChannel(guide, station, channelMap = {}) {
  if (!station || station.service || !guide) return null;
  const explicit = channelMap[station.id];
  if (explicit && guide.channels.some(c => c.id === explicit)) return explicit;
  const name = normalize(station.name);
  if (!name) return null;
  const matches = guide.channels.filter(c => c.names.some(n => normalize(n.text) === name));
  return matches.length === 1 ? matches[0].id : null;
}

function createEPGService(profile, config, options = {}) {
  const cachePath = path.join(profile, 'epg-cache.json');
  const interval = (config.refreshHours || 6) * 3600000;
  let guide = null;
  let pending = null;
  let timer = null;
  let stopped = false;
  let error = null;

  function status() {
    return { fetchedAt: guide?.fetchedAt || null, channels: guide?.channels.length || 0,
      programmes: guide?.programmes.length || 0, refreshing: !!pending, error };
  }

  async function update() {
    if (stopped || !config.url) return status();
    if (pending) return pending;
    pending = (async () => {
      try {
        guide = await refresh({ url: config.url, cachePath, fetchImpl: options.fetchImpl });
        error = null;
      }
      catch (e) { error = e.message; }
      finally { pending = null; }
      return status();
    })();
    return pending;
  }

  async function start() {
    try {
      const cached = JSON.parse(await fs.readFile(cachePath, 'utf8'));
      if (!guide && cached.version === 1 && Number.isFinite(cached.fetchedAt) && Array.isArray(cached.channels) && Array.isArray(cached.programmes)) guide = cached;
    }
    catch { /* Missing or unreadable cache is non-fatal. */ }
    if (stopped || !config.url) return;
    if (!guide || Date.now() - guide.fetchedAt >= interval) void update();
    timer = setInterval(() => void update(), interval);
    timer.unref?.();
  }

  function stop() {
    stopped = true;
    clearInterval(timer);
  }

  function programmes(station, now = Date.now()) {
    const id = resolveChannel(guide, station, config.channelMap);
    return id ? nowNext(guide, id, now) : { current: null, next: null };
  }

  return { start, stop, update, status, programmes };
}

module.exports = { createEPGService, resolveChannel };
