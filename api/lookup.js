// On-demand, single-person lookup for the Email Draft tool — a targeted,
// fresh DuckDuckGo search for one contact, run only when someone clicks
// "Look up info about them," not on a schedule. Free, no API key.
//
// This exists so the email template never auto-inserts stale, garbled
// text scraped in bulk days ago. A live, targeted "<name> uconn" search
// tends to return a cleaner top result than a broad discovery query does.

const { isOffTopicBio } = require('../lib/nameFilter');
const { ddgSearch } = require('../lib/ddg');

function cleanSnippet(s) {
  return (s || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\)([^\s)])/g, ') $1')
    .replace(/\s+/g, ' ')
    .trim();
}

// Cut to one clean clause — never the full raw snippet — so what lands in
// the draft always reads as a fragment to build a sentence around, not
// finished prose.
function oneClause(text, cap = 110) {
  let clause = text.split(/[.;]\s|\s—\s/)[0].trim();
  if (clause.length > cap) {
    clause = clause.slice(0, cap);
    const lastSpace = clause.lastIndexOf(' ');
    if (lastSpace > 40) clause = clause.slice(0, lastSpace);
    clause += '…';
  }
  return clause;
}

module.exports = async (req, res) => {
  const name = (req.query.name || '').trim();
  if (!name) {
    res.status(400).json({ ok: false, message: 'Missing ?name=' });
    return;
  }

  try {
    const items = await ddgSearch(`${name} uconn`);
    for (const item of items) {
      const snippet = cleanSnippet(item.snippet);
      if (!snippet || isOffTopicBio(snippet)) continue;
      const bio = oneClause(snippet);
      if (bio.length < 15) continue; // too thin to be useful
      let source = '';
      try { source = new URL(item.link).hostname; } catch (e) { /* leave blank */ }
      res.status(200).json({ ok: true, bio, source, link: item.link });
      return;
    }
    res.status(200).json({ ok: false, message: 'Nothing useful turned up — try adding this manually.' });
  } catch (err) {
    const detail = err?.cause?.message || err?.cause?.code || err?.message || String(err);
    res.status(500).json({ ok: false, message: `${err.name || 'Error'}: ${detail}` });
  }
};
