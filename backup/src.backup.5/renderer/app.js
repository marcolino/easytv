const shell = document.getElementById('app-shell');
const home = document.getElementById('channels');
const page = document.getElementById('settings-page');
const gear = document.getElementById('settings-button');
const power = document.getElementById('power-button');
const back = document.getElementById('back-button');
const save = document.getElementById('save-settings');
const message = document.getElementById('settings-message');
const groupEditor = document.getElementById('groups-editor');
let tvs = [];
let radios = [];
let saved = null;
let draft = null;
let editing = false;
let saving = false;
let groupSnapshots = new Map();
let layoutScheduled = false;
let localeData;
let appInfo;
const languageSelect = document.getElementById('language-select');
function t(key, values = {}) {
  const preference = (editing ? draft : saved)?.language || 'auto';
  const language = preference === 'auto' ? localeData.systemLanguage : preference;
  const text = localeData.dictionaries[language]?.[key] || localeData.dictionaries.en[key] || key.replace(/^\[[^\]]+\]\s*/, '');
  return text.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name]) : match);
}
function applyLanguage() {
  const preference = (editing ? draft : saved)?.language || 'auto';
  document.documentElement.lang = preference === 'auto' ? localeData.systemLanguage : preference;
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  document.getElementById('subtitle').textContent = editing ? t('Settings') : t('Choose a channel to watch');
  gear.title = t('Settings') + ' (F2)';
  gear.setAttribute('aria-label', gear.title);
  power.title = t(appInfo.tvset ? 'Shut down the device' : 'Exit EasyTV') + ' (F10)';
  power.setAttribute('aria-label', power.title);
  languageSelect.replaceChildren();
  for (const [code, label] of [['auto', t('Automatic') + ' (' + localeData.languages[localeData.systemLanguage] + ')'], ...Object.entries(localeData.languages)]) {
    const option = element('option', '', label); option.value = code; languageSelect.append(option);
  }
  languageSelect.value = preference;
  window.easyTV.previewLanguage(editing ? preference : null);
  if (editing) { renderCatalogue('tv', tvs); renderCatalogue('radio', radios); renderGroups(); }
  renderHome();
  scheduleFit();
}

function element(tag, className = '', text = null) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== null) el.textContent = text;
  return el;
}

function button(label, action, className = '') {
  const b = element('button', className, label);
  b.type = 'button';
  b.addEventListener('click', action);
  return b;
}

function fitLayout() {
  shell.style.zoom = '1';
  const margin = 12;
  const scale = Math.max(0.01, Math.min(
    (window.innerWidth - margin * 2) / shell.scrollWidth,
    (window.innerHeight - margin * 2) / shell.scrollHeight
  ));
  shell.style.zoom = String(scale);
}

function scheduleFit() {
  if (layoutScheduled) return;
  layoutScheduled = true;
  requestAnimationFrame(() => { layoutScheduled = false; fitLayout(); });
}

function channelButton(channel) {
  const b = button('', () => window.easyTV.openChannel(channel.id), 'channel');
  b.title = t('{name} — channel {number}', {name: channel.name, number: channel.number});
  b.setAttribute('aria-label', b.title);
  const logo = element('img', 'channel-logo');
  logo.src = `../../assets/icons/${channel.logo}`;
  logo.alt = channel.name;
  logo.draggable = false;
  logo.addEventListener('load', scheduleFit, { once: true });
  logo.addEventListener('error', () => { logo.replaceWith(element('span', 'channel-fallback', channel.name)); scheduleFit(); }, { once: true });
  const keys = element('span', 'channel-number');
  for (const digit of String(channel.number)) keys.append(element('kbd', 'channel-key', digit));
  b.append(logo, keys);
  return b;
}

