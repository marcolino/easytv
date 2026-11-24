const shell = document.getElementById('app-shell');
const home = document.getElementById('channels');
const page = document.getElementById('settings-page');
const gear = document.getElementById('settings-button');
const power = document.getElementById('power-button');
const back = document.getElementById('back-button');
const save = document.getElementById('save-settings');
const toast = document.getElementById('settings-message');
const toastText = document.getElementById('toast-text');
let toastTimer;

function notify(text, type = 'success') {
  clearTimeout(toastTimer);
  toast.hidden = !text;
  toastText.textContent = text;
  toast.dataset.type = type;
  if (text)
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, { success: 2500, info: 3000, warning: 4000, error: 6000 }[type] || 3000);
}

function undoToast(text, action) {
  const stack = document.getElementById('undo-stack');
  const card = element('div', 'undo-toast');
  const label = element('span', '', text);
  label.setAttribute('role', 'status');
  const undo = button(t('Undo deletion'), async () => {
    undo.disabled = true;
    try {
      await action();
      card.remove();
    }
    catch (e) {
      notify(t('Error: {message}', { message: e.message }), 'error');
      undo.disabled = false;
    }
  });
  const close = button('×', () => card.remove());
  tooltip(close, t('Close notification'));
  card.append(label, undo, close, element('div', 'undo-progress'));
  stack.append(card);
  setTimeout(() => card.remove(), 7000);
}

function restoreAt(list, id, index) {
  if (index >= 0 && !list.includes(id))
    list.splice(Math.min(index, list.length), 0, id);
}

function undoFavorite(type, id, index) {
  const d = draft;
  undoToast(t('Favorite removed.'), () => {
    if (draft !== d)
      throw Error(t('Settings session ended.'));
    restoreAt(d.favorites[type], id, index);
    renderCatalogue(type, type === 'tv' ? tvs : radios);
    renderGroups();
    renderRadioResults();
    renderTVResults();
    updateToolbar();
  });
}
const message = { set textContent(value) {
    notify(value);
  } };

function tooltip(b, label) {
  b.title = label;
  b.setAttribute('aria-label', label);
  return b;
}

function icon(b, kind) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', { play: 'M8 5 L19 12 L8 19 Z', edit: 'M16 3 L21 8 L8 21 L3 21 L3 16 Z M13 6 L18 11', trash: 'M3 6H21 M9 6V3H15V6 M5 6L6 21H18L19 6 M10 10V17 M14 10V17', clear: 'M6 6L18 18 M18 6L6 18' }[kind]);
  svg.append(path);
  b.prepend(svg);
  return b;
}
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
  for (const el of document.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
    if (el.tagName === 'BUTTON')
      tooltip(el, el.textContent);
  }
  for (const el of document.querySelectorAll('[data-i18n-title]'))
    tooltip(el, t(el.dataset.i18nTitle));
  document.getElementById('subtitle').textContent = editing ? t('Settings') : t('Choose a channel to watch');
  gear.title = t('Settings') + ' (F2)';
  gear.setAttribute('aria-label', gear.title);
  power.title = t(appInfo.tvset ? 'Shut down the device' : 'Exit EasyTV') + ' (F10)';
  power.setAttribute('aria-label', power.title);
  languageSelect.replaceChildren();
  for (const [code, label] of [['auto', t('Automatic') + ' (' + localeData.languages[localeData.systemLanguage] + ')'], ...Object.entries(localeData.languages)]) {
    const option = element('option', '', label);
    option.value = code;
    languageSelect.append(option);
  }
  languageSelect.value = preference;
  window.easyTV.previewLanguage(editing ? preference : null);
  if (editing) {
    renderCatalogue('tv', tvs);
    renderCatalogue('radio', radios);
    renderGroups();
    renderRadioResults();
    renderTVResults();
  }
  renderHome();
  scheduleFit();
}

function element(tag, className = '', text = null) {
  const el = document.createElement(tag);
  if (className)
    el.className = className;
  if (text !== null)
    el.textContent = text;
  return el;
}

function button(label, action, className = '') {
  const b = element('button', className, label);
  b.type = 'button';
  b.addEventListener('click', action);
  if (label)
    tooltip(b, label);
  return b;
}

function fitLayout() {
  shell.style.zoom = '1';
  const margin = 12;
  const scale = Math.max(0.01, Math.min((window.innerWidth - margin * 2) / shell.scrollWidth, (window.innerHeight - margin * 2) / shell.scrollHeight));
  shell.style.zoom = String(scale);
}

function scheduleFit() {
  if (layoutScheduled)
    return;
  layoutScheduled = true;
  requestAnimationFrame(() => {
    layoutScheduled = false;
    fitLayout();
  });
}

function channelButton(channel) {
  const b = button('', () => window.easyTV.openChannel(channel.id), 'channel');
  b.title = channel.number == null ? channel.name : t('{name} — channel {number}', { name: channel.name, number: channel.number });
  b.setAttribute('aria-label', b.title);
  const logo = radioLogo(channel, 'channel-logo', 'tv');
  const keys = element('span', 'channel-number');
  for (const digit of String(channel.number ?? ""))
    keys.append(element('kbd', 'channel-key', digit));
  b.append(logo, keys);
  return b;
}

