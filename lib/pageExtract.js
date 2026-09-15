// Shared page-parsing engine: given a page's HTML, pull out anything that
// looks like a real person's name paired with a short bio. Used by the
// direct page scanner (api/scrape.js) and Common Crawl-based discovery
// (api/discover.js) — same extraction logic, different ways of finding
// which URLs to run it on.

const cheerio = require('cheerio');
const { looksLikeName, isNotAlumniBio } = require('./nameFilter');

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

// Looks for a paragraph "near" a heading without ever crossing into a
// different entry: first tries the immediate next sibling, then — if
// that's empty — walks forward through the heading's OWN siblings (same
// parent only, never jumping to a different parent's sibling, which is
// what caused the earlier cross-contamination bug) until it hits either
// a paragraph or another heading. Hitting another heading first means
// there's no bio here — that's the next entry starting, not this one's.
function bioNear($, el) {
  const $el = $(el);
  let bio = cleanText($el.next('p').text());
  if (bio) return bio;

  const parent = $el.parent();
  const siblings = parent.children().toArray();
  const idx = siblings.indexOf(el);
  if (idx === -1) return '';
  for (let i = idx + 1; i < siblings.length; i++) {
    const sib = siblings[i];
    if (sib.tagName && /^(h1|h2|h3|h4|h5|strong|b)$/i.test(sib.tagName)) break;
    const $sib = $(sib);
    if ($sib.is('p')) {
      bio = cleanText($sib.text());
      if (bio) return bio;
    }
  }
  return '';
}

function extractCandidates(html, sourceUrl) {
  const $ = cheerio.load(html);
  $(NON_HUMAN_SITE_CHROME).remove();
  const found = new Map();

  // Pass 1: card-shaped containers (bio pages, spotlight lists) — the
  // strongest signal, since heading + paragraph is a real profile shape.
  //
  // A card can legitimately hold MULTIPLE headings (a headline plus a
  // separate "Sarah Thomas '04 (CLAS)" name heading is a real, common
  // shape) — so instead of requiring exactly one heading, find the ONE
  // heading in the card whose text actually looks like a name. Still
  // guards against a container wrapping multiple different PEOPLE: if
  // more than one heading in the card looks like a name, it's ambiguous
  // which bio belongs to which, so skip rather than guess.
  //
  // Nested containers (an <article> inside an <li> that both match
  // CARD_SELECTORS) would otherwise get counted as two overlapping
  // "cards" for the same entry — keep only the innermost match per
  // branch (the one with no matching descendant of its own).
  const allCards = $(CARD_SELECTORS).toArray();
  const cardSet = new Set(allCards);
  const innerCards = allCards.filter(card => {
    let hasMatchingDescendant = false;
    $(card).find(CARD_SELECTORS).each((_, desc) => { if (cardSet.has(desc)) hasMatchingDescendant = true; });
    return !hasMatchingDescendant;
  });

  innerCards.forEach(card => {
    const $card = $(card);
    const headings = $card.find(HEADING_SELECTORS).toArray();
    const nameHeadings = headings.filter(h => looksLikeName($(h).text().trim()));
    if (nameHeadings.length !== 1) return;
    const nameEl = nameHeadings[0];
    const nameText = $(nameEl).text().trim();

    let bio = bioNear($, nameEl);
    if (!bio) bio = cleanText($card.find('p').first().text());
    bio = bio.slice(0, 130);
    if (!bio || bio === nameText || isNotAlumniBio(bio)) return;

    if (!found.has(nameText)) found.set(nameText, bio);
  });

  // Pass 2: fallback for pages that just list names as plain headings
  // (a Hall of Fame roster, a simple bulleted list) with no obvious
  // "card" wrapper, or where no card matched at all.
  if (found.size < 30) {
    $(HEADING_SELECTORS).each((_, el) => {
      if (found.size >= 30) return false;
      const $el = $(el);
      const nameText = $el.text().trim();
      if (!looksLikeName(nameText) || found.has(nameText)) return;

      const bio = bioNear($, el).slice(0, 130);
      if (!bio || isNotAlumniBio(bio)) return;

      found.set(nameText, bio);
    });
  }

  return Array.from(found, ([alum_name, bio]) => ({
    alum_name,
    note: `${matchReason(sourceUrl)}${bio ? ' — ' + bio : ''}`.slice(0, 180),
  }));
}

// A plain-language citation for where/why this candidate showed up —
// not AI-generated reasoning, just making the actual evidence (source
// page, and what about its URL looked alumni-shaped) explicit instead
// of a bare "Found on X" that gives no sense of why it was trusted.
function matchReason(sourceUrl) {
  let host = sourceUrl;
  let hint = '';
  try {
    const u = new URL(sourceUrl);
    host = u.hostname;
    const path = u.pathname.toLowerCase();
    if (/alumni/.test(path)) hint = ' (URL path names "alumni")';
    else if (/notable|distinguished|inductee|hof/.test(path)) hint = ' (URL path suggests a notable-alumni page)';
    else if (/spotlight|profile|bio/.test(path)) hint = ' (URL path suggests an individual profile)';
  } catch (e) { /* leave hint blank */ }
  return `Found on ${host}${hint}`;
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
