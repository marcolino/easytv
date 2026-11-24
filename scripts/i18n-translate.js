#!/usr/bin/env node
/*
* EasyTV automatic translation utility
*
* Uses the free MyMemory Translation API.
* No additional npm dependencies required.
* Requires Node.js 18 or newer.
*
* Usage:
*
*   npm run i18n:translate
*   npm run i18n:translate -- --lang=fr
*   npm run i18n:translate -- --dry-run
*
* Optional email for a higher daily allowance:
*
*   MYMEMORY_EMAIL="you@example.com" npm run i18n:translate
*/
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const LOCALES_DIR = path.join(__dirname, '../src/locales');
const API_URL = 'https://api.mymemory.translated.net/get';
const EMAIL = process.env.MYMEMORY_EMAIL || '';
const REQUEST_DELAY = 1000;
const REQUEST_TIMEOUT = 20000;
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const requestedLanguage = args
  .find(arg => arg.startsWith('--lang='))
  ?.split('=')[1];
let translated = 0;
let unchanged = 0;
let failed = 0;
let skipped = 0;
// ------------------------------------------------------------
// Utilities
// ------------------------------------------------------------
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJSON(file, data) {
  const temporary = file + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(temporary, file);
}

function removeContext(key) {
  return key.replace(/^\[[^\]]+\]\s*/, '');
}

function getPlaceholders(text) {
  return [...text.matchAll(/\{[a-zA-Z0-9_]+\}/g)]
    .map(match => match[0])
    .sort();
}

function validPlaceholders(source, translation) {
  return JSON.stringify(getPlaceholders(source)) ===
    JSON.stringify(getPlaceholders(translation));
}

function decodeHTML(text) {
  const entities = {
    amp: '&',
    quot: '"',
    apos: "'",
    lt: '<',
    gt: '>',
    nbsp: ' '
  };
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (match, entity) => {
    if (entity.startsWith('#')) {
      const hexadecimal = entity[1].toLowerCase() === 'x';
      const number = hexadecimal
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);
      try {
        return String.fromCodePoint(number);
      }
      catch {
        return match;
      }
    }
    return entities[entity.toLowerCase()] ?? match;
  });
}
// ------------------------------------------------------------
// Placeholder protection
// ------------------------------------------------------------
function protectPlaceholders(text) {
  const placeholders = [];
  const protectedText = text.replace(/\{[a-zA-Z0-9_]+\}/g, placeholder => {
    const token = `ZXQPH${placeholders.length}QXZ`;
    placeholders.push({
      token,
      placeholder
    });
    return token;
  });
  return {
    text: protectedText,
    placeholders
  };
}

