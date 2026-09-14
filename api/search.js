// Runs on a schedule (see vercel.json crons), free under Google's Custom
// Search API daily quota (100 queries/day at no cost). Runs each query in
// the `search_queries` table, pulls candidate names out of the result
// titles/snippets, and drops new ones into the `suggestions` queue.
//
// This is how we get relevance-ranked, "search the whole web" style
// discovery (LinkedIn included, since Google indexes public LinkedIn
// profile pages) without scraping LinkedIn directly — LinkedIn blocks
// scrapers and disallows it in their terms; reading what Google's public
// index already shows about a public page is a different thing.
//
// Heuristic-based, not perfect. Meant to surface leads for a human to
// glance at and claim or dismiss, same as any other suggestion.

const { createClient } = require('@supabase/supabase-js');
const { looksLikeName } = require('../lib/nameFilter');

const GOOGLE_SEARCH_ENDPOINT = 'https://www.googleapis.com/customsearch/v1';

// Google result titles are usually "Name - Site", "Name | Site",
// "Name's Post", "Name - Job Title - Company | LinkedIn", etc.
// Pull the leading name-shaped chunk off the front.
function nameFromTitle(title) {
  if (!title) return null;
  const firstChunk = title.split(/\s[-|–—]\s/)[0].trim();
  const noPossessive = firstChunk.replace(/[’']s\b.*$/, '').trim();
  if (looksLikeName(noPossessive)) return noPossessive;
  // Try just the first two capitalized words as a last resort.
  const words = noPossessive.split(/\s+/).slice(0, 3).join(' ');
  return looksLikeName(words) ? words : null;
}

module.exports = async (req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  const googleKey = process.env.GOOGLE_SEARCH_API_KEY;
  const googleCx = process.env.GOOGLE_SEARCH_CX;

  if (!supabaseUrl || !supabaseKey) {
    res.status(500).json({ error: 'SUPABASE_URL / SUPABASE_ANON_KEY not set on this Vercel project.' });
    return;
  }
  if (!googleKey || !googleCx) {
    res.status(500).json({ error: 'GOOGLE_SEARCH_API_KEY / GOOGLE_SEARCH_CX not set on this Vercel project.' });
    return;
  }

  const supa = createClient(supabaseUrl, supabaseKey);

  const { data: queries, error: qErr } = await supa.from('search_queries').select('*');
  if (qErr) {
    res.status(500).json({ error: qErr.message });
    return;
  }
  if (!queries || !queries.length) {
    res.status(200).json({ message: 'No search_queries configured yet — add rows to the search_queries table.' });
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
  for (const q of queries) {
    try {
      const apiUrl = `${GOOGLE_SEARCH_ENDPOINT}?key=${encodeURIComponent(googleKey)}&cx=${encodeURIComponent(googleCx)}&q=${encodeURIComponent(q.query)}&num=10`;
      const resp = await fetch(apiUrl, { signal: AbortSignal.timeout(10000) });
      const body = await resp.json();

      if (!resp.ok) {
        results.push({ query: q.query, error: body?.error?.message || `HTTP ${resp.status}` });
        continue;
      }

      const items = body.items || [];
      const seenThisQuery = new Set();
      let added = 0;

      for (const item of items) {
        const name = nameFromTitle(item.title);
        if (!name) continue;
        const key = name.toLowerCase();
        if (known.has(key) || seenThisQuery.has(key)) continue;
        seenThisQuery.add(key);
        known.add(key);

        const snippet = (item.snippet || '').replace(/\s+/g, ' ').slice(0, 160);
        const note = `Auto-found via search "${q.query}" — ${snippet || item.link}`.slice(0, 220);

        const { error: insErr } = await supa.from('suggestions').insert({
          alum_name: name,
          note,
          suggested_by: 'Auto-search',
        });
        if (!insErr) added++;
      }

      await supa.from('search_queries').update({
        last_run_at: new Date().toISOString(),
        last_found_count: added,
      }).eq('id', q.id);

      results.push({ query: q.query, items: items.length, added });
    } catch (err) {
      const detail = err?.cause?.message || err?.cause?.code || err?.message || String(err);
      results.push({ query: q.query, error: `${err.name || 'Error'}: ${detail}` });
    }
  }

  res.status(200).json({ ran: queries.length, results });
};
