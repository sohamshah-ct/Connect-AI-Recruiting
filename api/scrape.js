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

function extractCandidates(html, sourceUrl) {
  const $ = cheerio.load(html);
  $(NON_HUMAN_SITE_CHROME).remove();
  const found = new Map();

  // Pass 1: card-shaped containers (bio pages, spotlight lists) — the
  // strongest signal, since heading + paragraph is a real profile shape.
  $(CARD_SELECTORS).each((_, card) => {
    const $card = $(card);
    const heading = $card.find(HEADING_SELECTORS).first();
    const nameText = heading.text().trim();
    if (!looksLikeName(nameText)) return;

    let bio = $card.find('p').first().text().trim().replace(/\s+/g, ' ');
    if (!bio || bio === nameText) bio = $card.text().trim().replace(/\s+/g, ' ').slice(0, 160);
    bio = bio.slice(0, 160);
    if (!bio) return;

    if (!found.has(nameText)) found.set(nameText, bio);
  });

  // Pass 2: fallback for pages that just list names as plain headings or
  // links (a Hall of Fame roster, a simple bulleted list) with no obvious
  // "card" wrapper. Lower precision, so cap how many it can add.
  if (found.size < 30) {
    $(`${HEADING_SELECTORS}, a`).each((_, el) => {
      if (found.size >= 30) return false;
      const $el = $(el);
      const nameText = $el.text().trim();
      if (!looksLikeName(nameText) || found.has(nameText)) return;

      let bio = $el.next('p').text().trim().replace(/\s+/g, ' ');
      if (!bio) bio = $el.parent().next('p').text().trim().replace(/\s+/g, ' ');
      if (!bio) bio = $el.closest('li, p').text().trim().replace(/\s+/g, ' ').slice(0, 160);
      bio = bio.slice(0, 160);

      found.set(nameText, bio);
    });
  }

  return Array.from(found, ([alum_name, bio]) => ({
    alum_name,
    note: `Auto-found on ${new URL(sourceUrl).hostname}${bio ? ' — ' + bio : ''}`.slice(0, 220),
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
