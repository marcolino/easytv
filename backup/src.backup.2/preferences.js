// Persistent preferences. Catalogue files remain read-only.
const fs = require('node:fs');
const path = require('node:path');

function createPreferences(app, tvs, radios) {
  const file = path.join(app.getPath('userData'), 'settings.json');
  const tvIds = new Set(tvs.map(x => x.id));
  const radioIds = new Set(radios.map(x => x.id));
  const defaults = {
    lastStation: null,
    favorites: { tv: tvs.slice(0, 10).map(x => x.id), radio: [] },
    groups: [
      { id: 'rai', name: 'RAI', type: 'tv', visible: true, stationIds: tvs.filter(x => x.group === 'RAI').map(x => x.id) },
      { id: 'mediaset', name: 'MEDIASET', type: 'tv', visible: true, stationIds: tvs.filter(x => x.group === 'MEDIASET').map(x => x.id) },
      { id: 'altri', name: 'ALTRI CANALI', type: 'tv', visible: true, stationIds: tvs.filter(x => x.group === 'ALTRI').map(x => x.id) }
    ]
  };
  let data = structuredClone(defaults);
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    // Accept previously saved lastChannelId from earlier prototypes.
    const last = raw.lastStation ?? (raw.lastChannelId ? { type: 'tv', id: raw.lastChannelId } : null);
    if (last && last.type === 'tv' && tvIds.has(last.id)) data.lastStation = last;
    if (last && last.type === 'radio' && radioIds.has(last.id)) data.lastStation = last;
    if (raw.favorites && Array.isArray(raw.favorites.tv) && Array.isArray(raw.favorites.radio)) {
      data.favorites = raw.favorites;
    }
    if (Array.isArray(raw.groups)) data.groups = raw.groups;
    // Earlier experimental sections schema, when present.
    else if (Array.isArray(raw.sections)) data.groups = raw.sections.map(s => ({
      id: s.id, name: s.name, type: s.kind, visible: s.visible, stationIds: s.stationIds
    }));
    data = validate(data);
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('EasyTV: invalid settings, using defaults:', e.message);
    data = structuredClone(defaults);
  }
  function validate(value) {
    if (!value || typeof value !== 'object') throw new Error('Invalid preferences');
    const favorites = {};
    for (const type of ['tv', 'radio']) {
      const list = value.favorites?.[type];
      if (!Array.isArray(list) || list.length > 10 || new Set(list).size !== list.length) {
        throw new Error(`Invalid ${type} favorites (maximum 10)`);
      }
      const allowed = type === 'tv' ? tvIds : radioIds;
      if (list.some(id => !allowed.has(id))) throw new Error(`Unknown ${type} favorite`);
      favorites[type] = [...list];
    }
    if (!Array.isArray(value.groups) || value.groups.length > 100) throw new Error('Invalid groups');
    const used = new Set();
    const groups = value.groups.map(g => {
      if (!g || typeof g.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(g.id) || used.has(g.id) ||
          typeof g.name !== 'string' || !g.name.trim() || g.name.length > 80 ||
          !['tv','radio'].includes(g.type) || typeof g.visible !== 'boolean' ||
          !Array.isArray(g.stationIds) || g.stationIds.length > 500) throw new Error('Invalid group');
      used.add(g.id);
      const allowed = g.type === 'tv' ? tvIds : radioIds;
      if (g.stationIds.some(id => !allowed.has(id))) throw new Error('Unknown station in group');
      return { id: g.id, name: g.name.trim(), type: g.type, visible: g.visible,
        stationIds: [...new Set(g.stationIds)] };
    });
    const last = value.lastStation;
    const validLast = last && ['tv','radio'].includes(last.type) &&
      (last.type === 'tv' ? tvIds : radioIds).has(last.id) ? { type: last.type, id: last.id } : null;
    return { lastStation: validLast, favorites, groups };
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
    update: next => write(next),
    remember: (type, id) => write({ ...data, lastStation: { type, id } })
  };
}
module.exports = { createPreferences };
