// Shared page-parsing engine: given a page's HTML, pull out anything that
// looks like a real person's name paired with a short bio. Used by the
// direct page scanner (api/scrape.js) and Common Crawl-based discovery
// (api/discover.js) — same extraction logic, different ways of finding
// which URLs to run it on.

const cheerio = require('cheerio');
const { looksLikeName } = require('./nameFilter');

const CARD_SELECTORS = 'article, li, .card, .person, .profile, .alum, .alumni, .spotlight, .people, .team-member, .bio';
const HEADING_SELECTORS = 'h1, h2, h3, h4, h5, strong, b';
const NON_HUMAN_SITE_CHROME = 'script, style, noscript, nav, footer, header, form, [id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i], [id*="onetrust" i], [class*="onetrust" i], [id*="privacy" i], [class*="privacy" i], [id*="gdpr" i], [class*="gdpr" i], [role="dialog"], [aria-modal="true"]';

// A person-page path looks like /alumni/jane-doe or /profile/123 —
// worth following one hop from a roster/listing page. Kept conservative:
// only same-host links whose path contains a relevant word.
const PROFILE_LINK_HINT = /alumni|notable|spotlight|profile|bio|inductee|hof/i;

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
  // No topic/relevance filtering here on purpose: the caller already
  // chose (or discovered via a scoped domain) a page worth reading —
  // trust that instead of re-guessing relevance from bio wording, which
  // rejects real matches whose phrasing doesn't hit a keyword list.
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

// One hop of real crawling: from a roster/listing page, find same-host
// links whose path looks like an individual profile, so callers can
// fetch those too — a person's own page usually has a far better bio
// than a roster's one-line summary. Capped and same-host only.
function findProfileLinks(html, sourceUrl, cap = 5) {
  const $ = cheerio.load(html);
  $(NON_HUMAN_SITE_CHROME).remove();
  const base = new URL(sourceUrl);
  const links = new Set();

  $('a[href]').each((_, el) => {
    if (links.size >= cap) return false;
    const href = $(el).attr('href');
    if (!href) return;
    let abs;
    try { abs = new URL(href, base); } catch (e) { return; }
    if (abs.hostname !== base.hostname) return;
    if (abs.pathname === base.pathname) return;
    if (!PROFILE_LINK_HINT.test(abs.pathname)) return;
    if (/\.(pdf|jpg|jpeg|png|gif|zip|docx?|xlsx?)$/i.test(abs.pathname)) return;
    abs.hash = '';
    links.add(abs.toString());
  });

  return Array.from(links).slice(0, cap);
}

module.exports = { extractCandidates, findProfileLinks, cleanText };