function radioLogo(station, className, kind = 'radio') {
  const holder = element('span', className + ' radio-logo-holder');
  const fallback = element('span', kind === 'tv' ? 'channel-fallback' : 'radio-logo-fallback', kind === 'tv' ? station.name : '♫');
  const img = element('img');
  img.alt = '';
  img.draggable = false;
  img.hidden = true;
  holder.append(fallback, img);
  let attempted = false;

  async function recover() {
    if (attempted)
      return;
    attempted = true;
    try {
      const url = await window.easyTV.findStationLogo({ name: station.name, logo: station.logo, country: station.country || (kind === 'tv' && !station.source ? 'IT' : '') }, kind);
      if (url && holder.isConnected)
        img.src = url;
    }
    catch {
    }
  }
  img.addEventListener('load', () => {
    fallback.hidden = true;
    img.hidden = false;
    scheduleFit();
  });
  img.addEventListener('error', () => {
    img.hidden = true;
    fallback.hidden = false;
    recover();
    scheduleFit();
  });
  if (station.logo)
    img.src = /^https?:\/\//i.test(station.logo) ? station.logo : `../../assets/icons/${station.logo}`;
  else
    queueMicrotask(recover);
  return holder;
}

function radioButton(station) {
  const b = button(station.name, () => window.easyTV.openRadio(station.id), 'channel');
  b.prepend(radioLogo(station, 'channel-logo'));
  return b;
}
let radioOffset = 0, radioQuery = {}, radioResults = [], radioMore = false;
let searchGeneration = 0, radioStatus = null;

function renderRadioResults() {
  const holder = document.getElementById('radio-results');
  holder.replaceChildren();
  document.getElementById('radio-more').hidden = !radioMore;
  document.getElementById('radio-status').textContent = radioStatus ? t(radioStatus.key, radioStatus.values) : '';
  if (!editing)
    return;
  for (const station of radioResults) {
    const row = element('div', 'catalogue-item');
    const selected = draft.favorites.radio.includes(station.id);
    const add = button('', async () => {
      if (!editing || saving)
        return;
      const session = draft;
      add.disabled = true;
      try {
        if (selected) {
          const i = draft.favorites.radio.indexOf(station.id);
          draft.favorites.radio.splice(i, 1);
          undoFavorite("radio", station.id, i);
        }
        else {
          const r = await window.easyTV.addRadio(station.id);
          if (!radios.some(x => x.id === r.id))
            radios.push(r);
          if (!editing || saving || draft !== session)
            return;
          if (!draft.favorites.radio.includes(r.id))
            draft.favorites.radio.push(r.id);
          let g = draft.groups.find(x => x.type === 'radio' && x.visible);
          if (!g) {
            g = { id: 'radio-' + Date.now(), name: t('Radio'), type: 'radio', visible: true, stationIds: [] };
            draft.groups.push(g);
          }
          if (!draft.groups.some(x => x.type === 'radio' && x.visible && x.stationIds.includes(r.id)))
            g.stationIds.push(r.id);
        }
        renderCatalogue('radio', radios);
        renderGroups();
        renderRadioResults();
      }
      catch (e) {
        radioStatus = { key: 'Error: {message}', values: { message: e.message } };
        renderRadioResults();
      }
      finally {
        add.disabled = false;
      }
    }, 'radio-add');
    add.classList.toggle('radio-remove', selected);
    add.append(element('span', 'yellow-star', '★'), document.createTextNode(' ' + (selected ? t('Remove from favorites') : t('Add to favorites'))));
    add.setAttribute('aria-pressed', String(selected));
    tooltip(add, selected ? t('Remove from favorites') : t('Add to favorites'));
    const preview = button('🔊 ' + t('Preview'), async () => {
      if (!editing || saving)
        return;
      const session = draft;
      try {
        const r = await window.easyTV.addRadio(station.id);
        if (!radios.some(x => x.id === r.id))
          radios.push(r);
        if (!editing || saving || draft !== session)
          return;
        renderCatalogue('radio', radios);
        renderGroups();
        await window.easyTV.openRadio(r.id, true);
      }
      catch (e) {
        radioStatus = { key: 'Error: {message}', values: { message: e.message } };
        renderRadioResults();
      }
    }, 'radio-preview');
    row.append(radioLogo(station, 'result-logo'), element('span', 'result-name', station.name + (station.genre ? ' · ' + station.genre.slice(0, 80) : '')), add, preview);
    holder.append(row);
  }
  scheduleFit();
}
let radioTimer, tvTimer;

function clearRadioSearch() {
  clearTimeout(radioTimer);
  ++searchGeneration;
  radioOffset = 0;
  radioQuery = {};
  radioResults = [];
  radioMore = false;
  radioStatus = null;
  document.getElementById('radio-name').value = '';
  document.getElementById('radio-country').value = 'IT';
  document.getElementById('radio-genre').value = '';
  document.getElementById('radio-search').disabled = document.getElementById('radio-more').disabled = false;
  renderRadioResults();
  document.getElementById('radio-name').focus();
}

