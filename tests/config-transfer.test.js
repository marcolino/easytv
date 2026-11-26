const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const transfer = require('../src/config-transfer');
const { createPreferences } = require('../src/preferences');
const tv = [...require('../src/config/tvs.json'), ...require('../src/config/services.json')];
const radio = require('../src/config/radios.json');

test('configuration round trip, backup, and validation', () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'easytv-test-'));
  try {
    const preferences = createPreferences({ getPath: () => profile }, tv, radio).get();
    const data = transfer.exportConfig(profile, preferences);
    data.radio.push({ id: 'test-radio', name: 'Test', url: 'https://example.com/audio', number: 9999 });
    data.preferences.favorites.radio.push('test-radio');
    const checked = transfer.validateConfig(data, tv, radio);
    fs.writeFileSync(path.join(profile, 'settings.json'), 'old');
    fs.writeFileSync(path.join(profile, 'Cookies'), 'keep');
    const backup = transfer.importConfig(profile, checked);
    assert.equal(fs.readFileSync(path.join(backup, 'settings.json'), 'utf8'), 'old');
    assert.equal(fs.readFileSync(path.join(profile, 'Cookies'), 'utf8'), 'keep');
    assert.deepEqual(transfer.exportConfig(profile, checked.preferences).radio, data.radio);
    assert.throws(() => transfer.validateConfig({ ...data, version: 2 }, tv, radio));
    assert.throws(() => transfer.validateConfig({ ...data, radio: [{ ...data.radio[0], number: 205 }] }, tv, radio));
    assert.throws(() => transfer.validateConfig({ ...data, radio: [{ ...data.radio[0], url: 'file:///etc/passwd' }] }, tv, radio));
    const file = path.join(profile, 'export.json');
    fs.writeFileSync(file, JSON.stringify(data));
    assert.deepEqual(transfer.readConfig(file), data);
  }
  finally { fs.rmSync(profile, { recursive: true, force: true }); }
});

test('service number overrides are applied before validation, independent of order', () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'easytv-test-'));
  try {
    const preferences = createPreferences({ getPath: () => profile }, tv, radio).get();
    const data = transfer.exportConfig(profile, preferences);
    data.tv = [{ id: 'service-paramount-plus', number: 108 }, { id: 'service-youtube', number: 103 }];
    assert.deepEqual(transfer.validateConfig(data, tv, radio).tv, data.tv);
    assert.deepEqual(transfer.validateConfig({ ...data, tv: [...data.tv].reverse() }, tv, radio).tv, [...data.tv].reverse());
    assert.throws(() => transfer.validateConfig({ ...data, tv: [{ id: 'service-paramount-plus', number: 108 }] }, tv, radio));
    const checked = transfer.validateConfig(data, tv, radio);
    transfer.importConfig(profile, checked);
    const { createTVCatalogue } = require('../src/tv-catalogue');
    const catalogue = createTVCatalogue({ getPath: () => profile }, tv);
    catalogue.save({ number: null }, 'service-youtube');
    const reloaded = createTVCatalogue({ getPath: () => profile }, tv);
    assert.equal(reloaded.channels.find(c => c.id === 'service-youtube').number, null);
    assert.equal(reloaded.channels.find(c => c.id === 'service-paramount-plus').number, 108);
  }
  finally { fs.rmSync(profile, { recursive: true, force: true }); }
});
