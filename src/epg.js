'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const { randomUUID } = require('node:crypto');

const LIMIT = 32 * 1024 * 1024;

function timestamp(value) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*(Z|[+-]\d{4})$/.exec(value || '');
  if (!m) throw new Error('XMLTV timestamp requires an explicit timezone');
  const [, y, mo, d, h, mi, s, zone] = m;
  const utc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  const check = new Date(utc);
  if (check.getUTCFullYear() !== +y || check.getUTCMonth() !== +mo - 1 || check.getUTCDate() !== +d || +h > 23 || +mi > 59 || +s > 59) throw new Error('Invalid XMLTV timestamp');
  if (zone === 'Z') return utc;
  const hours = +zone.slice(1, 3), minutes = +zone.slice(3);
  if (hours > 23 || minutes > 59) throw new Error('Invalid XMLTV timezone');
  return utc - (zone[0] === '+' ? 1 : -1) * (hours * 60 + minutes) * 60000;
}

function decode(s) {
  return s.replace(/&([^;\s]+);/g, (_, entity) => {
    const known = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (Object.hasOwn(known, entity)) return known[entity];
    if (/^#(?:\d+|x[0-9a-f]+)$/i.test(entity)) return String.fromCodePoint(entity[1] === 'x' ? parseInt(entity.slice(2), 16) : +entity.slice(1));
    throw new Error('Unsupported XML entity');
  });
}

// Restricted XMLTV reader: no external entities, DTD expansion or network access.
function parseXmltv(input) {
  if (Buffer.isBuffer(input)) {
    if (input.length > LIMIT) throw new Error('EPG input too large');
    if (input[0] === 31 && input[1] === 139) input = gunzipSync(input, { maxOutputLength: LIMIT });
    input = new TextDecoder('utf-8', { fatal: true }).decode(input);
  }
  if (typeof input !== 'string' || Buffer.byteLength(input) > LIMIT) throw new Error('EPG input too large');
  input = input.replace(/^\uFEFF/, '');
  const tokens = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE\s+tv\s+SYSTEM\s+(?:"[^"<>]*"|'[^'<>]*')\s*>|<\/?[\w:.-]+(?:\s+(?:[^<>"']|"[^"]*"|'[^']*')*)?\s*\/?>|[^<]+/gy;
  const stack = [], channels = new Map(), programmes = [];
  let root = false, closed = false, current = null;
  const diagnostics = { skipped: 0, reasons: {}, examples: [] };
  function skip(reason, entry) {
    diagnostics.skipped++;
    diagnostics.reasons[reason] = (diagnostics.reasons[reason] || 0) + 1;
    if (diagnostics.examples.length < 5) diagnostics.examples.push({ reason, channel: entry.channel, start: entry.rawStart, stop: entry.rawStop });
  }
  function finish(node) {
    const parent = stack.at(-1);
    if (parent && ['display-name', 'title', 'sub-title', 'desc', 'category'].includes(node.name) && current && stack.length === 2) {
      const key = node.name;
      (current[key] ||= []).push({ lang: node.attrs.lang || '', text: node.text.trim() });
    }
    if (node.name === 'channel' && stack.length === 1) {
      if (!current.id || channels.has(current.id)) throw new Error('Invalid or duplicate XMLTV channel');
      channels.set(current.id, { id: current.id, names: current['display-name'] || [] });
      current = null;
    }
    if (node.name === 'programme' && stack.length === 1) {
      const reason = current.error || (!current.channel ? 'Missing channel' : !current.title?.some(t => t.text) ? 'Missing title' : current.stop <= current.start ? 'Non-positive duration' : null);
      if (reason) skip(reason, current);
      else {
        delete current.rawStart;
        delete current.rawStop;
        programmes.push(current);
      }
      current = null;
    }
    if (node.name === 'tv' && !stack.length) closed = true;
  }
  let pos = 0;
  while (pos < input.length) {
    tokens.lastIndex = pos;
    const match = tokens.exec(input);
    if (!match) throw new Error('Malformed or unsupported XMLTV markup');
    const token = match[0]; pos = tokens.lastIndex;
    if (token.startsWith('<!--') || token.startsWith('<?')) continue;
    if (token.startsWith('<!DOCTYPE')) { if (root) throw new Error('Unexpected doctype'); continue; }
    if (!token.startsWith('<') || token.startsWith('<![CDATA[')) {
      const text = token.startsWith('<![CDATA[') ? token.slice(9, -3) : decode(token);
      if (stack.length) stack.at(-1).text += text;
      else if (text.trim()) throw new Error('Text outside XMLTV root');
      continue;
    }
    if (token.startsWith('</')) {
      const node = stack.pop();
      if (!node || token.slice(2, -1).trim() !== node.name) throw new Error('Mismatched XMLTV tag');
      finish(node); continue;
    }
    const self = token.endsWith('/>');
    const body = token.slice(1, self ? -2 : -1).trim();
    const name = /^[\w:.-]+/.exec(body)[0];
    const attrs = Object.create(null);
    let rest = body.slice(name.length);
    while (rest.trim()) {
      const a = /^\s+([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(rest);
      if (!a || Object.hasOwn(attrs, a[1])) throw new Error('Invalid XMLTV attribute');
      attrs[a[1]] = decode(a[2] ?? a[3]); rest = rest.slice(a[0].length);
    }
    if (!stack.length) {
      if (root || closed || name !== 'tv') throw new Error('Expected XMLTV tv root');
      root = true;
    }
    if (stack.length === 1 && name === 'channel') current = { id: attrs.id };
    if (stack.length === 1 && name === 'programme') {
      current = { channel: attrs.channel, rawStart: attrs.start, rawStop: attrs.stop };
      try {
        current.start = timestamp(attrs.start);
        current.stop = timestamp(attrs.stop);
      } catch (error) { current.error = error.message; }
    }
    const node = { name, attrs, text: '' };
    if (self) finish(node); else stack.push(node);
    if (stack.length > 64) throw new Error('XMLTV nesting limit exceeded');
  }
  if (!root || !closed || stack.length) throw new Error('Incomplete XMLTV document');
  const valid = programmes.filter(p => {
    if (channels.has(p.channel)) return true;
    skip('Unknown channel', p);
    return false;
  });
  return { channels: [...channels.values()], programmes: valid.sort((a, b) => a.start - b.start), diagnostics };
}

function nowNext(guide, channel, now = Date.now()) {
  const entries = guide.programmes.filter(p => p.channel === channel);
  return { current: entries.find(p => p.start <= now && now < p.stop) || null, next: entries.find(p => p.start > now) || null };
}

async function refresh({ url, cachePath, fetchImpl = fetch }) {
  if (new URL(url).protocol !== 'https:') throw new Error('EPG requires HTTPS');
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(30000), redirect: 'error' });
  if (!response.ok) throw new Error(`EPG HTTP ${response.status}`);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > LIMIT) throw new Error('EPG download too large');
    chunks.push(Buffer.from(chunk));
  }
  const guide = parseXmltv(Buffer.concat(chunks));
  if (!guide.programmes.length) throw new Error('EPG contains no programmes');
  const result = { version: 1, fetchedAt: Date.now(), ...guide };
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  const temp = `${cachePath}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, JSON.stringify(result), { mode: 0o600 });
    await fs.rename(temp, cachePath);
  } finally { await fs.rm(temp, { force: true }); }
  return result;
}

module.exports = { timestamp, parseXmltv, nowNext, refresh };
