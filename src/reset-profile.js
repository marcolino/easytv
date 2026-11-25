const fs = require('node:fs');
const path = require('node:path');

function resetProfile(profile) {
  const names = ['settings.json', 'tv-catalogue.json', 'radio-catalogue.json', 'logo-cache.json'];
  fs.mkdirSync(profile, { recursive: true });
  const backup = fs.mkdtempSync(path.join(profile, 'reset-backup-'));
  const moved = [];
  try {
    for (const name of names.flatMap(name => [name, name + '.tmp'])) {
      const source = path.join(profile, name);
      if (!fs.existsSync(source))
        continue;
      fs.renameSync(source, path.join(backup, name));
      moved.push(name);
    }
  }
  catch (error) {
    for (const name of moved.reverse())
      fs.renameSync(path.join(backup, name), path.join(profile, name));
    throw error;
  }
  return backup;
}

module.exports = { resetProfile };
