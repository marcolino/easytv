// Persistent preferences. Catalogue files remain read-only.
const fs = require('node:fs');
const path = require('node:path');

function createPreferences(app, tvs, radios) {
  const file = path.join(app.getPath('userData'), 'settings.json');
  const tvIds = { has: id => tvs.some(x => x.id === id) };
  const radioIds = { has: id => radios.some(x => x.id === id) };
  const defaults = {
    language: 'auto',
    tvPlayback: {},
    lastStation: null,
    favorites: { tv: tvs.filter(x => !x.source).map(x => x.id), radio: radios.filter(x => x.favorite === true).map(x => x.id) },
    groups: [
      { id: 'rai', name: 'RAI', type: 'tv', visible: true, stationIds: tvs.filter(x => x.group === 'RAI').map(x => x.id) },
      { id: 'mediaset', name: 'Mediaset', type: 'tv', visible: true, stationIds: tvs.filter(x => x.group === 'MEDIASET').map(x => x.id) },
      { id: 'streaming', name: 'Streaming', type: 'tv', visible: true, stationIds: tvs.filter(x => x.service).map(x => x.id) },
      { id: 'altri', name: 'Altri canali', type: 'tv', visible: true, stationIds: tvs.filter(x => x.group === 'ALTRI').map(x => x.id) }
    ]
  };
  for (const name of new Set(radios.map(r => r.group || 'Radio')))
    defaults.groups.push({ id: 'radio-' + defaults.groups.length, name, type: 'radio', visible: true, stationIds: radios.filter(r => (r.group || 'Radio') === name).map(r => r.id) });
  let data = structuredClone(defaults);
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    // Accept previously saved lastChannelId from earlier prototypes.
    data.language = raw.language;
    data.tvPlayback = raw.tvPlayback;
    const last = raw.lastStation ?? (raw.lastChannelId ? { type: 'tv', id: raw.lastChannelId } : null);
    if (last && last.type === 'tv' && tvIds.has(last.id))
      data.lastStation = last;
    if (last && last.type === 'radio' && radioIds.has(last.id))
      data.lastStation = last;
    if (raw.favorites && Array.isArray(raw.favorites.tv) && Array.isArray(raw.favorites.radio)) {
      data.favorites = { ...raw.favorites, tv: raw.favorites.tv.filter(id => !String(id).startsWith('custom-') || tvIds.has(id)) };
    }
    if (Array.isArray(raw.groups))
      data.groups = raw.groups.map(g => g.type === 'tv' && Array.isArray(g.stationIds) ? { ...g, stationIds: g.stationIds.filter(id => !String(id).startsWith('custom-') || tvIds.has(id)) } : g);
    // Earlier experimental sections schema, when present.
    else if (Array.isArray(raw.sections))
      data.groups = raw.sections.map(s => ({
        id: s.id, name: s.name, type: s.kind, visible: s.visible, stationIds: s.stationIds
      }));
    // For older settings, infer known IDs from saved memberships and favorites.
    const known = new Set(Array.isArray(raw.knownTvIds) ? raw.knownTvIds : [
      ...data.favorites.tv, ...data.groups.filter(g => g.type === 'tv').flatMap(g => g.stationIds)
    ]);
    const newServices = tvs.filter(x => x.service && !known.has(x.id));
    if (newServices.length) {
      let group = data.groups.find(g => g.id === 'streaming' && g.type === 'tv');
      if (!group) {
        group = { id: 'streaming', name: 'Streaming', type: 'tv', visible: true, stationIds: [] };
        data.groups.push(group);
      }
      for (const station of newServices) {
        if (!group.stationIds.includes(station.id)) group.stationIds.push(station.id);
        if (!data.favorites.tv.includes(station.id)) data.favorites.tv.push(station.id);
      }
    }
    for (const station of tvs) {
      if (known.has(station.id))
        continue;
      const defaultGroup = defaults.groups.find(g => g.stationIds.includes(station.id));
      const target = defaultGroup && data.groups.find(g => g.id === defaultGroup.id && g.type === 'tv');
      if (target && !target.stationIds.includes(station.id))
        target.stationIds.push(station.id);
    }
    // Rename only unchanged legacy default group names.
    const legacyNames = { mediaset: 'MEDIASET', streaming: 'STREAMING', altri: 'ALTRI CANALI' };
    for (const group of data.groups) {
      const original = defaults.groups.find(g => g.id === group.id);
      if (original && group.type === 'tv' && group.name === legacyNames[group.id])
        group.name = original.name;
    }
    data = validate(data);
  }
  catch (e) {
    if (e.code !== 'ENOENT')
      console.warn('EasyTV: invalid settings, using defaults:', e.message);
    data = structuredClone(defaults);
  }

  function validate(value) {
    if (!value || typeof value !== 'object')
      throw new Error('Invalid preferences');
    const favorites = {};
    for (const type of ['tv', 'radio']) {
      const list = value.favorites?.[type];
      if (!Array.isArray(list) || new Set(list).size !== list.length) {
        throw new Error(`Invalid ${type} favorites`);
      }
      const allowed = type === 'tv' ? tvIds : radioIds;
      if (list.some(id => !allowed.has(id)))
        throw new Error(`Unknown ${type} favorite`);
      favorites[type] = [...list];
    }
    if (!Array.isArray(value.groups) || value.groups.length > 100)
      throw new Error('Invalid groups');
    const used = new Set();
    const groups = value.groups.map(g => {
      if (!g || typeof g.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(g.id) || used.has(g.id) ||
        typeof g.name !== 'string' || !g.name.trim() || g.name.length > 80 ||
        !['tv', 'radio'].includes(g.type) || typeof g.visible !== 'boolean' ||
        !Array.isArray(g.stationIds) || g.stationIds.length > 500)
        throw new Error('Invalid group');
      used.add(g.id);
      const allowed = g.type === 'tv' ? tvIds : radioIds;
      if (g.stationIds.some(id => !allowed.has(id)))
        throw new Error('Unknown station in group');
      return { id: g.id, name: g.name.trim(), type: g.type, visible: g.visible,
        stationIds: [...new Set(g.stationIds)] };
    });
    const last = value.lastStation;
    const validLast = last && ['tv', 'radio'].includes(last.type) &&
      (last.type === 'tv' ? tvIds : radioIds).has(last.id) ? { type: last.type, id: last.id } : null;
    const tvPlayback = {};
    for (const station of tvs) {
      const mode = value.tvPlayback?.[station.id];
      if (station.directUrl && ['direct', 'auto'].includes(mode))
        tvPlayback[station.id] = mode;
    }
    return { tvPlayback, language: ['auto', 'en', 'it', 'fr', 'de'].includes(value.language) ? value.language : 'auto', lastStation: validLast, favorites, groups, knownTvIds: tvs.map(x => x.id) };
  }

  function write(next) {
    const checked = validate(next);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(checked, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(tmp, file);
    data = checked;
    return structuredClone(data);
  }
  return {
    get: () => structuredClone(data),
    update: next => write({ ...next, lastStation: data.lastStation }),
    forgetRadio: id => {
      const next = structuredClone(data);
      next.favorites.radio = next.favorites.radio.filter(x => x !== id);
      for (const g of next.groups)
        if (g.type === 'radio')
          g.stationIds = g.stationIds.filter(x => x !== id);
      if (next.lastStation?.type === 'radio' && next.lastStation.id === id)
        next.lastStation = null;
      return write(next);
    },
    restoreRadio: (id, before) => {
      const next = structuredClone(data);
      const insert = (a, b) => {
        const i = b.indexOf(id);
        if (i >= 0 && !a.includes(id))
          a.splice(Math.min(i, a.length), 0, id);
      };
      insert(next.favorites.radio, before.favorites.radio);
      for (const g of next.groups)
        if (g.type === 'radio') {
          const old = before.groups.find(x => x.id === g.id);
          if (old)
            insert(g.stationIds, old.stationIds);
        }
      if (!next.lastStation && before.lastStation?.type === 'radio' && before.lastStation.id === id)
        next.lastStation = before.lastStation;
      return write(next);
    },
    forgetTV: id => {
      const next = structuredClone(data);
      next.favorites.tv = next.favorites.tv.filter(x => x !== id);
      for (const g of next.groups)
        if (g.type === 'tv')
          g.stationIds = g.stationIds.filter(x => x !== id);
      delete next.tvPlayback[id];
      if (next.lastStation?.type === 'tv' && next.lastStation.id === id)
        next.lastStation = null;
      return write(next);
    },
    restoreTV: (id, before) => {
      const next = structuredClone(data);
      const insert = (a, b) => {
        const i = b.indexOf(id);
        if (i >= 0 && !a.includes(id))
          a.splice(Math.min(i, a.length), 0, id);
      };
      insert(next.favorites.tv, before.favorites.tv);
      for (const g of next.groups) {
        const old = before.groups.find(x => x.id === g.id);
        if (old)
          insert(g.stationIds, old.stationIds);
      }
      if (before.tvPlayback[id])
        next.tvPlayback[id] = before.tvPlayback[id];
      if (!next.lastStation && before.lastStation?.id === id)
        next.lastStation = before.lastStation;
      return write(next);
    },
    remember: (type, id) => write({ ...data, lastStation: { type, id } })
  };
}
module.exports = { createPreferences };
