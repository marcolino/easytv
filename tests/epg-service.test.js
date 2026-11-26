'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createEPGService, resolveChannel } = require('../src/epg-service');

const xml = '<tv><channel id="Rai1.it"><display-name>Rai1</display-name></channel><programme channel="Rai1.it" start="20261126200000 +0100" stop="20261126203000 +0100"><title>TG1</title></programme></tv>';

test('EPG service maps channels, coalesces refreshes and reloads cache offline', async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'epg-service-'));
  const config = { url: 'https://example.org/guide', channelMap: { rai1: 'Rai1.it' } };
  let calls = 0;
  const service = createEPGService(profile, config, { fetchImpl: async () => { calls++; return new Response(xml); } });
  const offline = createEPGService(profile, config, { fetchImpl: async () => { throw Error('offline'); } });
  try {
    await Promise.all([service.update(), service.update()]);
    assert.equal(calls, 1);
    assert.equal(service.status().programmes, 1);
    const now = Date.parse('2026-11-26T19:15:00Z');
    assert.equal(service.programmes({ id: 'rai1', name: 'Rai 1' }, now).current.title[0].text, 'TG1');
    assert.equal(service.programmes({ id: 'custom', name: 'Rai 1' }, now).current.title[0].text, 'TG1');
    assert.equal(service.programmes({ service: true, name: 'Rai 1' }, now).current, null);
    await offline.start();
    assert.equal(offline.status().programmes, 1);
    await offline.update();
    assert.equal(offline.status().error, 'offline');
    assert.equal(offline.status().programmes, 1);
    assert.equal(resolveChannel({ channels: [{ id: 'a', names: [{ text: 'Rai 1' }] }, { id: 'b', names: [{ text: 'Rai1' }] }] }, { name: 'Rai 1' }), null);
  }
  finally { service.stop(); offline.stop(); await fs.rm(profile, { recursive: true, force: true }); }
});
