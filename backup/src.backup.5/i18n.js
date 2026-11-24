const dictionaries = {
  en: require('./locales/en.json'),
  it: require('./locales/it.json'),
  fr: require('./locales/fr.json'),
  de: require('./locales/de.json')
};
const languages = {
  en: '🇬🇧 English',
  it: '🇮🇹 Italiano',
  fr: '🇫🇷 Français',
  de: '🇩🇪 Deutsch'
};

function resolveLanguage(preference, systemLanguages = []) {
  if (Object.hasOwn(languages, preference)) return preference;
  return systemLanguages.map(x => x.toLowerCase().split(/[-_]/)[0]).find(x => Object.hasOwn(languages, x)) || 'en';
}

function translate(language, key, values = {}) {
  const dictionary = dictionaries[language] || dictionaries.en;
  const text = (Object.hasOwn(dictionary, key) && dictionary[key]) || (Object.hasOwn(dictionaries.en, key) && dictionaries.en[key]) || key.replace(/^\[[^\]]+\]\s*/, '');
  return text.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name]) : match);
}

module.exports = { dictionaries, languages, resolveLanguage, translate };
