// Runs on a schedule (see vercel.json crons) with no external API and no
// cost. Fetches every URL in the `watch_pages` table, pulls out anything
// that looks like a person's name paired with a short bio, and drops new
// ones into the `suggestions` queue for the class to review and claim.
//
// Heuristic-based, not perfect — it's meant to surface candidates for a
// human to glance at and claim or dismiss, not to be trusted blindly.
// LinkedIn and anything requiring login are intentionally out of scope:
// LinkedIn blocks scrapers and scraping it violates their terms.

const { createClient } = require('@supabase/supabase-js');
const cheerio = require('cheerio');
const { looksLikeName } = require('../lib/nameFilter');

const CARD_SELECTORS = 'article, li, .card, .person, .profile, .alum, .alumni, .spotlight, .people, .team-member, .bio';
const HEADING_SELECTORS = 'h1, h2, h3, h4, h5, strong, b';
const NON_HUMAN_SITE_CHROME = 'script, style, noscript, nav, footer, header, form, [id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i], [id*="onetrust" i], [class*="onetrust" i], [id*="privacy" i], [class*="privacy" i], [id*="gdpr" i], [class*="gdpr" i], [role="dialog"], [aria-modal="true"]';

// cheerio's .text() concatenates adjacent inline elements with no space
// when the source HTML has none between tags ("Jean-Baptiste2011" instead
// of "Jean-Baptiste 2011"). Insert a space at the letter/digit and
// lower/upper boundaries that pattern produces, then collapse whitespace.
function cleanText(s) {
  return (s || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-zA-Z])/g, '$1 $2')
    .replace(/\)([^\s)])/g, ') $1')
    .replace(/([a-z])\(/g, '$1 (')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCandidates(html, sourceUrl) {
  const $ = cheerio.load(html);
  $(NON_HUMAN_SITE_CHROME).remove();
  const found = new Map();

  // Pass 1: card-shaped containers (bio pages, spotlight lists) — the
  // strongest signal, since heading + paragraph is a real profile shape.
  // Skip any container holding MORE than one heading — that means it
  // wraps multiple people (a grid cell, a whole list), and grabbing
  // "the first heading" + "the first paragraph" from a multi-person
  // container is exactly how one person's name gets paired with a
  // different person's bio.
  //
  // No topic/relevance filtering here on purpose: a page in watch_pages
  // was deliberately chosen because it's already scoped to the right
  // audience (a business school hall of fame, an engineering alumni
  // page). Rejecting a real match because its bio phrasing doesn't hit
  // a specific keyword list just throws away good, on-topic results —
  // trust the page choice instead of re-guessing relevance on top of it.
  $(CARD_SELECTORS).each((_, card) => {
    const $card = $(card);
    const headings = $card.find(HEADING_SELECTORS);
    if (headings.length !== 1) return;
    const nameText = headings.first().text().trim();
    if (!looksLikeName(nameText)) return;

    const paragraphs = $card.find('p');
    if (paragraphs.length === 0 || paragraphs.length > 2) return;
    const bio = cleanText(paragraphs.first().text()).slice(0, 130);
    if (!bio || bio === nameText) return;

    if (!found.has(nameText)) found.set(nameText, bio);
  });

  // Pass 2: fallback for pages that just list names as plain headings
  // (a Hall of Fame roster, a simple bulleted list) with no obvious
  // "card" wrapper. Headings only — links (<a>) turned out to catch too
  // much nav/site-chrome text ("Site A-Z") to be worth the extra recall.
  //
  // Bio must come from the heading's OWN immediate next sibling only —
  // no walking up to a parent and taking ITS next sibling, since that
  // can just as easily cross into a different person's content on a
  // grid/table layout. No immediate sibling paragraph means no bio,
  // not a guessed one from someone else.
  if (found.size < 30) {
    $(HEADING_SELECTORS).each((_, el) => {
      if (found.size >= 30) return false;
      const $el = $(el);
      const nameText = $el.text().trim();
      if (!looksLikeName(nameText) || found.has(nameText)) return;

      const bio = cleanText($el.next('p').text()).slice(0, 130);
      if (!bio) return;

      found.set(nameText, bio);
    });
  }

  return Array.from(found, ([alum_name, bio]) => ({
    alum_name,
    note: `Found on ${new URL(sourceUrl).hostname}${bio ? ' — ' + bio : ''}`.slice(0, 180),
  }));
}

module.exports = async (req, res) => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    res.status(500).json({ error: 'SUPABASE_URL / SUPABASE_ANON_KEY not set on this Vercel project.' });
    return;
  }
  const supa = createClient(url, key);

  const { data: pages, error: pagesErr } = await supa.from('watch_pages').select('*');
  if (pagesErr) {
    res.status(500).json({ error: pagesErr.message });
    return;
  }
  if (!pages || !pages.length) {
    res.status(200).json({ message: 'No watch_pages configured yet — add rows to the watch_pages table.' });
    return;
  }

  const [{ data: existingSuggestions }, { data: existingEntries }] = await Promise.all([
    supa.from('suggestions').select('alum_name'),
    supa.from('entries').select('alum_name'),
  ]);
  const known = new Set([
    ...(existingSuggestions || []).map(s => s.alum_name.toLowerCase()),
    ...(existingEntries || []).map(e => e.alum_name.toLowerCase()),
  ]);

  const results = [];
  for (const page of pages) {
    try {
      const resp = await fetch(page.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Connect.AI-Alumni-Tracker/1.0; class project)',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!resp.ok) {
        results.push({ url: page.url, error: `HTTP ${resp.status}` });
        continue;
      }
      const html = await resp.text();
      const candidates = extractCandidates(html, page.url);
      const fresh = candidates.filter(c => !known.has(c.alum_name.toLowerCase()));

      for (const c of fresh) {
        known.add(c.alum_name.toLowerCase());
        await supa.from('suggestions').insert({
          alum_name: c.alum_name,
          note: c.note,
          suggested_by: 'Auto-scan',
        });
      }

      await supa.from('watch_pages').update({
        last_scanned_at: new Date().toISOString(),
        last_found_count: fresh.length,
      }).eq('id', page.id);

      results.push({ url: page.url, found: candidates.length, added: fresh.length });
    } catch (err) {
      const detail = err?.cause?.message || err?.cause?.code || err?.message || String(err);
      results.push({ url: page.url, error: `${err.name || 'Error'}: ${detail}` });
    }
  }

  res.status(200).json({ scanned: pages.length, results });
};