async function searchRadio(next = false) {
  clearTimeout(radioTimer);
  const generation = ++searchGeneration;
  const search = document.getElementById('radio-search'), more = document.getElementById('radio-more');
  search.disabled = more.disabled = true;
  if (!next) {
    radioOffset = 0;
    radioQuery = { name: document.getElementById('radio-name').value, country: document.getElementById('radio-country').value, genre: document.getElementById('radio-genre').value };
  }
  try {
    const result = await window.easyTV.searchRadios({ ...radioQuery, offset: radioOffset });
    if (!editing || generation !== searchGeneration)
      return;
    radioResults = result.stations;
    radioOffset += 30;
    radioMore = result.more;
    radioStatus = radioResults.length ? null : { key: 'No stations found.' };
    renderRadioResults();
  }
  catch (e) {
    if (generation === searchGeneration && editing) {
      radioStatus = { key: 'Error: {message}', values: { message: e.message } };
      renderRadioResults();
    }
  }
  finally {
    if (generation === searchGeneration)
      search.disabled = more.disabled = false;
  }
}

function renderHome() {
  home.replaceChildren();
  for (const group of saved.groups) {
    if (!group.visible)
      continue;
    const catalogue = group.type === 'tv' ? tvs : radios;
    const favorites = new Set(saved.favorites[group.type]);
    const stations = [...favorites]
      .filter(id => group.stationIds.includes(id))
      .map(id => catalogue.find(s => s.id === id)).filter(Boolean);
    if (!stations.length)
      continue;
    const section = element('section', 'group');
    const heading = element('h2', '', group.name);
    const grid = element('div', 'channels');
    for (const station of stations) {
      grid.append(group.type === 'radio' ? radioButton(station) : channelButton(station));
    }
    section.append(heading, grid);
    home.append(section);
  }
  if (!home.children.length)
    home.append(element('p', 'settings-description', t('No visible favorite channels. Open Settings to select one.')));
  scheduleFit();
}

function renderCatalogue(type, catalogue) {
  const holder = document.getElementById(`${type}-catalogue`);
  holder.replaceChildren();
  const selected = draft.favorites[type];
  const ordered = [...selected.map(id => catalogue.find(s => s.id === id)).filter(Boolean), ...catalogue.filter(s => !selected.includes(s.id))];

  function reorder(id, target) {
    const from = selected.indexOf(id);
    if (from < 0 || target < 0 || target >= selected.length || from === target)
      return;
    selected.splice(from, 1);
    selected.splice(target, 0, id);
    renderCatalogue(type, catalogue);
    updateToolbar();
    [...holder.querySelectorAll('.drag-handle')].find(el => el.dataset.stationId === id)?.focus();
  }
  for (const station of ordered) {
    const item = element('div', 'catalogue-item');
    const star = button(selected.includes(station.id) ? '★' : '☆', () => {
      const index = selected.indexOf(station.id);
      if (index >= 0) {
        selected.splice(index, 1);
        undoFavorite(type, station.id, index);
      }
      else {
        selected.push(station.id);
      }
      star.textContent = selected.includes(station.id) ? '★' : '☆';
      star.classList.toggle('favorite', selected.includes(station.id));
      star.setAttribute('aria-pressed', String(selected.includes(station.id)));
      message.textContent = '';
      renderCatalogue(type, catalogue);
      renderRadioResults();
      renderTVResults();
      updateToolbar();
      [...holder.querySelectorAll('.star-button')].find(el => el.dataset.stationId === station.id)?.focus();
    }, 'star-button');
    star.dataset.stationId = station.id;
    star.classList.toggle('favorite', selected.includes(station.id));
    star.setAttribute('aria-pressed', String(selected.includes(station.id)));
    tooltip(star, t('Favorite: {name}', { name: station.name }));
    if (selected.includes(station.id)) {
      const handle = button('☰', () => {
      }, 'drag-handle');
      handle.dataset.stationId = station.id;
      handle.title = t('Reorder favorites (Alt+Up/Down)');
      handle.setAttribute('aria-label', handle.title + ': ' + station.name);
      handle.draggable = true;
      const mime = 'application/x-easytv-' + type;
      const clearMarks = () => holder.querySelectorAll('.drop-before, .drop-after').forEach(el => el.classList.remove('drop-before', 'drop-after'));
      const after = e => {
        const r = item.getBoundingClientRect();
        return e.clientX >= r.left + r.width / 2;
      };
      handle.addEventListener('dragstart', e => {
        e.dataTransfer.setData(mime, station.id);
        e.dataTransfer.effectAllowed = 'move';
        item.classList.add('dragging');
      });
      handle.addEventListener('dragend', () => {
        clearMarks();
        item.classList.remove('dragging');
      });
      item.addEventListener('dragover', e => {
        if (!e.dataTransfer.types.includes(mime))
          return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        clearMarks();
        if (!item.classList.contains('dragging'))
          item.classList.add(after(e) ? 'drop-after' : 'drop-before');
      });
      item.addEventListener('dragleave', e => {
        if (!item.contains(e.relatedTarget))
          item.classList.remove('drop-before', 'drop-after');
      });
      item.addEventListener('drop', e => {
        if (!e.dataTransfer.types.includes(mime))
          return;
        e.preventDefault();
        const id = e.dataTransfer.getData(mime);
        const from = selected.indexOf(id);
        let target = selected.indexOf(station.id) + (after(e) ? 1 : 0);
        if (from < target)
          target--;
        clearMarks();
        if (from >= 0)
          reorder(id, target);
      });
      handle.addEventListener('keydown', e => {
        if (e.altKey && ['ArrowUp', 'ArrowDown'].includes(e.key)) {
          e.preventDefault();
          reorder(station.id, selected.indexOf(station.id) + (e.key === 'ArrowUp' ? -1 : 1));
        }
      });
      item.append(handle);
    }
    item.append(star, element('span', 'catalogue-name', station.name));
    if (station.number != null) {
      item.classList.add('numbered');
      const keys = element('span', 'channel-number');
      for (const digit of String(station.number))
        keys.append(element('kbd', 'channel-key', digit));
      item.append(keys);
    }
    if (type === 'tv' && station.directUrl && station.url) {
      const select = element('select', 'tv-playback-mode');
      select.setAttribute('aria-label', t('Playback mode') + ': ' + station.name);
      for (const [value, label, description] of [['web', t('Web'), t('Official player')], ['direct', t('Direct'), t('Direct streaming')], ['auto', t('Auto'), t('Automatic fallback')]]) {
        const option = element('option', '', label);
        option.value = value;
        option.title = description;
        select.append(option);
      }
      select.value = draft.tvPlayback?.[station.id] || 'web';
      select.title = select.selectedOptions[0].title;
      select.onchange = () => {
        select.title = select.selectedOptions[0].title;
        draft.tvPlayback ||= {};
        if (select.value === 'web')
          delete draft.tvPlayback[station.id];
        else
          draft.tvPlayback[station.id] = select.value;
        updateToolbar();
      };
      item.append(select);
    }
    if (type === 'tv' && station.source) {
      item.append(tvIconButton('play', t('Watch'), () => window.easyTV.previewTV(station.id)), tvIconButton('edit', t('Edit channel'), () => editTV(station)), tvIconButton('trash', t('Delete channel'), () => deleteTV(station), true));
    }
    if (type === 'radio' && station.editable)
      item.append(tvIconButton('play', t('Preview'), () => window.easyTV.openRadio(station.id, true)), tvIconButton('edit', t('Edit station'), () => editRadio(station)), tvIconButton('trash', t('Delete station'), () => deleteRadio(station), true));
    holder.append(item);
  }
}

