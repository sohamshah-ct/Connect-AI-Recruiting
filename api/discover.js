// Real web-scale discovery, free: queries Common Crawl's public index
// (see lib/commonCrawl.js) for URLs under each configured UConn subdomain
// whose path looks alumni-related, fetches those pages live, and runs
// them through the same extractor the direct page scanner uses. This is
// how the class gets candidates from pages nobody manually added to
// watch_pages — discovered the same way a search engine discovers pages,
// via a real crawl index, not a fixed list.
//
// No API key, no account, no billing card. Not real-time (Common Crawl
// updates roughly monthly) and not exhaustive (a page has to have been
// crawled by Common Crawl to show up here) — a genuinely free, genuinely
// automated middle ground between "pages you pick by hand" and "an index
// only a paid API can query."

const { createClient } = require('@supabase/supabase-js');
const { extractCandidates } = require('../lib/pageExtract');
const { latestIndexId, cdxDomainQuery } = require('../lib/commonCrawl');

const PROFILE_HINT = /alumni|notable|spotlight|profile|inductee|hof|distinguished/i;
const SKIP_EXT = /\.(pdf|jpg|jpeg|png|gif|zip|docx?|xlsx?|css|js|xml|rss)$/i;
const MAX_PAGES_PER_DOMAIN = 8;

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; Connect.AI-Alumni-Tracker/1.0; class project)',
  'Accept': 'text/html,application/xhtml+xml',
};

module.exports = async (req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    res.status(500).json({ error: 'SUPABASE_URL / SUPABASE_ANON_KEY not set on this Vercel project.' });
    return;
  }
  const supa = createClient(supabaseUrl, supabaseKey);

  const { data: domains, error: domErr } = await supa.from('discover_domains').select('*');
  if (domErr) {
    res.status(500).json({ error: domErr.message });
    return;
  }
  if (!domains || !domains.length) {
    res.status(200).json({ message: 'No discover_domains configured — add rows to that table.' });
    return;
  }

  let indexId;
  try {
    indexId = await latestIndexId();
  } catch (err) {
    res.status(500).json({ error: `Could not reach Common Crawl: ${err.message}` });
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
  for (const domain of domains) {
    try {
      const records = await cdxDomainQuery(indexId, domain.host, 400);
      const candidateUrls = [];
      const seen = new Set();
      for (const r of records) {
        if (!r.url || seen.has(r.url)) continue;
        let u;
        try { u = new URL(r.url); } catch (e) { continue; }
        if (SKIP_EXT.test(u.pathname)) continue;
        if (!PROFILE_HINT.test(u.pathname)) continue;
        seen.add(r.url);
        candidateUrls.push(r.url);
        if (candidateUrls.length >= MAX_PAGES_PER_DOMAIN) break;
      }

      let added = 0;
      let pagesFetched = 0;
      for (const pageUrl of candidateUrls) {
        try {
          const resp = await fetch(pageUrl, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(10000) });
          if (!resp.ok) continue;
          pagesFetched++;
          const html = await resp.text();
          const candidates = extractCandidates(html, pageUrl);
          const fresh = candidates.filter(c => !known.has(c.alum_name.toLowerCase()));
          for (const c of fresh) {
            known.add(c.alum_name.toLowerCase());
            await supa.from('suggestions').insert({
              alum_name: c.alum_name,
              note: c.note,
              suggested_by: 'Auto-discover',
            });
            added++;
          }
        } catch (e) { /* skip a broken/slow page, keep going */ }
      }

      await supa.from('discover_domains').update({
        last_run_at: new Date().toISOString(),
        last_found_count: added,
      }).eq('id', domain.id);

      results.push({ host: domain.host, indexedUrls: records.length, pagesChecked: pagesFetched, added, checkedUrls: candidateUrls });
    } catch (err) {
      results.push({ host: domain.host, error: err.message });
    }
  }

  res.status(200).json({ indexId, scanned: domains.length, results });
};
