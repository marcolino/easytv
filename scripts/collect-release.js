const fs = require('node:fs');
const path = require('node:path');
const [platform, arch] = process.argv.slice(2);
const extensions = { linux: ['.deb', '.AppImage'], windows: ['.exe'], macos: ['.dmg', '.zip'] };
if (!extensions[platform] || !['x64', 'arm64'].includes(arch)) throw new Error('Invalid platform or architecture');
const version = require('../package.json').version;
fs.mkdirSync('release-assets', { recursive: true });
for (const ext of extensions[platform]) {
  const matches = fs.readdirSync('dist', { withFileTypes: true }).filter(f => f.isFile() && f.name.endsWith(ext));
  if (matches.length !== 1) throw new Error(`Expected one ${ext} package, found ${matches.length}`);
  const destination = path.join('release-assets', `EasyTV-${version}-${platform}-${arch}${ext}`);
  fs.copyFileSync(path.join('dist', matches[0].name), destination);
  console.log(destination);
}