function updateToolbar() {
  if (!draft)
    return;
  const normalize = value => JSON.stringify({
    language: value.language || 'auto',
    tvPlayback: Object.entries(value.tvPlayback || {}).sort(),
    favorites: Object.fromEntries(Object.entries(value.favorites).map(([k, v]) => [k, [...v]])),
    groups: value.groups.map(g => ({ ...g, stationIds: [...g.stationIds].sort() }))
  });
  const dirty = normalize(draft) !== normalize(saved);
  back.hidden = !dirty;
  save.textContent = dirty ? t('Save') : t('Back to TV');
  save.classList.toggle('clean', !dirty);
  tooltip(save, save.textContent);
  tooltip(back, back.textContent);
}

function renderGroups(focusIndex = -1) {
  groupEditor.replaceChildren();
  draft.groups.forEach((group, index) => {
    const baseline = groupSnapshots.get(group.id);
    const card = element('section', 'group-editor');
    const top = element('div', 'group-editor-top');
    const name = element('input', 'group-name');
    name.type = 'text';
    name.maxLength = 80;
    name.value = group.name;
    name.setAttribute('aria-label', t('Group name'));
    name.addEventListener('input', () => {
      group.name = name.value;
      updateActions();
    });
    const kind = element('span', 'group-type', t(group.type === 'tv' ? 'TV' : 'Radio').toUpperCase());
    top.append(name, kind);
    const controls = element('div', 'group-controls');
    const visibleLabel = element('label', 'visible-label');
    const visible = element('input');
    visible.type = 'checkbox';
    visible.checked = group.visible;
    visible.addEventListener('change', () => {
      group.visible = visible.checked;
      updateActions();
    });
    visibleLabel.append(visible, document.createTextNode(' ' + t('Show on Home')));
    controls.append(visibleLabel);
    const move = direction => {
      const other = index + direction;
      if (other < 0 || other >= draft.groups.length)
        return;
      [draft.groups[index], draft.groups[other]] = [draft.groups[other], draft.groups[index]];
      renderGroups(other);
    };
    const up = button('↑', () => move(-1));
    tooltip(up, t('Move up'));
    controls.append(up);
    const down = button('↓', () => move(1));
    tooltip(down, t('Move down'));
    controls.append(down);
    controls.append(button(t('Delete'), () => {
      const d = draft;
      const snapshot = groupSnapshots.get(group.id);
      undoToast(t("Group deleted."), () => {
        if (draft !== d)
          throw Error(t("Settings session ended."));
        if (!d.groups.some(g => g.id === group.id))
          d.groups.splice(Math.min(index, d.groups.length), 0, group);
        if (snapshot)
          groupSnapshots.set(group.id, snapshot);
        renderGroups();
        updateToolbar();
      });
      groupSnapshots.delete(group.id);
      draft.groups.splice(index, 1);
      renderGroups(Math.min(index, draft.groups.length - 1));
    }, 'delete-group'));
    const localCancel = button(t('Cancel'), () => {
      if (baseline)
        draft.groups[index] = structuredClone(baseline);
      else
        draft.groups.splice(index, 1);
      renderGroups(Math.min(index, draft.groups.length - 1));
    });
    const localSave = button(t('Save'), async () => {
      if (saving)
        return;
      if (!group.name.trim()) {
        name.focus();
        return;
      }
      group.name = group.name.trim();
      // Check whether there are pending changes unrelated
      // to the group currently being saved.
      const normalize = value => JSON.stringify({
        language: value.language || 'auto',
        tvPlayback: Object.entries(value.tvPlayback || {}).sort(),
        favorites: Object.fromEntries(Object.entries(value.favorites).map(([k, v]) => [k, [...v]])),
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
      const existingIndex = updated.groups.findIndex(g => g.id === group.id);
      if (existingIndex >= 0) {
        updated.groups[existingIndex] = savedGroup;
      }
      else {
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
        const persistedGroup = saved.groups.find(g => g.id === group.id);
        groupSnapshots.set(group.id, structuredClone(persistedGroup));
        if (!otherChanges) {
          // Everything is now saved. Synchronize the entire draft
          // with the persistent, normalized preferences.
          draft = structuredClone(saved);
          groupSnapshots = new Map(draft.groups.map(g => [
            g.id,
            structuredClone(g)
          ]));
          renderCatalogue('tv', tvs);
          renderCatalogue('radio', radios);
        }
        else {
          // Preserve unrelated unsaved modifications.
          draft.groups[index] = structuredClone(persistedGroup);
        }
        message.textContent = t('Group saved.');
        renderGroups(index);
        renderHome();
        updateToolbar();
      }
      catch (error) {
        console.error('EasyTV group save:', error);
        notify(t('Error: {message}', { message: error.message }), 'error');
      }
      finally {
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
      check.type = 'checkbox';
      check.checked = group.stationIds.includes(station.id);
      check.addEventListener('change', () => {
        if (check.checked && !group.stationIds.includes(station.id))
          group.stationIds.push(station.id);
        if (!check.checked) {
          const d = draft, i = group.stationIds.indexOf(station.id);
          group.stationIds = group.stationIds.filter(id => id !== station.id);
          undoToast(t("Group member removed."), () => {
            if (draft !== d || !d.groups.includes(group))
              throw Error(t("Settings session ended."));
            restoreAt(group.stationIds, station.id, i);
            renderGroups();
            updateToolbar();
          });
        }
        updateActions();
      });
      label.append(check, document.createTextNode(` ${station.name}`));
      members.append(label);
    }
    if (!catalogue.length)
      members.append(element('span', 'settings-description', t('No stations found.')));
    card.append(top, controls, members);
    groupEditor.append(card);
  });
  updateToolbar();
  if (focusIndex >= 0)
    groupEditor.querySelectorAll('.group-name')[focusIndex]?.focus();
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
  if (saving)
    return;
  clearTimeout(radioTimer);
  clearTimeout(tvTimer);
  ++searchGeneration;
  ++tvGeneration;
  tvEl('tv-search').disabled = tvEl('tv-more').disabled = false;
  editTV();
  document.getElementById('radio-search').disabled = document.getElementById('radio-more').disabled = false;
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
  if (saving)
    return;
  if (back.hidden) {
    closeSettings();
    return;
  }
  if (draft.groups.some(g => !g.name.trim())) {
    notify(t('Every group must have a name.'), 'warning');
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
  }
  catch (error) {
    console.error('EasyTV settings:', error);
    notify(t('Error: {message}', { message: error.message }), 'error');
  }
  finally {
    saving = false;
    page.inert = false;
    save.disabled = false;
    back.disabled = false;
    if (editing)
      save.focus();
  }
}

function handleHomeArrows(event) {
  if (editing || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key))
    return;
  const target = event.target.closest?.('.channel');
  if (!target)
    return;
  const buttons = [...home.querySelectorAll('.channel')];
  const index = buttons.indexOf(target);
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 }[event.key];
  const next = index + step;
  if (next >= 0 && next < buttons.length) {
    event.preventDefault();
    buttons[next].focus();
  }
}

async function initialize() {
  const [channels, info, preferences, i18n] = await Promise.all([
    window.easyTV.getChannels(), window.easyTV.getAppInfo(), window.easyTV.getPreferences(), window.easyTV.getI18n()
  ]);
  tvs = channels;
  radios = await window.easyTV.getRadios();
  document.getElementById('radio-clear').addEventListener('click', clearRadioSearch);
  document.getElementById('radio-search').addEventListener('click', () => searchRadio());
  document.getElementById('radio-more').addEventListener('click', () => searchRadio(true));
  setupTV();
  setupManualRadio();
  setupDebounce();
  setupLogoSearch();
  for (const id of ['tv-clear', 'radio-clear', 'manual-clear', 'manual-radio-clear', 'toast-close'])
    icon(document.getElementById(id), 'clear');
  document.getElementById('toast-close').onclick = () => notify('');
  saved = preferences;
  localeData = i18n;
  appInfo = info;
  languageSelect.addEventListener('change', () => {
    if (saving) {
      languageSelect.value = draft.language;
      return;
    }
    draft.language = languageSelect.value;
    message.textContent = '';
    applyLanguage();
    updateToolbar();
  });
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
      if (result?.action === 'unsupported')
        window.alert(result.message);
    }
    catch (error) {
      window.alert(t('Error: {message}', { message: error.message }));
    }
    finally {
      power.disabled = false;
    }
  });
  document.addEventListener('keydown', event => {
    if (editing && event.key === 'Escape') {
      event.preventDefault();
      closeSettings();
      return;
    }
    handleHomeArrows(event);
  });
  window.easyTV.onSettingsShortcut(() => editing ? closeSettings() : openSettings());
  window.easyTV.onMainFullscreenChanged(scheduleFit);
  window.addEventListener('resize', scheduleFit);
  applyLanguage();
  document.fonts?.ready?.then(scheduleFit);
}
let tvResults = [], tvOffset = 0, tvMore = false, tvQuery = {}, tvGeneration = 0, manualId = null;
const tvEl = id => document.getElementById(id);