function restorePlaceholders(text, placeholders) {
  let result = text;
  for (const item of placeholders) {
    result = result.replace(new RegExp(item.token, 'gi'), item.placeholder);
  }
  return result;
}
// ------------------------------------------------------------
// MyMemory translation
// ------------------------------------------------------------
async function translateText(source, language) {
  const protectedSource = protectPlaceholders(source);
  if (Buffer.byteLength(protectedSource.text, 'utf8') > 500) {
    throw new Error('Text exceeds the API limit of 500 bytes');
  }
  const params = new URLSearchParams({
    q: protectedSource.text,
    langpair: `en|${language}`,
    mt: '1'
  });
  if (EMAIL) {
    params.set('de', EMAIL);
  }
  const response = await fetch(`${API_URL}?${params.toString()}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT)
  });
  if (!response.ok) {
    const error = new Error(`HTTP error ${response.status}`);
    error.quotaExceeded = response.status === 429;
    throw error;
  }
  const data = await response.json();
  const status = Number(data.responseStatus);
  const details = String(data.responseDetails || '');
  if (data.quotaFinished ||
    status === 429 ||
    /quota|daily limit|usage limit/i.test(details)) {
    const error = new Error('Daily translation quota exceeded');
    error.quotaExceeded = true;
    throw error;
  }
  if (status !== 200) {
    throw new Error(details || `API error ${status}`);
  }
  let result = data.responseData?.translatedText;
  if (typeof result !== 'string' || !result.trim()) {
    throw new Error('Empty translation');
  }
  result = decodeHTML(result);
  result = restorePlaceholders(result, protectedSource.placeholders);
  result = result.trim();
  if (/ZXQPH\d+QXZ/i.test(result)) {
    throw new Error('Unrestored placeholder');
  }
  if (!validPlaceholders(source, result)) {
    throw new Error('Translation changed the placeholders');
  }
  return result;
}
// ------------------------------------------------------------
// Translate one dictionary
// ------------------------------------------------------------
async function translateDictionary(language, english) {
  const file = path.join(LOCALES_DIR, `${language}.json`);
  const dictionary = readJSON(file);
  console.log(`\nTranslating: ${language}.json`);
  console.log('-'.repeat(50));
  for (const [key, englishValue] of Object.entries(english)) {
    const source = typeof englishValue === 'string' && englishValue.trim()
      ? englishValue
      : removeContext(key);
    const current = dictionary[key];
    // Preserve existing non-English translations.
    if (typeof current === 'string' &&
      current.trim() &&
      current !== source &&
      current !== key) {
      skipped++;
      continue;
    }
    if (dryRun) {
      console.log(`  Would translate: ${source}`);
      continue;
    }
    try {
      const result = await translateText(source, language);
      dictionary[key] = result;
      // Save after every successful request so progress
      // is not lost if interrupted or the quota is exceeded.
      writeJSON(file, dictionary);
      if (result === source) {
        unchanged++;
        console.log(`  = ${source} (unchanged)`);
      }
      else {
        translated++;
        console.log(`  ✓ ${source}`);
        console.log(`    → ${result}`);
      }
    }
    catch (error) {
      if (error.quotaExceeded) {
        console.warn('\nDaily translation quota reached.');
        console.warn('All successful translations have been saved.');
        throw error;
      }
      failed++;
      console.error(`  ✗ ${source}`);
      console.error(`    ${error.message}`);
    }
    await sleep(REQUEST_DELAY);
  }
}
// ------------------------------------------------------------
// Main
// ------------------------------------------------------------
async function main() {
  const english = readJSON(path.join(LOCALES_DIR, 'en.json'));
  // Automatically discover all supported language files.
  // Adding another dictionary requires no script changes.
  let languages = fs.readdirSync(LOCALES_DIR)
    .filter(file => file.endsWith('.json'))
    .map(file => path.basename(file, '.json'))
    .filter(language => language !== 'en')
    .sort();
  if (requestedLanguage) {
    if (!languages.includes(requestedLanguage)) {
      throw new Error(`Unknown target language: ${requestedLanguage}`);
    }
    languages = [requestedLanguage];
  }
  console.log('EasyTV — Automatic translations');
  console.log('Provider: MyMemory');
  console.log(`Languages: ${languages.join(', ')}`);
  console.log(`Email provided: ${EMAIL ? 'yes' : 'no'}`);
  if (dryRun) {
    console.log('DRY RUN — no translations or file writes');
  }
  try {
    for (const language of languages) {
      await translateDictionary(language, english);
    }
  }
  catch (error) {
    if (!error.quotaExceeded)
      throw error;
    process.exitCode = 1;
  }
  console.log('\n' + '='.repeat(50));
  console.log('Translation summary');
  console.log('='.repeat(50));
  console.log(`Translated:           ${translated}`);
  console.log(`Identical to English: ${unchanged}`);
  console.log(`Already translated:   ${skipped}`);
  console.log(`Failed:               ${failed}`);
  console.log('='.repeat(50));
  if (failed) {
    process.exitCode = 1;
  }
  if (!dryRun) {
    console.log('\nReview the translations and run:');
    console.log('  npm run i18n:check');
  }
}
main().catch(error => {
  console.error('Translation error:', error.message);
  process.exitCode = 1;
});
