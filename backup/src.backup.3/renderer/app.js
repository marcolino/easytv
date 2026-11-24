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
  b.title = `${channel.name} — canale ${channel.number}`;
  b.setAttribute('aria-label', b.title);
  const logo = element('img', 'channel-logo');
  logo.src = `../../assets/icons/${channel.logo}`;
  logo.alt = channel.name;
  logo.draggable = false;
  logo.addEventListener('load', scheduleFit, { once: true });
  const keys = element('span', 'channel-number');
  for (const digit of String(channel.number)) keys.append(element('kbd', 'channel-key', digit));
  b.append(logo, keys);
  return b;
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
    // Radio playback will be introduced in Phase 2; no inert radio buttons on Home.
    if (group.type === 'radio' || !stations.length) continue;
    const section = element('section', 'group');
    const heading = element('h2', '', group.name);
    const grid = element('div', 'channels');
    for (const station of stations) {
      grid.append(channelButton(station));
    }
    section.append(heading, grid);
    home.append(section);
  }
  if (!home.children.length) home.append(element('p', 'settings-description',
    'Nessun canale preferito visibile. Apri le impostazioni per selezionarne uno.'));
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
        if (selected.length >= 10) {
          message.textContent = `Massimo 10 preferiti ${type === 'tv' ? 'TV' : 'radio'}.`;
          return;
        }
        selected.push(station.id);
      }
      star.textContent = selected.includes(station.id) ? '★' : '☆';
      star.classList.toggle('favorite', selected.includes(station.id));
      star.setAttribute('aria-pressed', String(selected.includes(station.id)));
      message.textContent = '';
    }, 'star-button');
    star.classList.toggle('favorite', selected.includes(station.id));
    star.setAttribute('aria-pressed', String(selected.includes(station.id)));
    star.setAttribute('aria-label', `Preferito: ${station.name}`);
    item.append(star, element('span', '', `${station.number ?? ''} ${station.name}`.trim()));
    holder.append(item);
  }
}
function renderGroups(focusIndex = -1) {
  groupEditor.replaceChildren();
  draft.groups.forEach((group, index) => {
    const baseline = groupSnapshots.get(group.id);
    const card = element('section', 'group-editor');
    const top = element('div', 'group-editor-top');
    const name = element('input', 'group-name');
    name.type = 'text'; name.maxLength = 80; name.value = group.name;
    name.setAttribute('aria-label', 'Nome gruppo');
    name.addEventListener('input', () => { group.name = name.value; updateActions(); });
    const kind = element('span', 'group-type', group.type.toUpperCase());
    top.append(name, kind);
    const controls = element('div', 'group-controls');
    const visibleLabel = element('label', 'visible-label');
    const visible = element('input');
    visible.type = 'checkbox'; visible.checked = group.visible;
    visible.addEventListener('change', () => { group.visible = visible.checked; updateActions(); });
    visibleLabel.append(visible, document.createTextNode(' Mostra nella Home'));
    controls.append(visibleLabel);
    const move = direction => {
      const other = index + direction;
      if (other < 0 || other >= draft.groups.length) return;
      [draft.groups[index], draft.groups[other]] = [draft.groups[other], draft.groups[index]];
      renderGroups(other);
    };
    controls.append(button('↑', () => move(-1)));
    controls.append(button('↓', () => move(1)));
    controls.append(button('Elimina', () => {
      if (!window.confirm(`Eliminare il gruppo "${group.name}"?`)) return;
      groupSnapshots.delete(group.id);
      draft.groups.splice(index, 1);
      renderGroups(Math.min(index, draft.groups.length - 1));
    }, 'delete-group'));
    const localCancel = button('Annulla', () => {
      if (baseline) draft.groups[index] = structuredClone(baseline);
      else draft.groups.splice(index, 1);
      renderGroups(Math.min(index, draft.groups.length - 1));
    });
    const localSave = button('Salva', () => {
      if (!group.name.trim()) { name.focus(); return; }
      group.name = group.name.trim();
      groupSnapshots.set(group.id, structuredClone(group));
      renderGroups(index);
    }, 'save-group');
    function updateActions() {
      const dirty = !baseline || JSON.stringify(group) !== JSON.stringify(baseline);
      localCancel.hidden = localSave.hidden = !dirty;
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
    if (!catalogue.length) members.append(element('span', 'settings-description', 'Catalogo radio disponibile nella fase 2.'));
    card.append(top, controls, members);
    groupEditor.append(card);
  });
  if (focusIndex >= 0) groupEditor.querySelectorAll('.group-name')[focusIndex]?.focus();
  scheduleFit();
}
function addGroup(type) {
  const id = `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  draft.groups.push({ id, name: type === 'tv' ? 'NUOVO GRUPPO TV' : 'NUOVO GRUPPO RADIO',
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
  document.getElementById('subtitle').textContent = 'Impostazioni';
  message.textContent = '';
  renderCatalogue('tv', tvs);
  renderCatalogue('radio', radios);
  renderGroups();
  back.focus();
  scheduleFit();
}
function closeSettings() {
  if (saving) return;
  editing = false;
  window.easyTV.setSettingsScreenOpen(false);
  page.hidden = true;
  home.hidden = false;
  document.getElementById('subtitle').textContent = 'Scegli il canale da guardare';
  draft = null;
  renderHome();
  gear.focus();
}
async function saveSettings() {
  if (draft.groups.some(g => !g.name.trim())) {
    message.textContent = 'Ogni gruppo deve avere un nome.';
    return;
  }
  saving = true;
  save.disabled = true;
  back.disabled = true;
  try {
    saved = await window.easyTV.savePreferences(draft);
    saving = false;
    closeSettings();
  } catch (error) {
    console.error('EasyTV settings:', error);
    message.textContent = `Errore: ${error.message}`;
  } finally {
    saving = false;
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
  const [channels, info, preferences] = await Promise.all([
    window.easyTV.getChannels(), window.easyTV.getAppInfo(), window.easyTV.getPreferences()
  ]);
  tvs = channels;
  saved = preferences;
  document.getElementById('app-version').textContent = `${info.version} · build ${info.build}`;
  document.title = `EasyTV ${info.version} · build ${info.build}`;
  power.title = info.tvset ? 'Spegni il dispositivo' : 'Esci da EasyTV';
  power.setAttribute('aria-label', power.title);
  gear.title = 'Impostazioni (F2)';
  power.title += ' (F10)';
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
    } catch (error) { window.alert(`Errore: ${error.message}`); }
    finally { power.disabled = false; }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'F2' && !event.repeat) { event.preventDefault(); gear.click(); return; }
    if (event.key === 'F10' && !event.repeat) { event.preventDefault(); power.click(); return; }
    if (editing && event.key === 'Escape') { event.preventDefault(); closeSettings(); return; }
    handleHomeArrows(event);
  });
  window.easyTV.onMainFullscreenChanged(scheduleFit);
  window.addEventListener('resize', scheduleFit);
  renderHome();
  document.fonts?.ready?.then(scheduleFit);
}
initialize().catch(error => console.error('EasyTV initialization:', error));
