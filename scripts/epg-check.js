'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { parseXmltv, refresh, nowNext } = require('../src/epg');

async function main() {
  const source = process.argv[2] || require('../src/config/epg.json').url;
  if (!source) throw new Error('Usage: node scripts/epg-check.js <XMLTV file or HTTPS URL> [XMLTV channel ID]');
  const guide = source.startsWith('https://')
    ? await refresh({ url: source, cachePath: path.join(os.tmpdir(), 'easytv-epg-' + process.pid, 'guide.json') })
    : await parseXmltv(await fs.readFile(source));
  console.log(`${guide.channels.length} channels, ${guide.programmes.length} programmes`);
  console.log("Skipped programmes:", JSON.stringify(guide.diagnostics, null, 2));
  if (!guide.programmes.length) throw new Error("No usable programmes");
  console.table(guide.channels.map(c => ({ id: c.id, name: c.names[0]?.text || '' })));
  if (process.argv[3]) console.log(JSON.stringify(nowNext(guide, process.argv[3]), null, 2));
}

main().catch(error => { console.error(error.message); if (error.cause) console.error(error.cause); process.exitCode = 1; });
