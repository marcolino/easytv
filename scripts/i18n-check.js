const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', 'src');
const sync = process.argv.includes('--sync');
const prune = process.argv.includes('--prune');
const dryRun = process.argv.includes('--dry-run');
if (sync && prune) throw new Error('Use --sync and --prune separately');
const identicalOK = {it: ['Radio','TV'], fr: ['Radio','TV','Genre'], de: ['Radio','TV','Genre']};
const keys = new Set();
for (const file of ['main.js','renderer/app.js','renderer/index.html','renderer/radio.js','renderer/radio.html']) {
  const source = fs.readFileSync(path.join(root,file),'utf8');
  for (const m of source.matchAll(/\bt\(\s*(['"])(.*?)\1\s*[,)]|data-i18n="([^"]+)"/g)) keys.add(m[2] || m[3]);
}
// Conditional translation calls cannot be extracted by the literal scanner.
for (const key of ['TV','Radio','Shut down the device','Exit EasyTV']) keys.add(key);
const placeholders = s => [...s.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort().join(',');
let errors = 0;
for (const lang of ['en','it','fr','de']) {
  const file = path.join(root,'locales',lang+'.json');
  const data = JSON.parse(fs.readFileSync(file,'utf8'));
  for (const key of keys) {
    if (!Object.hasOwn(data,key)) {
      if (sync) data[key] = key.replace(/^\[[^\]]+\]\s*/, '');
      else { console.error(lang, 'missing:',key); errors++; continue; }
    }
    if (typeof data[key] !== 'string' || !data[key].trim() || placeholders(key) !== placeholders(data[key])) { console.error(lang,'invalid:',key); errors++; }
    else if (lang !== 'en' && data[key] === key && !identicalOK[lang]?.includes(key)) console.warn(lang,'identical to English (review):',key);
  }
  for (const key of Object.keys(data)) {
    if (keys.has(key)) continue;
    console.warn(lang, prune ? (dryRun ? 'would remove:' : 'removing:') : 'possibly unused:', key);
    if (prune && !dryRun) delete data[key];
  }
  if ((sync || prune) && !dryRun) fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
}
process.exitCode = errors ? 1 : 0;
