#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '../src/config/build-info.json');
const info = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!Number.isSafeInteger(info.build) || info.build < 0) {
  throw new Error('Invalid build number');
}
info.build++;
fs.writeFileSync(file, JSON.stringify(info, null, 2) + '\n');
console.log(`EasyTV build ${info.build}`);
