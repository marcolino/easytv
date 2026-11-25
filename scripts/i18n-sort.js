const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../src/locales');

function sort(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])]));
}

for (const name of ['en', 'it', 'fr', 'de', 'translation-overrides']) {
  const file = path.join(root, name + '.json');
  fs.writeFileSync(file, JSON.stringify(sort(JSON.parse(fs.readFileSync(file, 'utf8'))), null, 2) + '\n');
}
