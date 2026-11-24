const fs = require('node:fs');
const path = require('node:path');
function station(raw) {
  const url = raw.url_resolved || raw.url;
  if (!/^https?:\/\//i.test(url || '') || !raw.stationuuid || !raw.name) return null;
  return {id: raw.stationuuid, name: raw.name.trim(), url, logo: /^https?:\/\//i.test(raw.favicon || '') ? raw.favicon : '', country: raw.country || '', genre: raw.tags || '', codec: raw.codec || '', bitrate: raw.bitrate || 0};
}
function createRadioCatalogue(app, defaults) {
  const file = path.join(app.getPath('userData'), 'radio-catalogue.json');
  const radios = [...defaults];
  try { for (const s of JSON.parse(fs.readFileSync(file,'utf8'))) if (!radios.some(r=>r.id===s.id)) radios.push(s); } catch(e) { if(e.code !== 'ENOENT') console.warn(e.message); }
  const results = new Map();
  async function search({name='', country='IT', genre='', offset=0}={}) {
    const params = new URLSearchParams({name:String(name).slice(0,100),countrycode:String(country).toUpperCase().slice(0,2),tag:String(genre).slice(0,100),offset:String(Math.max(0,Number(offset)||0)),limit:'30',hidebroken:'true',order:'clickcount',reverse:'true'});
    let error;
    for (const host of ['de1.api.radio-browser.info','nl1.api.radio-browser.info']) {
      try { const response = await fetch(`https://${host}/json/stations/search?${params}`,{headers:{'User-Agent':'EasyTV/1.0'},signal:AbortSignal.timeout(12000)}); if(!response.ok) throw Error(`HTTP ${response.status}`); const raw=await response.json(); const list=raw.map(station).filter(Boolean); for(const s of list) results.set(s.id,s); return {stations:list,more:raw.length===30}; } catch(e){error=e;}
    } throw error;
  }
  function add(id) { const existing=radios.find(s=>s.id===id); if(existing)return existing; const s=results.get(id); if(!s)throw Error('Unknown station'); const next=[...radios,s]; fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file+'.tmp',JSON.stringify(next,null,2)); fs.renameSync(file+'.tmp',file); radios.push(s); return s; }
  return {radios,search,add};
}
module.exports={createRadioCatalogue};