function tvError(e, id = 'tv-status') {
  notify(t('Error: {message}', { message: e.message }), 'error');
}

function upsertTV(c) {
  const i = tvs.findIndex(x => x.id === c.id);
  if (i < 0)
    tvs.push(c);
  else
    tvs[i] = c;
  return c;
}

function favoriteTV(c) {
  if (!draft.favorites.tv.includes(c.id))
    draft.favorites.tv.push(c.id);
  if (!draft.groups.some(g => g.type === 'tv' && g.visible && g.stationIds.includes(c.id))) {
    let g = draft.groups.find(g => g.type === 'tv' && g.visible);
    if (!g) {
      g = { id: 'tv-' + Date.now(), name: t('TV'), type: 'tv', visible: true, stationIds: [] };
      draft.groups.push(g);
    }
    g.stationIds.push(c.id);
  }
}

function refreshTV() {
  renderCatalogue('tv', tvs);
  renderGroups();
  renderTVResults();
  updateToolbar();
}

function renderTVResults() {
  const holder = tvEl('tv-results');
  holder.replaceChildren();
  tvEl('tv-more').hidden = !tvMore;
  if (!editing)
    return;
  for (const channel of tvResults) {
    for (const [i, v] of channel.variants.entries()) {
      const r = { ...channel, ...v };
      const c = tvs.find(x => x.directUrl === r.directUrl);
      const selected = c && draft.favorites.tv.includes(c.id);
      const row = element('div', 'catalogue-item');
      const add = button('★ ' + (selected ? t('Remove from favorites') : t('Add to favorites')), async () => {
        const d = draft;
        try {
          if (selected) {
            const i = d.favorites.tv.indexOf(c.id);
            d.favorites.tv.splice(i, 1);
            undoFavorite("tv", c.id, i);
          }
          else {
            const station = upsertTV(await window.easyTV.importTV(r.key));
            if (draft !== d)
              return;
            favoriteTV(station);
          }
          refreshTV();
        }
        catch (e) {
          tvError(e);
        }
      }, 'radio-add');
      add.classList.toggle('radio-remove', !!selected);
      const preview = button(t('Watch'), async () => {
        const d = draft;
        try {
          const station = upsertTV(await window.easyTV.importTV(r.key));
          if (draft !== d)
            return;
          refreshTV();
          await window.easyTV.previewTV(station.id);
        }
        catch (e) {
          tvError(e);
        }
      }, 'radio-preview');
      icon(preview, 'play');
      row.append(radioLogo(r, 'result-logo', 'tv'), element('span', 'result-name', [r.name, t('Stream {number} of {total}', { number: i + 1, total: channel.variants.length }), r.quality, r.insecure ? t('HTTP — not encrypted') : '', r.unknown ? t('Format unverified') : '', r.headers ? t('Custom headers required — unsupported') : ''].filter(Boolean).join(' · ')), add, preview);
      holder.append(row);
    }
  }
}

