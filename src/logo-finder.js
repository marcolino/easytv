const fs = require('node:fs');
const path = require('node:path');

function createLogoFinder(app, fetcher = globalThis.fetch) {
  const file = path.join(app.getPath('userData'), 'logo-cache.json');
  let cache = {};
  try {
    cache = JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  catch {
  }
  const pending = new Map();
  const norm = s => String(s || '').normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();

  async function query(params) {
    const u = new URL('https://www.wikidata.org/w/api.php');
    u.search = new URLSearchParams({ ...params, format: 'json' });
    const r = await fetcher(u, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'EasyTV/1.0 (station logo lookup)' } });
    if (!r.ok)
      throw Error('Logo lookup HTTP ' + r.status);
    return r.json();
  }

  async function find(station, kind, force = false) {
    const name = String(station?.name || '').trim().slice(0, 120);
    if (!name || !['tv', 'radio'].includes(kind))
      return '';
    const country = String(station.country || '').slice(0, 80);
    const key = JSON.stringify([kind, norm(name), norm(country)]);
    const old = cache[key];
    if (!force && old && Date.now() - old.time < (old.url ? 30 : 1) * 86400000)
      return old.url;
    if (pending.has(key))
      return pending.get(key);
    if (pending.size >= 12)
      return '';
    const task = (async () => {
      const lang = /^(IT|Italy|Italia)$/i.test(country) ? 'it' : 'en';
      const aliases = [...new Set([name, name.replace(/\s+/g, ''), kind === 'radio' ? name.replace(/\s+Network$/i, '') + ' Network' : name])];
      const data = { search: [] };
      for (const alias of aliases) {
        try {
          const r = await query({ action: 'wbsearchentities', search: alias, language: lang, uselang: 'en', limit: '8' });
          for (const x of r.search || [])
            if (!data.search.some(y => y.id === x.id))
              data.search.push(x);
        }
        catch {
        }
      }
      const type = kind === 'radio' ? /radio (station|network|channel)|radio broadcaster/i : /television (channel|station|network)|tv (channel|station|network)/i;
      const matches = (data.search || []).filter(x => aliases.some(a => norm(x.label) === norm(a)) && type.test(x.description || '') && /^Q\d+$/.test(x.id));
      let url = '';
      for (const match of matches) {
        const result = await query({ action: 'wbgetentities', ids: match.id, props: 'claims' });
        const claims = result.entities?.[match.id]?.claims;
        const countries = { it: 'Q38', italy: 'Q38', italia: 'Q38', fr: 'Q142', france: 'Q142', de: 'Q183', germany: 'Q183', gb: 'Q145', uk: 'Q145', us: 'Q30' };
        const expected = countries[norm(country)];
        const actual = (claims?.P17 || []).map(c => c.mainsnak?.datavalue?.value?.id);
        const logo = (claims?.P154 || []).find(c => c.rank !== 'deprecated')?.mainsnak?.datavalue?.value;
        if (typeof logo === 'string' && (!expected || actual.includes(expected)))
          url = 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(logo);
        if (url)
          break;
      }
      if (!url && kind === 'radio') {
        for (const host of ['de1.api.radio-browser.info', 'nl1.api.radio-browser.info']) {
          try {
            const params = new URLSearchParams({ name, limit: '50', hidebroken: 'true' });
            const r = await fetcher('https://' + host + '/json/stations/search?' + params, { signal: AbortSignal.timeout(8000) });
            if (!r.ok)
              continue;
            const rows = await r.json();
            const countryNorm = x => ({ italy: 'it', italia: 'it', france: 'fr', germany: 'de', deutschland: 'de', unitedkingdom: 'gb' }[norm(x)] || norm(x));
            const candidates = rows.filter(x => aliases.some(a => norm(a) === norm(x.name)) && (!country || countryNorm(x.countrycode || x.country) === countryNorm(country)) && /^https:\/\//i.test(x.favicon || '') && x.favicon !== station.logo);
            if (candidates.length) {
              url = candidates[0].favicon;
              break;
            }
          }
          catch {
          }
        }
      }
      cache[key] = { url, time: Date.now() };
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file + '.tmp', JSON.stringify(cache));
        fs.renameSync(file + '.tmp', file);
      }
      catch {
      }
      return url;
    })().catch(() => '').finally(() => pending.delete(key));
    pending.set(key, task);
    return task;
  }
  return { find };
}
module.exports = { createLogoFinder };
