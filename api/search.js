// Runs on a schedule (see vercel.json crons). No API key, no account, no
// billing card — queries DuckDuckGo's public HTML results page directly
// (html.duckduckgo.com/html/), which needs no auth and has no paid tier
// to accidentally hit. This is not an official API and is a step down in
// result quality from a real search index, but it's genuinely free with
// nothing to sign up for. Low-volume, occasional use like this daily cron
// is the kind of thing DuckDuckGo doesn't enforce against (unlike
// LinkedIn, which actively blocks and pursues scrapers) — still, keep
// query volume modest and don't turn this into a high-frequency job.
//
// Runs each query in the `search_queries` table, pulls candidate names
// out of the result titles/snippets, and drops new ones into the
// `suggestions` queue.
//
// Heuristic-based, not perfect. Meant to surface leads for a human to
// glance at and claim or dismiss, same as any other suggestion.

const { createClient } = require('@supabase/supabase-js');
const { looksLikeName, isRelevantBio, isNotAlumniBio } = require('../lib/nameFilter');
const { ddgSearch } = require('../lib/ddg');

// DuckDuckGo result titles are usually "Name - Site", "Name | Site",
// "Name's Post", "Name - Job Title - Company | LinkedIn", etc.
// Pull the leading name-shaped chunk off the front.
function nameFromTitle(title) {
  if (!title) return null;
  const firstChunk = title.split(/\s[-|–—]\s/)[0].trim();
  const noPossessive = firstChunk.replace(/[’']s\b.*$/, '').trim();
  if (looksLikeName(noPossessive)) return noPossessive;
  const words = noPossessive.split(/\s+/).slice(0, 3).join(' ');
  return looksLikeName(words) ? words : null;
}

module.exports = async (req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    res.status(500).json({ error: 'SUPABASE_URL / SUPABASE_ANON_KEY not set on this Vercel project.' });
    return;
  }
  const supa = createClient(supabaseUrl, supabaseKey);

  const { data: queries, error: qErr } = await supa.from('search_queries').select('*');
  if (qErr) {
    res.status(500).json({ error: qErr.message });
    return;
  }
  if (!queries || !queries.length) {
    res.status(200).json({ message: 'No search_queries configured yet — add rows to the search_queries table, or use the dashboard.' });
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
      const items = await ddgSearch(`${q.query} uconn`);
      const seenThisQuery = new Set();
      let added = 0;

      for (const item of items) {
        const name = nameFromTitle(item.title);
        if (!name) continue;
        const key = name.toLowerCase();
        if (known.has(key) || seenThisQuery.has(key)) continue;
        seenThisQuery.add(key);
        known.add(key);

        const snippet = (item.snippet || '').replace(/\s+/g, ' ').slice(0, 120);
        if (!isRelevantBio(snippet) || isNotAlumniBio(snippet)) continue;
        const note = `Found via search — ${snippet || item.link}`.slice(0, 180);

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