async function searchTV(next = false) {
  clearTimeout(tvTimer);
  const gen = ++tvGeneration;
  if (!next) {
    tvOffset = 0;
    tvQuery = { name: tvEl('tv-name').value, country: tvEl('tv-country').value, genre: tvEl('tv-genre').value };
  }
  tvEl('tv-search').disabled = tvEl('tv-more').disabled = true;
  try {
    const r = await window.easyTV.searchTVs({ ...tvQuery, offset: tvOffset });
    if (gen !== tvGeneration || !editing)
      return;
    tvResults = r.stations;
    tvMore = r.more;
    tvOffset += 30;
    tvEl('tv-status').textContent = tvResults.length ? '' : t('No stations found.');
    renderTVResults();
  }
  catch (e) {
    if (gen === tvGeneration)
      tvError(e);
  }
  finally {
    if (gen === tvGeneration)
      tvEl('tv-search').disabled = tvEl('tv-more').disabled = false;
  }
}
const manualFields = ['name', 'directUrl', 'number', 'logo', 'url'];

function editTV(c = null) {
  manualId = c?.id || null;
  for (const k of manualFields)
    tvEl('manual-' + k).value = c?.[k] ?? '';
  tvEl('manual-status').textContent = '';
  updateLogoPreview('tv');
  if (c) {
    tvEl('manual-tv-panel').open = true;
    tvEl('manual-name').focus();
  }
}

function tvIconButton(symbol, label, action, remove = false) {
  const b = button('', action, 'tv-icon' + (remove ? ' tv-delete' : ''));
  icon(b, symbol);
  return tooltip(b, label);
}

