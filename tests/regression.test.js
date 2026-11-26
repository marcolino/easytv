const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createPreferences } = require('../src/preferences');
const { resetProfile } = require('../src/reset-profile');
const transfer = require('../src/config-transfer');
const tv = [...require('../src/config/tvs.json'), ...require('../src/config/services.json')];
const radio = require('../src/config/radios.json');

function profile(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'easytv-regression-'));
  try { run(dir, { getPath: () => dir }); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('factory catalogue has unique IDs and channel numbers', () => {
  const stations = [...tv, ...radio];
  assert.equal(new Set(stations.map(s => s.id)).size, stations.length);
  const numbers = stations.map(s => s.number).filter(n => n != null);
  assert.equal(new Set(numbers).size, numbers.length);
  assert.ok(numbers.every(n => Number.isInteger(n) && n >= 0 && n <= 9999));
});

test('explicit playback modes and last station survive restart', () => profile((dir, app) => {
  const prefs = createPreferences(app, tv, radio);
  const channel = tv.find(s => s.url && s.directUrl);
  assert.ok(channel);
  for (const mode of ['web', 'direct', 'auto']) {
    const next = prefs.get();
    next.tvPlayback[channel.id] = mode;
    prefs.update(next);
    prefs.remember('tv', channel.id);
    const loaded = createPreferences(app, tv, radio).get();
    assert.equal(loaded.tvPlayback[channel.id], mode);
    assert.deepEqual(loaded.lastStation, { type: 'tv', id: channel.id });
  }
  prefs.remember('radio', radio[0].id);
  assert.deepEqual(createPreferences(app, tv, radio).get().lastStation, { type: 'radio', id: radio[0].id });
}));

test('factory reset preserves browser session and restores defaults', () => profile((dir, app) => {
  const prefs = createPreferences(app, tv, radio);
  const defaults = prefs.get();
  prefs.remember('radio', radio[0].id);
  fs.writeFileSync(path.join(dir, 'Cookies'), 'session');
  fs.writeFileSync(path.join(dir, 'logo-cache.json'), '{}');
  const backup = resetProfile(dir);
  assert.ok(fs.existsSync(path.join(backup, 'settings.json')));
  assert.ok(fs.existsSync(path.join(backup, 'logo-cache.json')));
  assert.equal(fs.readFileSync(path.join(dir, 'Cookies'), 'utf8'), 'session');
  assert.deepEqual(createPreferences(app, tv, radio).get(), defaults);
}));

test('import rolls back after an injected installation failure', () => profile((dir, app) => {
  const prefs = createPreferences(app, tv, radio);
  const data = transfer.validateConfig(transfer.exportConfig(dir, prefs.get()), tv, radio);
  const names = ['settings.json', 'tv-catalogue.json', 'radio-catalogue.json'];
  for (const name of names) fs.writeFileSync(path.join(dir, name), `old ${name}`);
  const rename = fs.renameSync;
  let injected = false;
  fs.renameSync = (from, to) => {
    if (!injected && path.basename(path.dirname(from)).startsWith('import-stage-') && path.basename(to) === names[1]) {
      injected = true;
      throw new Error('simulated write failure');
    }
    return rename(from, to);
  };
  try { assert.throws(() => transfer.importConfig(dir, data), /simulated write failure/); }
  finally { fs.renameSync = rename; }
  assert.ok(injected);
  for (const name of names) assert.equal(fs.readFileSync(path.join(dir, name), 'utf8'), `old ${name}`);
}));