function radioButton(station) {
  const b = button(station.name, () => window.easyTV.openRadio(station.id), 'channel');
  if (station.logo) { const img=element('img','channel-logo'); img.src= /^https?:\/\//i.test(station.logo) ? station.logo : `../../assets/icons/${station.logo}`; img.alt=''; img.addEventListener('error',()=>img.remove()); b.prepend(img); }
  return b;
}
let radioOffset=0;
let radioQuery={};
async function searchRadio(next=false) {
  const status=document.getElementById('radio-status');
  const holder=document.getElementById('radio-results');
  const more=document.getElementById('radio-more');
  const search=document.getElementById('radio-search');
  search.disabled=more.disabled=true;
  if(!next){radioOffset=0;radioQuery={name:document.getElementById('radio-name').value,country:document.getElementById('radio-country').value,genre:document.getElementById('radio-genre').value};}
  try {
    const result=await window.easyTV.searchRadios({...radioQuery,offset:radioOffset});
    if(!editing)return;
    holder.replaceChildren();
    for(const station of result.stations){
      const row=element('div','catalogue-item');
      const add=button(t('Add to favorites'),async()=>{
        if(!editing||saving)return;
        try {const r=await window.easyTV.addRadio(station.id);if(!editing||saving)return;if(!radios.some(x=>x.id===r.id))radios.push(r);
          if(!draft.favorites.radio.includes(r.id))draft.favorites.radio.push(r.id);
          let g=draft.groups.find(x=>x.type==='radio'&&x.visible);
          if(!g){g={id:'radio-'+Date.now(),name:t('Radio'),type:'radio',visible:true,stationIds:[]};draft.groups.push(g);}
          if(!g.stationIds.includes(r.id))g.stationIds.push(r.id);
          renderCatalogue('radio',radios);renderGroups();add.disabled=true;
        }catch(e){status.textContent=t('Error: {message}',{message:e.message});}
      });
      row.append(element('span','',station.name+' · '+station.genre.slice(0,80)),add,button(t('Preview'),async()=>{try{const r=await window.easyTV.addRadio(station.id);if(!radios.some(x=>x.id===r.id))radios.push(r);renderCatalogue('radio',radios);renderGroups();await window.easyTV.openRadio(r.id,true);}catch(e){status.textContent=t('Error: {message}',{message:e.message});}}));holder.append(row);
    }
    radioOffset+=30;more.hidden=!result.more;status.textContent=result.stations.length?'':t('No stations found.');
  }catch(e){status.textContent=t('Error: {message}',{message:e.message});}finally{search.disabled=more.disabled=false;}
}
function renderHome() {
  home.replaceChildren();
  for (const group of saved.groups) {
    if (!group.visible) continue;
    const catalogue = group.type === 'tv' ? tvs : radios;
    const favorites = new Set(saved.favorites[group.type]);
    const stations = group.stationIds
      .filter(id => favorites.has(id))
      .map(id => catalogue.find(s => s.id === id)).filter(Boolean);
    if (!stations.length) continue;
    const section = element('section', 'group');
    const heading = element('h2', '', group.name);
    const grid = element('div', 'channels');
    for (const station of stations) {
      grid.append(group.type === 'radio' ? radioButton(station) : channelButton(station));
    }
    section.append(heading, grid);
    home.append(section);
  }
  if (!home.children.length) home.append(element('p', 'settings-description',
    t('No visible favorite channels. Open Settings to select one.')));
  scheduleFit();
}

function renderCatalogue(type, catalogue) {
  const holder = document.getElementById(`${type}-catalogue`);
  holder.replaceChildren();
  const selected = draft.favorites[type];
  for (const station of catalogue) {
    const item = element('div', 'catalogue-item');
    const star = button(selected.includes(station.id) ? '★' : '☆', () => {
      const index = selected.indexOf(station.id);
      if (index >= 0) selected.splice(index, 1);
      else {
        selected.push(station.id);
      }
      star.textContent = selected.includes(station.id) ? '★' : '☆';
      star.classList.toggle('favorite', selected.includes(station.id));
      star.setAttribute('aria-pressed', String(selected.includes(station.id)));
      message.textContent = '';
      updateToolbar();
    }, 'star-button');
    star.classList.toggle('favorite', selected.includes(station.id));
    star.setAttribute('aria-pressed', String(selected.includes(station.id)));
    star.setAttribute('aria-label', t('Favorite: {name}', {name: station.name}));
    item.append(star, element('span', '', `${station.number ?? ''} ${station.name}`.trim()));
    if(type==='radio') item.append(button(t('Preview'),()=>window.easyTV.openRadio(station.id,true))); 
    holder.append(item);
  }
}

function updateToolbar() {
  if (!draft) return;
  const normalize = value => JSON.stringify({
    language: value.language || 'auto',
    favorites: Object.fromEntries(Object.entries(value.favorites).map(([k,v]) => [k,[...v].sort()])),
    groups: value.groups.map(g => ({...g, stationIds: [...g.stationIds].sort()}))
  });
  const dirty = normalize(draft) !== normalize(saved);
  back.hidden = !dirty;
  save.textContent = dirty ? t('Save') : t('Back to TV');
  save.classList.toggle('clean', !dirty);
}

function renderGroups(focusIndex = -1) {
  groupEditor.replaceChildren();
  draft.groups.forEach((group, index) => {
    const baseline = groupSnapshots.get(group.id);
    const card = element('section', 'group-editor');
    const top = element('div', 'group-editor-top');
    const name = element('input', 'group-name');
    name.type = 'text'; name.maxLength = 80; name.value = group.name;
    name.setAttribute('aria-label', t('Group name'));
    name.addEventListener('input', () => { group.name = name.value; updateActions(); });
    const kind = element('span', 'group-type', t(group.type === 'tv' ? 'TV' : 'Radio').toUpperCase());
    top.append(name, kind);
    const controls = element('div', 'group-controls');
    const visibleLabel = element('label', 'visible-label');
    const visible = element('input');
    visible.type = 'checkbox'; visible.checked = group.visible;
    visible.addEventListener('change', () => { group.visible = visible.checked; updateActions(); });
    visibleLabel.append(visible, document.createTextNode(' ' + t('Show on Home')));
    controls.append(visibleLabel);
    const move = direction => {
      const other = index + direction;
      if (other < 0 || other >= draft.groups.length) return;
      [draft.groups[index], draft.groups[other]] = [draft.groups[other], draft.groups[index]];
      renderGroups(other);
    };
    const up = button('↑', () => move(-1)); up.setAttribute('aria-label', t('Move up')); controls.append(up);
    const down = button('↓', () => move(1)); down.setAttribute('aria-label', t('Move down')); controls.append(down);
    controls.append(button(t('Delete'), () => {
      if (!window.confirm(t('Delete the group "{name}"?', {name: group.name}))) return;
      groupSnapshots.delete(group.id);
      draft.groups.splice(index, 1);
      renderGroups(Math.min(index, draft.groups.length - 1));
    }, 'delete-group'));
    const localCancel = button(t('Cancel'), () => {
      if (baseline) draft.groups[index] = structuredClone(baseline);
      else draft.groups.splice(index, 1);
      renderGroups(Math.min(index, draft.groups.length - 1));
    });
    const localSave = button(t('Save'), async () => {
      if (saving) return;

      if (!group.name.trim()) {
        name.focus();
        return;
      }

      group.name = group.name.trim();

      // Check whether there are pending changes unrelated
      // to the group currently being saved.
      const normalize = value => JSON.stringify({
        language: value.language || 'auto',
    favorites: Object.fromEntries(
          Object.entries(value.favorites).map(
            ([k, v]) => [k, [...v].sort()]
          )
        ),
        groups: value.groups
          .filter(g => g.id !== group.id)
          .map(g => ({
            ...g,
            stationIds: [...g.stationIds].sort()
          }))
      });

      const otherChanges = normalize(draft) !== normalize(saved);

      // Start from the persistent preferences, not the draft.
      // This avoids saving unrelated pending modifications.
      const updated = structuredClone(saved);
      const savedGroup = structuredClone(group);

      const existingIndex = updated.groups.findIndex(
        g => g.id === group.id
      );

      if (existingIndex >= 0) {
        updated.groups[existingIndex] = savedGroup;
      } else {
        updated.groups.push(savedGroup);
      }

      saving = true;
      page.inert = true;
      localSave.disabled = true;
      localCancel.disabled = true;
      save.disabled = true;
      back.disabled = true;

      try {
        saved = await window.easyTV.savePreferences(updated);

        const persistedGroup = saved.groups.find(
          g => g.id === group.id
        );

        groupSnapshots.set(
          group.id,
          structuredClone(persistedGroup)
        );

        if (!otherChanges) {
          // Everything is now saved. Synchronize the entire draft
          // with the persistent, normalized preferences.
          draft = structuredClone(saved);

          groupSnapshots = new Map(
            draft.groups.map(g => [
              g.id,
              structuredClone(g)
            ])
          );

          renderCatalogue('tv', tvs);
          renderCatalogue('radio', radios);

        } else {
          // Preserve unrelated unsaved modifications.
          draft.groups[index] = structuredClone(persistedGroup);
        }
        
        message.textContent = t('Group saved.');

        renderGroups(index);
        renderHome();
        updateToolbar();
      } catch (error) {
        console.error('EasyTV group save:', error);
        message.textContent = t('Error: {message}', {message: error.message});
      } finally {
        saving = false;
        page.inert = false;
        localSave.disabled = false;
        localCancel.disabled = false;
        save.disabled = false;
        back.disabled = false;
      }
    }, 'save-group');
    function updateActions() {
      const dirty = !baseline || JSON.stringify(group) !== JSON.stringify(baseline);
      localCancel.hidden = localSave.hidden = !dirty;
      updateToolbar();
    }
    controls.append(localCancel, localSave);
    updateActions();
    const members = element('div', 'members');
    const catalogue = group.type === 'tv' ? tvs : radios;
    for (const station of catalogue) {
      const label = element('label', 'member-choice');
      const check = element('input');
      check.type = 'checkbox'; check.checked = group.stationIds.includes(station.id);
      check.addEventListener('change', () => {
        if (check.checked && !group.stationIds.includes(station.id)) group.stationIds.push(station.id);
        if (!check.checked) group.stationIds = group.stationIds.filter(id => id !== station.id);
        updateActions();
      });
      label.append(check, document.createTextNode(` ${station.name}`));
      members.append(label);
    }
    if (!catalogue.length) members.append(element('span', 'settings-description', t('No stations found.')));
    card.append(top, controls, members);
    groupEditor.append(card);
  });
  updateToolbar();
  if (focusIndex >= 0) groupEditor.querySelectorAll('.group-name')[focusIndex]?.focus();
  scheduleFit();
}

function addGroup(type) {
  const id = `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  draft.groups.push({ id, name: type === 'tv' ? t('New TV group') : t('New radio group'),
    type, visible: true, stationIds: [] });
  renderGroups(draft.groups.length - 1);
}

function openSettings() {
  draft = structuredClone(saved);
  groupSnapshots = new Map(draft.groups.map(g => [g.id, structuredClone(g)]));
  document.getElementById("groups-panel").open = false;
  editing = true;
  window.easyTV.setSettingsScreenOpen(true);
  home.hidden = true;
  page.hidden = false;
  document.getElementById('subtitle').textContent = t('Settings');
  message.textContent = '';
  renderCatalogue('tv', tvs);
  renderCatalogue('radio', radios);
  renderGroups();
  updateToolbar();
  applyLanguage();
  save.focus();
  scheduleFit();
}

function closeSettings() {
  if (saving) return;
  editing = false;
  window.easyTV.setSettingsScreenOpen(false);
  page.hidden = true;
  home.hidden = false;
  document.getElementById('subtitle').textContent = t('Choose a channel to watch');
  draft = null;
  applyLanguage();
  gear.focus();
}

async function saveSettings() {
  if (saving) return;
  if (back.hidden) { closeSettings(); return; }
  if (draft.groups.some(g => !g.name.trim())) {
    message.textContent = t('Every group must have a name.');
    return;
  }
  saving = true;
  page.inert = true;
  save.disabled = true;
  back.disabled = true;
  try {
    saved = await window.easyTV.savePreferences(draft);
    saving = false;
    closeSettings();
  } catch (error) {
    console.error('EasyTV settings:', error);
    message.textContent = t('Error: {message}', {message: error.message});
  } finally {
    saving = false;
    page.inert = false;
    save.disabled = false;
    back.disabled = false;
    if (editing) save.focus();
  }
}

function handleHomeArrows(event) {
  if (editing || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
  const target = event.target.closest?.('.channel');
  if (!target) return;
  const buttons = [...home.querySelectorAll('.channel')];
  const index = buttons.indexOf(target);
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 }[event.key];
  const next = index + step;
  if (next >= 0 && next < buttons.length) { event.preventDefault(); buttons[next].focus(); }
}

async function initialize() {
  const [channels, info, preferences, i18n] = await Promise.all([
    window.easyTV.getChannels(), window.easyTV.getAppInfo(), window.easyTV.getPreferences(), window.easyTV.getI18n()
  ]);
  tvs = channels;
  radios = await window.easyTV.getRadios();
  document.getElementById('radio-search').addEventListener('click',()=>searchRadio());
  document.getElementById('radio-more').addEventListener('click',()=>searchRadio(true));
  saved = preferences;
  localeData = i18n;
  appInfo = info;
  languageSelect.addEventListener('change', () => { if (saving) { languageSelect.value = draft.language; return; } draft.language = languageSelect.value; message.textContent = ''; applyLanguage(); updateToolbar(); });
  document.getElementById('app-version').textContent = `${info.version} · build ${info.build}`;
  document.title = `EasyTV ${info.version} · build ${info.build}`;
  gear.addEventListener('click', () => editing ? closeSettings() : openSettings());
  back.addEventListener('click', closeSettings);
  document.getElementById('add-tv-group').addEventListener('click', () => addGroup('tv'));
  document.getElementById('add-radio-group').addEventListener('click', () => addGroup('radio'));
  save.addEventListener('click', saveSettings);
  power.addEventListener('click', async () => {
    power.disabled = true;
    try {
      const result = await window.easyTV.requestPowerOff();
      if (result?.action === 'unsupported') window.alert(result.message);
    } catch (error) { window.alert(t('Error: {message}', {message: error.message})); }
    finally { power.disabled = false; }
  });
  document.addEventListener('keydown', event => {
    if (editing && event.key === 'Escape') { event.preventDefault(); closeSettings(); return; }
    handleHomeArrows(event);
  });
  window.easyTV.onSettingsShortcut(() => editing ? closeSettings() : openSettings());
  window.easyTV.onMainFullscreenChanged(scheduleFit);
  window.addEventListener('resize', scheduleFit);
  applyLanguage();
  document.fonts?.ready?.then(scheduleFit);
}

initialize().catch(error => console.error('EasyTV initialization:', error));
