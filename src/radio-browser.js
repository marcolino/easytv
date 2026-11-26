const fs = require('node:fs');
const path = require('node:path');

function station(raw) {
  const url = raw.url_resolved || raw.url;
  if (!/^https?:\/\//i.test(url || '') || !raw.stationuuid || !raw.name)
    return null;
  return { id: raw.stationuuid, name: raw.name.trim(), url, logo: /^https?:\/\//i.test(raw.favicon || '') ? raw.favicon : '', country: raw.country || '', genre: raw.tags || '', codec: raw.codec || '', bitrate: raw.bitrate || 0 };
}

function createRadioCatalogue(app, defaults) {
  const file = path.join(app.getPath('userData'), 'radio-catalogue.json');
  let saved = [];
  try {
    saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(saved)) saved = [];
  }
  catch (e) {
    if (e.code !== 'ENOENT') console.warn(e.message);
  }
  const norm = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const streamKey = value => String(value || '').replace(/^https?:\/\//i, '').replace(/\/$/, '');
  const originals = defaults.filter(d => !saved.some(s => s.id !== d.id && (norm(s.name) === norm(d.name) || streamKey(s.url) === streamKey(d.url))));
  const originalIds = new Set(originals.map(s => s.id));
  const radios = [...originals.map(d => ({ ...d, ...saved.find(s => s.id === d.id) })), ...saved.filter(s => !originalIds.has(s.id))];
  const results = new Map();

  async function search({ name = '', country = 'IT', genre = '', offset = 0 } = {}) {
    const params = new URLSearchParams({ name: String(name).slice(0, 100), countrycode: String(country).toUpperCase().slice(0, 2), tag: String(genre).slice(0, 100), offset: String(Math.max(0, Number(offset) || 0)), limit: '30', hidebroken: 'true', order: 'clickcount', reverse: 'true' });
    let error;
    for (const host of ['de1.api.radio-browser.info', 'nl1.api.radio-browser.info']) {
      try {
        const response = await fetch(`https://${host}/json/stations/search?${params}`, { headers: { 'User-Agent': 'EasyTV/1.0' }, signal: AbortSignal.timeout(12000) });
        if (!response.ok)
          throw Error(`HTTP ${response.status}`);
        const raw = await response.json();
        const list = raw.map(station).filter(Boolean);
        for (const s of list)
          results.set(s.id, s);
        return { stations: list, more: raw.length === 30 };
      }
      catch (e) {
        error = e;
      }
    }
    throw error;
  }

  function add(id) {
    const existing = radios.find(s => s.id === id);
    if (existing)
      return existing;
    const s = results.get(id);
    if (!s)
      throw Error('Unknown station');
    const duplicate = radios.find(r => streamKey(r.url) === streamKey(s.url));
    if (duplicate) return duplicate;
    persist([...radios, s]);
    return s;
  }

  function persist(next) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + '.tmp', JSON.stringify(next.filter(s => !originalIds.has(s.id) || JSON.stringify(s) !== JSON.stringify(defaults.find(d => d.id === s.id))), null, 2), { mode: 0o600 });
    fs.renameSync(file + '.tmp', file);
    radios.splice(0, radios.length, ...next);
  }

  function save(input, id) {
    const old = id ? radios.find(s => s.id === id) : null;
    if (id && !old)
      throw Error('Station cannot be edited');
    const clean = k => String(input[k] ?? '').trim().slice(0, 2048);
    const name = clean('name');
    if (!name)
      throw Error('Station name required');
    const urlField = (k, required = false) => {
      const v = clean(k);
      if (!v && !required)
        return '';
      const u = new URL(v);
      if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password)
        throw Error('Invalid URL');
      return u.href;
    };
    const url = urlField('url', true);
    if (url !== old?.url && radios.some(s => s.id !== id && s.url === url))
      throw Error('Stream URL already exists');
    const number = clean('number') === '' ? null : Number(clean('number'));
    if (number !== null && (!Number.isInteger(number) || number < 0 || number > 9999))
      throw Error(`Invalid channel number for ${name}: ${input.number}`);
    const conflict = number === null ? null : radios.find(s => s.id !== id && s.number === number);
    if (conflict)
      throw Error(`Channel number ${number} is already assigned to ${conflict.name}`);
    const station = { ...old, number, id: id || require('node:crypto').randomUUID(), name, url, logo: urlField('logo'), homepage: urlField('homepage'), country: clean('country'), genre: clean('genre'), frequency: clean('frequency'), codec: old?.url === url ? old.codec || '' : '', bitrate: old?.url === url ? old.bitrate || 0 : 0 };
    persist(old ? radios.map(s => s.id === id ? station : s) : [...radios, station]);
    return station;
  }

  function remove(id) {
    if (originalIds.has(id))
      throw Error('Cannot delete original station');
    const index = radios.findIndex(s => s.id === id);
    if (index < 0)
      throw Error('Station not found');
    const station = radios[index];
    persist(radios.filter(s => s.id !== id));
    return { station, index };
  }

  function restore(station, index) {
    if (radios.some(s => s.id === station.id || s.url === station.url))
      throw Error('Station already exists');
    const conflict = station.number == null ? null : radios.find(s => s.number === station.number);
    if (conflict)
      throw Error(`Channel number ${station.number} is already assigned to ${conflict.name}`);
    const next = [...radios];
    next.splice(Math.min(index, next.length), 0, station);
    persist(next);
    return station;
  }
  return { radios, search, add, save, remove, restore, originalIds };
}
module.exports = { createRadioCatalogue };
