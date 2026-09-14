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

const NAME_RE = /^[A-Z][a-zA-Z'’.-]+(?:\s+[A-Z][a-zA-Z'’.-]+){1,3}$/;
const STOPWORDS = new Set([
  'Read More', 'Contact Us', 'Learn More', 'Apply Now', 'Meet Our', 'About Us',
  'Notable Alumni', 'Our Team', 'Get Involved', 'Quick Links', 'Skip To',
]);
const CARD_SELECTORS = 'article, li, .card, .person, .profile, .alum, .alumni, .spotlight, .people, .team-member, .bio';
const HEADING_SELECTORS = 'h1, h2, h3, h4, strong, b';

function looksLikeName(text) {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t || t.length > 45) return false;
  if (STOPWORDS.has(t)) return false;
  if (/\d/.test(t)) return false;
  return NAME_RE.test(t);
}

function extractCandidates(html, sourceUrl) {
  const $ = cheerio.load(html);
  const found = new Map();

  $(CARD_SELECTORS).each((_, card) => {
    const $card = $(card);
    const heading = $card.find(HEADING_SELECTORS).first();
    const nameText = heading.text().trim();
    if (!looksLikeName(nameText)) return;

    let bio = $card.find('p').first().text().trim().replace(/\s+/g, ' ');
    if (!bio || bio === nameText) bio = $card.text().trim().replace(/\s+/g, ' ').slice(0, 160);
    bio = bio.slice(0, 160);

    if (!found.has(nameText)) found.set(nameText, bio);
  });

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
        headers: { 'User-Agent': 'Connect.AI-Alumni-Tracker/1.0 (class project, contact via site)' },
        signal: AbortSignal.timeout(10000),
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
      results.push({ url: page.url, error: String(err.message || err) });
    }
  }

  res.status(200).json({ scanned: pages.length, results });
};
