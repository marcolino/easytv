const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createTVCatalogue } = require('./tv-catalogue');
const { createRadioCatalogue } = require('./radio-browser');
const { createPreferences } = require('./preferences');
const names = ['settings.json', 'tv-catalogue.json', 'radio-catalogue.json'];
const limit = 5 * 1024 * 1024;
const object = x => x && typeof x === 'object' && !Array.isArray(x);

function readCatalogue(profile, name) {
  try { return JSON.parse(fs.readFileSync(path.join(profile, name), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

function exportConfig(profile, preferences) {
  return { format: 'EasyTV configuration', version: 1, preferences,
    tv: readCatalogue(profile, names[1]), radio: readCatalogue(profile, names[2]) };
}

function writeJSON(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
}

function readConfig(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) throw Error('Invalid configuration file size');
    const buffer = Buffer.alloc(limit + 1);
    let size = 0;
    while (size < buffer.length) {
      const count = fs.readSync(fd, buffer, size, buffer.length - size, null);
      if (!count) break;
      size += count;
    }
    if (size > limit) throw Error('Invalid configuration file size');
    return JSON.parse(buffer.subarray(0, size).toString('utf8'));
  }
  finally { fs.closeSync(fd); }
}

function validateConfig(data, tvDefaults, radioDefaults) {
  if (!object(data) || data.format !== 'EasyTV configuration' || data.version !== 1 || !object(data.preferences))
    throw Error('Unsupported configuration format');
  const tvIds = new Set(tvDefaults.filter(c => c.service).map(c => c.id));
  for (const [kind, list] of [['tv', data.tv], ['radio', data.radio]]) {
    if (!Array.isArray(list) || list.length > 5000) throw Error('Invalid catalogue');
    const ids = new Set();
    for (const item of list) {
      if (!object(item) || typeof item.id !== 'string' || !/^[a-zA-Z0-9-]{1,120}$/.test(item.id) || ids.has(item.id)) throw Error('Invalid or duplicate station ID');
      ids.add(item.id);
      if (item.number != null && (!Number.isInteger(item.number) || item.number < 0 || item.number > 9999)) throw Error('Invalid channel number');
      const service = kind === 'tv' && tvIds.has(item.id);
      const allowed = service ? ['id','number'] : kind === 'tv' ? ['id','name','number','directUrl','url','logo','source'] : ['id','name','number','url','logo','homepage','country','genre','frequency','codec','bitrate','group','favorite'];
      if (Object.keys(item).some(k => !allowed.includes(k))) throw Error('Unexpected catalogue field');
      if (service) continue;
      if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 2048) throw Error('Invalid station name');
      if (kind === 'tv' && !/^custom-[a-f0-9-]+$/.test(item.id)) throw Error('Invalid custom TV ID');
      if (kind === 'tv' ? !item.url && !item.directUrl : !item.url) throw Error('Missing stream URL');
      for (const key of ['url','directUrl','logo','homepage']) {
        if (item[key] == null || item[key] === '') continue;
        if (typeof item[key] !== 'string' || item[key].length > 8192) throw Error('Invalid URL');
        const u = new URL(item[key]);
        if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw Error('Invalid URL');
      }
      for (const key of ['country','genre','frequency','codec','group','source'])
        if (item[key] != null && typeof item[key] !== 'string') throw Error('Invalid catalogue field');
      if (item.bitrate != null && !Number.isFinite(item.bitrate)) throw Error('Invalid bitrate');
      if (item.favorite != null && typeof item.favorite !== 'boolean') throw Error('Invalid favorite');
    }
  }
  const overrides = new Map(data.tv.map(item => [item.id, item]));
  const effectiveNumbers = new Map();
  for (const channel of tvDefaults) {
    const number = channel.service && overrides.has(channel.id) ? overrides.get(channel.id).number : channel.number;
    if (number == null) continue;
    if (effectiveNumbers.has(number)) throw Error(`Channel number ${number} is already assigned to ${effectiveNumbers.get(number)}`);
    effectiveNumbers.set(number, channel.name);
  }
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'easytv-import-'));
  try {
    writeJSON(path.join(stage, names[1]), data.tv);
    writeJSON(path.join(stage, names[2]), data.radio);
    const app = { getPath: () => stage };
    const tv = createTVCatalogue(app, tvDefaults).channels;
    const radio = createRadioCatalogue(app, radioDefaults).radios;
    for (const [items, loaded] of [[data.tv, tv], [data.radio, radio]]) {
      for (const item of items) {
        const station = loaded.find(c => c.id === item.id);
        if (!station || (Object.hasOwn(item, 'number') && (station.number ?? null) !== (item.number ?? null))) throw Error(`Invalid catalogue entry: ${item.id}`);
      }
    }
    const numbers = new Map();
    for (const station of [...tv, ...radio]) {
      if (station.number == null) continue;
      if (numbers.has(station.number)) throw Error(`Channel number ${station.number} is already assigned to ${numbers.get(station.number)}`);
      numbers.set(station.number, station.name);
    }
    const preferences = createPreferences(app, tv, radio).validate(data.preferences);
    if (JSON.stringify(preferences.lastStation) !== JSON.stringify(data.preferences.lastStation) && data.preferences.lastStation != null) throw Error('Invalid last station');
    if (!['auto','en','it','fr','de'].includes(data.preferences.language)) throw Error('Invalid language');
    if (!object(data.preferences.tvPlayback) || Object.entries(data.preferences.tvPlayback).some(([id, mode]) => preferences.tvPlayback[id] !== mode)) throw Error('Invalid playback preference');
    return { preferences, tv: data.tv, radio: data.radio };
  }
  finally { fs.rmSync(stage, { recursive: true, force: true }); }
}

function importConfig(profile, data) {
  fs.mkdirSync(profile, { recursive: true });
  const backup = fs.mkdtempSync(path.join(profile, 'import-backup-'));
  const stage = fs.mkdtempSync(path.join(profile, 'import-stage-'));
  const moved = [], installed = [];
  try {
    [data.preferences, data.tv, data.radio].forEach((value, i) => writeJSON(path.join(stage, names[i]), value));
    for (const name of names.flatMap(n => [n, n + '.tmp'])) {
      const source = path.join(profile, name);
      if (fs.existsSync(source)) {
        fs.renameSync(source, path.join(backup, name));
        moved.push(name);
      }
    }
    for (const name of names) {
      fs.renameSync(path.join(stage, name), path.join(profile, name));
      installed.push(name);
    }
    return backup;
  }
  catch (error) {
    for (const name of installed) fs.rmSync(path.join(profile, name), { force: true });
    for (const name of moved.reverse()) fs.renameSync(path.join(backup, name), path.join(profile, name));
    throw error;
  }
  finally { fs.rmSync(stage, { recursive: true, force: true }); }
}

module.exports = { exportConfig, readConfig, validateConfig, importConfig };
