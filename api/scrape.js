// Runs on a schedule (see vercel.json crons) with no external API and no
// cost. Fetches every URL in the `watch_pages` table, pulls out anything
// that looks like a person's name paired with a short bio, and drops new
// ones into the `suggestions` queue for the class to review and claim.
//
// Also follows one hop of real links from each watched page to
// individual profile-shaped URLs on the same site (e.g. a roster page
// linking to /alumni/jane-doe) — a real crawling step, not just reading
// a single page — since a person's own page usually has a much better
// bio than a roster's one-line summary.
//
// Heuristic-based, not perfect — it's meant to surface candidates for a
// human to glance at and claim or dismiss, not to be trusted blindly.
// LinkedIn and anything requiring login are intentionally out of scope:
// LinkedIn blocks scrapers and scraping it violates their terms.

const { createClient } = require('@supabase/supabase-js');
const { extractCandidates, findProfileLinks } = require('../lib/pageExtract');

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; Connect.AI-Alumni-Tracker/1.0; class project)',
  'Accept': 'text/html,application/xhtml+xml',
};

async function fetchHtml(url) {
  const resp = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(12000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.text();
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
      const html = await fetchHtml(page.url);
      let candidates = extractCandidates(html, page.url);
      let linksFollowed = 0;

      // One hop: visit a handful of profile-shaped links found on this
      // page and extract from those too, merging in anything new.
      const profileLinks = findProfileLinks(html, page.url, 5);
      for (const link of profileLinks) {
        try {
          const linkHtml = await fetchHtml(link);
          const linkCandidates = extractCandidates(linkHtml, link);
          candidates = candidates.concat(linkCandidates);
          linksFollowed++;
        } catch (e) { /* skip a broken link, keep going */ }
      }

      // Dedupe (a name found on both the roster and its own profile page).
      const byName = new Map();
      candidates.forEach(c => { if (!byName.has(c.alum_name)) byName.set(c.alum_name, c); });
      candidates = Array.from(byName.values());

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

      results.push({ url: page.url, found: candidates.length, added: fresh.length, linksFollowed });
    } catch (err) {
      const detail = err?.cause?.message || err?.cause?.code || err?.message || String(err);
      results.push({ url: page.url, error: `${err.name || 'Error'}: ${detail}` });
    }
  }

  res.status(200).json({ scanned: pages.length, results });
};
