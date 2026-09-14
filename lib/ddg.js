// Shared DuckDuckGo HTML-results fetcher used by both the daily discovery
// cron (api/search.js) and the on-demand per-contact lookup (api/lookup.js).
// No API key, no account, no billing card.

const cheerio = require('cheerio');

const DDG_ENDPOINT = 'https://html.duckduckgo.com/html/';

async function ddgSearch(query) {
  const resp = await fetch(DDG_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (compatible; Connect.AI-Alumni-Tracker/1.0; class project)',
    },
    body: new URLSearchParams({ q: query }).toString(),
    signal: AbortSignal.timeout(12000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const html = await resp.text();
  const $ = cheerio.load(html);

  const items = [];
  $('.result').each((_, el) => {
    const $el = $(el);
    const title = $el.find('.result__a').first().text().trim();
    const snippet = $el.find('.result__snippet').first().text().trim();
    const link = $el.find('.result__a').first().attr('href') || '';
    if (title) items.push({ title, snippet, link });
  });
  return items;
}

module.exports = { ddgSearch };
