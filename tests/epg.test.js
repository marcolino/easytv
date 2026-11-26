'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { gzipSync } = require('node:zlib');
const { timestamp, parseXmltv, nowNext, refresh } = require('../src/epg');

const xml = `<?xml version="1.0"?><!DOCTYPE tv SYSTEM "xmltv.dtd"><tv>
<channel id="rai1"><display-name>Rai 1</display-name></channel>
<programme channel="rai1" start="20261126200000 +0100" stop="20261126203000 +0100"><title lang="it">News &amp; sport</title><desc><![CDATA[A < B]]></desc></programme>
<programme channel="rai1" start="20261126203000 +0100" stop="20261126210000 +0100"><title>Film</title></programme></tv>`;

test('XMLTV timezones and programme boundaries', () => {
  assert.equal(timestamp('20261126200000 +0100'), Date.parse('2026-11-26T19:00:00Z'));
  assert.throws(() => timestamp('20260230200000 +0100'));
  const guide = parseXmltv(xml);
  const result = nowNext(guide, 'rai1', Date.parse('2026-11-26T19:15:00Z'));
  assert.equal(result.current.title[0].text, 'News & sport');
  assert.equal(result.current.desc[0].text, 'A < B');
  assert.equal(result.next.title[0].text, 'Film');
  assert.equal(nowNext(guide, 'rai1', result.current.stop).current.title[0].text, 'Film');
});

test('gzip and malformed or unsafe XML', () => {
  assert.deepEqual(parseXmltv(gzipSync(xml)), parseXmltv(xml));
  assert.throws(() => parseXmltv('<!DOCTYPE tv [<!ENTITY x SYSTEM "file:///etc/passwd">]><tv/>'));
  assert.throws(() => parseXmltv('<tv><channel></tv>'));
});

test('refresh preserves previous cache on failure', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'epg-test-'));
  const cachePath = path.join(dir, 'guide.json');
  try {
    await refresh({ url: 'https://example.test/guide.xml', cachePath, fetchImpl: async () => new Response(xml) });
    const old = await fs.readFile(cachePath, 'utf8');
    await assert.rejects(refresh({ url: 'https://example.test/guide.xml', cachePath, fetchImpl: async () => new Response('<broken>') }));
    assert.equal(await fs.readFile(cachePath, 'utf8'), old);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('invalid programme records do not discard valid schedules', () => {
  const guide = parseXmltv(xml.replace('</tv>', `<programme channel="rai1" start="20261126210000 +0100"><title>Missing end</title></programme>
<programme channel="rai1" start="20261126210000 +0100" stop="20261126210000 +0100"><title>Zero duration</title></programme>
<programme channel="rai1" start="20261126210000 +0100" stop="20261126220000 +0100" />
</tv>`));
  assert.equal(guide.programmes.length, 2);
  assert.equal(guide.diagnostics.skipped, 3);
});
