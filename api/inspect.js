// Debug tool, not part of normal operation. Fetches one URL and reports
// exactly what the extractor sees there — heading text, whether each
// heading has an immediate-sibling paragraph, how many "card" containers
// matched — so a page returning 0 candidates can actually be diagnosed
// instead of guessed at. Open /api/inspect?url=<page> directly in a
// browser.

const cheerio = require('cheerio');

const CARD_SELECTORS = 'article, li, .card, .person, .profile, .alum, .alumni, .spotlight, .people, .team-member, .bio';
const HEADING_SELECTORS = 'h1, h2, h3, h4, h5, strong, b';
const NON_HUMAN_SITE_CHROME = 'script, style, noscript, nav, footer, header, form, [id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i], [id*="onetrust" i], [class*="onetrust" i]';
const PROFILE_LINK_HINT = /alumni|notable|spotlight|profile|bio|inductee|hof|distinguished/i;

module.exports = async (req, res) => {
  const url = req.query.url;
  if (!url) { res.status(400).json({ error: 'Missing ?url=' }); return; }

  let html;
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Connect.AI-Alumni-Tracker/1.0; class project)' },
      signal: AbortSignal.timeout(12000),
    });
    if (!resp.ok) { res.status(200).json({ error: `HTTP ${resp.status}` }); return; }
    html = await resp.text();
  } catch (err) {
    res.status(200).json({ error: `${err.name}: ${err.message}` });
    return;
  }

  const $ = cheerio.load(html);
  $(NON_HUMAN_SITE_CHROME).remove();

  const title = $('title').first().text().trim();

  const headingCounts = {};
  ['h1', 'h2', 'h3', 'h4', 'h5', 'strong', 'b'].forEach(tag => { headingCounts[tag] = $(tag).length; });

  const sampleHeadings = [];
  $(HEADING_SELECTORS).slice(0, 25).each((_, el) => {
    const $el = $(el);
    const text = $el.text().trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!text) return;
    const nextP = $el.next('p').text().trim().replace(/\s+/g, ' ').slice(0, 80);
    sampleHeadings.push({ tag: el.tagName, text, hasImmediateNextParagraph: !!nextP, nextP: nextP || null });
  });

  const cards = $(CARD_SELECTORS);
  const cardSample = [];
  cards.slice(0, 8).each((_, el) => {
    const $el = $(el);
    const headingsIn = $el.find(HEADING_SELECTORS).length;
    const firstHeading = $el.find(HEADING_SELECTORS).first().text().trim().slice(0, 50);
    const pCount = $el.find('p').length;
    cardSample.push({ headingsInCard: headingsIn, firstHeadingText: firstHeading, paragraphCount: pCount });
  });

  const profileLinks = [];
  let base;
  try { base = new URL(url); } catch (e) { /* leave undefined */ }
  $('a[href]').each((_, el) => {
    if (profileLinks.length >= 15) return false;
    const href = $(el).attr('href');
    if (!href || !base) return;
    let abs;
    try { abs = new URL(href, base); } catch (e) { return; }
    if (!PROFILE_LINK_HINT.test(abs.pathname)) return;
    profileLinks.push({ href: abs.toString(), linkText: $(el).text().trim().slice(0, 60) });
  });

  res.status(200).json({
    url,
    title,
    htmlLength: html.length,
    headingCounts,
    cardSelectorMatches: cards.length,
    cardSample,
    sampleHeadings,
    profileLinksFound: profileLinks.length,
    profileLinkSample: profileLinks,
  });
};
