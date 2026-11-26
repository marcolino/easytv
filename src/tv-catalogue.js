const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function createTVCatalogue(app, originals, fetcher = globalThis.fetch) {
  const file = path.join(app.getPath('userData'), 'tv-catalogue.json');
  const channels = originals.map(c => ({ ...c }));
  const originalIds = new Set(originals.map(c => c.id));
  const normalize = s => String(s || '').normalize('NFKD').replace(/[^a-z0-9]/gi, '').toLowerCase();

  function url(value, required = false, allowHttp = false) {
    if (!value && !required)
      return '';
    const u = new URL(value);
    if ((u.protocol !== 'https:' && !(allowHttp && u.protocol === 'http:')) || u.username || u.password)
      throw Error('HTTPS URL required');
    return u.href;
  }

  function clean(input, id, source) {
    const name = String(input.name || '').trim();
    if (!name || name.length > 120)
      throw Error('Invalid channel name');
    const number = input.number === '' || input.number == null ? null : Number(input.number);
    if (number !== null && (!Number.isInteger(number) || number < 0 || number > 9999))
      throw Error(`Invalid channel number for ${name}: ${input.number}`);
    const conflict = number === null ? null : channels.find(c => c.id !== id && c.number === number);
    if (conflict)
      throw Error(`Channel number ${number} is already assigned to ${conflict.name}`);
    const directUrl = url(input.directUrl, false, true);
    const webUrl = url(input.url);
    if (!directUrl && !webUrl)
      throw Error('At least one TV URL is required');
    return { id, name, number, directUrl, url: webUrl, logo: url(input.logo), source };
  }
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    // Apply service overrides together before checking the effective numbers.
    const overrides = new Map(saved.filter(item => channels.some(c => c.service && c.id === item.id)).map(item => [item.id, item]));
    for (const service of channels.filter(c => c.service && overrides.has(c.id))) {
      const number = overrides.get(service.id).number;
      if (number === null || (Number.isInteger(number) && number >= 0 && number <= 9999))
        service.number = number;
      else
        console.warn('Service number: Invalid channel number for ' + service.name);
    }
    const occupied = new Map();
    for (const channel of channels) {
      if (channel.number == null) continue;
      if (occupied.has(channel.number)) {
        console.warn(`Channel number ${channel.number} is already assigned to ${occupied.get(channel.number)}`);
        channel.number = null;
      }
      else occupied.set(channel.number, channel.name);
    }
    for (const item of saved) {
      if (overrides.has(item.id)) continue;
      if (!/^custom-[a-f0-9-]+$/.test(item.id) || channels.some(c => c.id === item.id))
        continue;
      try {
        channels.push(clean(item, item.id, item.source === 'iptv' ? 'iptv' : 'manual'));
      }
      catch (e) {
        console.warn('TV catalogue entry:', e.message);
      }
    }
  }
  catch (e) {
    if (e.code !== 'ENOENT')
      console.warn('TV catalogue:', e.message);
  }

  function commit(next) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + '.tmp', JSON.stringify(next.filter(c => !originalIds.has(c.id) || (c.service && (c.number ?? null) !== (originals.find(o => o.id === c.id).number ?? null))).map(c => originalIds.has(c.id) ? { id: c.id, number: c.number ?? null } : c), null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(file + '.tmp', file);
    channels.splice(0, channels.length, ...next);
  }
  let cache, pending;
  const results = new Map();

  async function load() {
    if (cache && Date.now() - cache.time < 86400000)
      return cache;
    if (pending)
      return pending;
    pending = (async () => {
      const get = async (name) => {
        const r = await fetcher('https://iptv-org.github.io/api/' + name + '.json', { signal: AbortSignal.timeout(25000) });
        if (!r.ok)
          throw Error('Catalogue HTTP ' + r.status);
        return r.json();
      };
      const [list, streams, logos] = await Promise.all([get('channels'), get('streams'), get('logos').catch(() => [])]);
      const byId = new Map(list.map(c => [c.id, c]));
      const images = new Map(logos.map(l => [l.channel, l.url]));
      const rows = [];
      const grouped = new Map();

      for (const s of streams) {
        const c = byId.get(s.channel);
        if (!c)
          continue;


        if (c.is_nsfw || c.closed) {

          continue;
        }
        if (originals.some(o => normalize(o.name) === normalize(c.name) && c.country === 'IT')) {

          continue;
        }
        let streamUrl;
        try {
          streamUrl = url(s.url, true, true);
        }
        catch {

          continue;
        }
        const variants = grouped.get(c.id) || [];
        grouped.set(c.id, variants);
        if (variants.some(v => v.directUrl === streamUrl))
          continue;
        const headers = !!(s.referrer || s.user_agent);
        const insecure = streamUrl.startsWith('http:');
        const unknown = !(/\.m3u8(?:[?#]|$)/i.test(streamUrl) || /^https?:\/\/mediapolis\.rai\.it\/relinker\//i.test(streamUrl));
        variants.push({ key: c.id + '|' + streamUrl, directUrl: streamUrl, quality: s.quality || '', headers, insecure, unknown });

      }
      for (const [id, variants] of grouped) {
        const c = byId.get(id);
        variants.sort((a, b) => (a.headers * 4 + a.insecure * 2 + a.unknown) - (b.headers * 4 + b.insecure * 2 + b.unknown));
        rows.push({ name: c.name, country: c.country, genre: (c.categories || []).join(', '), logo: images.get(id) || '', variants });
      }
      cache = { time: Date.now(), rows };
      return cache;
    })().finally(() => {
      pending = null;
    });
    try {
      return await pending;
    }
    catch (e) {
      if (cache)
        return cache;
      throw e;
    }
  }

  async function search(q = {}) {
    const { rows } = await load();
    const name = normalize(q.name), country = String(q.country || '').toUpperCase(), genre = String(q.genre || '').toLowerCase();
    const filtered = rows.filter(r => (!country || r.country === country) && normalize(r.name).includes(name) && r.genre.toLowerCase().includes(genre));
    const offset = Math.max(0, Math.min(100000, Number(q.offset) || 0));
    const stations = filtered.slice(offset, offset + 30);
    for (const r of stations)
      for (const v of r.variants)
        results.set(v.key, { ...r, ...v });
    return { stations, more: offset + 30 < filtered.length };
  }

  function save(input, id = null, source = 'manual') {
    const service = channels.find(c => c.id === id && c.service && originalIds.has(c.id));
    if (service) {
      const number = clean({ ...service, number: input.number }, id, undefined).number;
      const updated = { ...service, number };
      commit(channels.map(c => c.id === id ? updated : c));
      return updated;
    }
    if (id && (!channels.some(c => c.id === id) || originalIds.has(id)))
      throw Error('Cannot edit original channel');
    const c = clean(input, id || 'custom-' + randomUUID(), source);
    const previous = channels.find(x => x.id === c.id);
    const sameStream = (a, b) => a.directUrl ? a.directUrl === b.directUrl : !b.directUrl && a.url === b.url;
    // A new built-in service may duplicate a previously saved custom entry.
    // Permit edits to that entry, but never introduce a new stream collision.
    if (!(previous && sameStream(c, previous)) && channels.some(x => x.id !== c.id && sameStream(c, x)))
      throw Error('Stream already in catalogue');
    commit([...channels.filter(x => x.id !== c.id), c]);
    return c;
  }

  function importChannel(key) {
    const r = results.get(key);
    if (!r)
      throw Error('Search result expired');
    const existing = channels.find(c => c.directUrl === url(r.directUrl, true, true));
    return existing || save({ ...r, logo: /^https:\/\//i.test(r.logo) ? r.logo : '' }, null, 'iptv');
  }

  function remove(id) {
    if (originalIds.has(id))
      throw Error('Cannot delete original channel');
    commit(channels.filter(c => c.id !== id));
  }

  function restore(c, index) {
    if (channels.some(x => x.id === c.id || (c.directUrl ? x.directUrl === c.directUrl : !x.directUrl && x.url === c.url)))
      throw Error("Channel already exists");
    const item = clean(c, c.id, c.source);
    const next = [...channels];
    next.splice(index, 0, item);
    commit(next);
    return item;
  }
  return { channels, search, save, importChannel, remove, restore, originalIds };
}
module.exports = { createTVCatalogue };