async function deleteTV(c) {
  if (saving)
    return;
  const d = draft;
  const before = structuredClone(d);
  const snapshots = structuredClone(groupSnapshots);
  try {
    const result = await window.easyTV.deleteTV(c.id);
    saved = result.preferences;
    tvs = tvs.filter(x => x.id !== c.id);
    if (draft !== d)
      return;
    d.favorites.tv = d.favorites.tv.filter(x => x !== c.id);
    for (const g of d.groups)
      if (g.type === 'tv')
        g.stationIds = g.stationIds.filter(x => x !== c.id);
    for (const g of groupSnapshots.values())
      if (g.type === 'tv')
        g.stationIds = g.stationIds.filter(x => x !== c.id);
    delete d.tvPlayback?.[c.id];
    if (d.lastStation?.id === c.id && d.lastStation.type === 'tv')
      d.lastStation = null;
    if (manualId === c.id)
      editTV();
    refreshTV();
    undoToast(t('Channel deleted.'), async () => {
      const result2 = await window.easyTV.restoreTV(result.token);
      saved = result2.preferences;
      upsertTV(result2.channel);
      if (draft === d) {
        restoreAt(d.favorites.tv, c.id, before.favorites.tv.indexOf(c.id));
        for (const g of d.groups)
          restoreAt(g.stationIds, c.id, before.groups.find(x => x.id === g.id)?.stationIds.indexOf(c.id) ?? -1);
        for (const g of groupSnapshots.values())
          restoreAt(g.stationIds, c.id, snapshots.get(g.id)?.stationIds.indexOf(c.id) ?? -1);
        if (before.tvPlayback?.[c.id]) {
          d.tvPlayback ||= {};
          d.tvPlayback[c.id] = before.tvPlayback[c.id];
        }
        refreshTV();
      }
      renderHome();
    });
  }
  catch (e) {
    tvError(e, 'manual-status');
  }
}

function setupDebounce() {
  for (const type of ['tv', 'radio'])
    for (const field of ['name', 'country', 'genre'])
      tvEl(type + '-' + field).addEventListener('input', () => {
        if (!editing)
          return;
        if (type === 'tv') {
          clearTimeout(tvTimer);
          ++tvGeneration;
          tvEl('tv-search').disabled = false;
          tvEl('tv-more').disabled = true;
          tvTimer = setTimeout(() => {
            if (editing)
              searchTV();
          }, 500);
        }
        else {
          clearTimeout(radioTimer);
          ++searchGeneration;
          tvEl('radio-search').disabled = false;
          tvEl('radio-more').disabled = true;
          radioTimer = setTimeout(() => {
            if (editing)
              searchRadio();
          }, 500);
        }
      });
}

function setupTV() {
  tvEl('tv-search').onclick = () => searchTV();
  tvEl('tv-more').onclick = () => searchTV(true);
  tvEl('tv-clear').onclick = () => {
    clearTimeout(tvTimer);
    ++tvGeneration;
    tvResults = [];
    tvMore = false;
    tvOffset = 0;
    tvEl('tv-name').value = tvEl('tv-genre').value = '';
    tvEl('tv-country').value = 'IT';
    tvEl('tv-status').textContent = '';
    tvEl('tv-search').disabled = tvEl('tv-more').disabled = false;
    renderTVResults();
  };
  tvEl('manual-clear').onclick = () => editTV();
  tvEl('manual-preview').onclick = async () => {
    const d = draft;
    try {
      const input = Object.fromEntries(manualFields.map(k => [k, tvEl('manual-' + k).value.trim()]));
      const c = upsertTV(await window.easyTV.saveTV(input, manualId));
      if (draft !== d)
        return;
      manualId = c.id;
      refreshTV();
      await window.easyTV.previewTV(c.id);
    }
    catch (e) {
      tvError(e, 'manual-status');
    }
  };
  tvEl('manual-save').onclick = async () => {
    const d = draft;
    try {
      const input = Object.fromEntries(manualFields.map(k => [k, tvEl('manual-' + k).value.trim()]));
      const wasEdit = !!manualId;
      const c = upsertTV(await window.easyTV.saveTV(input, manualId));
      if (draft !== d)
        return;
      editTV();
      if (!wasEdit)
        favoriteTV(c);
      refreshTV();
      tvEl('manual-tv-panel').open = false;
      message.textContent = t('Channel saved.');
    }
    catch (e) {
      tvError(e, 'manual-status');
    }
  };
}
let manualRadioId = null;
const manualRadioFields = ['name', 'url', 'logo', 'country', 'genre', 'frequency', 'homepage'];

function editRadio(station = null) {
  manualRadioId = station?.id || null;
  for (const k of manualRadioFields)
    tvEl('manual-radio-' + k).value = station?.[k] ?? '';
  updateLogoPreview('radio');
  if (station) {
    tvEl('manual-radio-panel').open = true;
    tvEl('manual-radio-name').focus();
  }
}

function refreshRadio() {
  renderCatalogue('radio', radios);
  renderGroups();
  renderRadioResults();
  updateToolbar();
}

function upsertRadio(s) {
  const i = radios.findIndex(x => x.id === s.id);
  if (i < 0)
    radios.push(s);
  else
    radios[i] = s;
  return s;
}

function favoriteRadio(s) {
  if (!draft.favorites.radio.includes(s.id))
    draft.favorites.radio.push(s.id);
  if (!draft.groups.some(g => g.type === 'radio' && g.visible && g.stationIds.includes(s.id))) {
    let g = draft.groups.find(g => g.type === 'radio' && g.visible);
    if (!g) {
      g = { id: 'radio-' + Date.now(), name: t('Radio'), type: 'radio', visible: true, stationIds: [] };
      draft.groups.push(g);
    }
    g.stationIds.push(s.id);
  }
}

function setupManualRadio() {
  tvEl('manual-radio-clear').onclick = () => editRadio();
  for (const preview of [true, false])
    tvEl(preview ? 'manual-radio-preview' : 'manual-radio-save').onclick = async () => {
      if (!editing || saving)
        return;
      const d = draft;
      const id = manualRadioId;
      const input = Object.fromEntries(manualRadioFields.map(k => [k, tvEl('manual-radio-' + k).value.trim()]));
      try {
        const s = upsertRadio(await window.easyTV.saveRadio(input, id));
        if (draft !== d)
          return;
        manualRadioId = s.id;
        if (preview) {
          refreshRadio();
          await window.easyTV.openRadio(s.id, true);
        }
        else {
          favoriteRadio(s);
          editRadio();
          tvEl('manual-radio-panel').open = false;
          refreshRadio();
          notify(t('Station saved.'));
        }
      }
      catch (e) {
        tvError(e);
      }
    };
}

async function deleteRadio(s) {
  if (saving)
    return;
  const d = draft, before = structuredClone(d), snapshots = structuredClone(groupSnapshots);
  try {
    const result = await window.easyTV.deleteRadio(s.id);
    saved = result.preferences;
    radios = radios.filter(x => x.id !== s.id);
    if (draft === d) {
      d.favorites.radio = d.favorites.radio.filter(x => x !== s.id);
      for (const g of [...d.groups, ...groupSnapshots.values()])
        if (g.type === 'radio')
          g.stationIds = g.stationIds.filter(x => x !== s.id);
      if (d.lastStation?.type === 'radio' && d.lastStation.id === s.id)
        d.lastStation = null;
      if (manualRadioId === s.id)
        editRadio();
      refreshRadio();
    }
    undoToast(t('Station deleted.'), async () => {
      const r = await window.easyTV.restoreRadio(result.token);
      saved = r.preferences;
      upsertRadio(r.station);
      if (draft === d) {
        restoreAt(d.favorites.radio, s.id, before.favorites.radio.indexOf(s.id));
        for (const g of d.groups)
          if (g.type === 'radio')
            restoreAt(g.stationIds, s.id, before.groups.find(x => x.id === g.id)?.stationIds.indexOf(s.id) ?? -1);
        for (const g of groupSnapshots.values())
          if (g.type === 'radio')
            restoreAt(g.stationIds, s.id, snapshots.get(g.id)?.stationIds.indexOf(s.id) ?? -1);
        refreshRadio();
      }
      renderHome();
    });
  }
  catch (e) {
    tvError(e);
  }
}

function updateLogoPreview(kind) {
  const prefix = kind === 'tv' ? 'manual-' : 'manual-radio-';
  const field = tvEl(prefix + 'logo'), holder = tvEl(prefix + 'logo-preview');
  if (!holder)
    return;
  clearTimeout(holder.previewTimer);
  const generation = (holder.previewGeneration || 0) + 1;
  holder.previewGeneration = generation;
  holder.replaceChildren();
  holder.hidden = true;
  const value = field.value.trim();
  if (!value)
    return;
  holder.previewTimer = setTimeout(() => {
    if (holder.previewGeneration !== generation)
      return;
    const img = element('img', 'manual-logo-image');
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    const status = element('span', 'manual-logo-status');
    const setStatus = key => {
      status.dataset.i18n = key;
      status.textContent = t(key);
    };
    const valid = () => holder.previewGeneration === generation;
    const failed = () => {
      if (!valid())
        return;
      img.remove();
      holder.prepend(element('span', 'manual-logo-fallback', kind === 'tv' ? '▣' : '♫'));
      setStatus('No logo found.');
    };
    img.onload = () => {
      if (valid())
        setStatus('Logo found.');
    };
    img.onerror = failed;
    holder.append(img, status);
    holder.hidden = false;
    setStatus('Logo URL');
    if (/^https?:\/\//i.test(value))
      img.src = value;
    else if (/^[\w .-]+$/.test(value) && !/\.\./.test(value))
      img.src = '../../assets/icons/' + encodeURIComponent(value);
    else
      failed();
  }, 250);
}

function setupLogoSearch() {
  for (const kind of ['tv', 'radio']) {
    const prefix = kind === 'tv' ? 'manual-' : 'manual-radio-';
    const b = tvEl(prefix + 'find-logo'), field = tvEl(prefix + 'logo'), name = tvEl(prefix + 'name');
    field.addEventListener('input', () => updateLogoPreview(kind));
    b.onclick = async () => {
      const value = name.value.trim(), old = field.value, d = draft, id = kind === 'tv' ? manualId : manualRadioId;
      if (!value) {
        notify(t('Station name required'), 'warning');
        return;
      }
      b.disabled = true;
      try {
        const url = await window.easyTV.findStationLogo({ name: value, logo: old, country: kind === 'radio' ? tvEl(prefix + 'country').value : 'IT' }, kind, true);
        if (draft !== d || name.value.trim() !== value || field.value !== old || id !== (kind === 'tv' ? manualId : manualRadioId))
          return;
        if (url) {
          field.value = url;
          updateLogoPreview(kind);
          notify(t('Logo found.'));
        }
        else
          notify(t('No logo found.'), 'warning');
      }
      catch (e) {
        tvError(e);
      }
      finally {
        b.disabled = false;
      }
    };
  }
}
initialize().catch(error => console.error('EasyTV initialization:', error));
