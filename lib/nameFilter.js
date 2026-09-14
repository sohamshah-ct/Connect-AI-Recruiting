// Shared "does this look like a real person's name" heuristic, used by
// both the page scraper (api/scrape.js) and the search-based discovery
// (api/search.js). Not perfect — a filter for obvious junk, not a
// verifier of real people.

const NAME_RE = /^[A-Z][a-zA-Z'’.-]+(?:\s+[A-Z][a-zA-Z'’.-]+){1,3}$/;

// Words that show up in site chrome, cookie banners, section titles, and
// generic search-result boilerplate — filtered out even though they can
// otherwise look like a capitalized multi-word phrase.
const BANNED_WORDS = new Set([
  'cookie', 'cookies', 'tracking', 'protection', 'consent', 'privacy',
  'party', 'third-party', 'enhanced', 'persistent', 'strict', 'custom',
  'block', 'blocking', 'manually', 'choose', 'section', 'settings',
  'preferences', 'nominate', 'nomination', 'nominations', 'inductees',
  'inductee', 'members', 'member', 'alumni', 'alumnus', 'hall', 'fame',
  'read', 'more', 'contact', 'learn', 'apply', 'about', 'team', 'our',
  'get', 'involved', 'quick', 'links', 'skip', 'menu', 'search', 'login',
  'sign', 'subscribe', 'newsletter', 'share', 'follow', 'accept', 'decline',
  'notable', 'featured', 'spotlight', 'profiles', 'news', 'events',
  'linkedin', 'facebook', 'twitter', 'instagram', 'youtube', 'university',
  'connecticut', 'uconn', 'school', 'college', 'department', 'office',
  'engagement', 'external', 'foundation', 'magazine', 'today', 'welcome',
  'home', 'page', 'pages', 'sitemap', 'site', 'directory', 'staff', 'faculty',
  'student', 'students', 'admissions', 'giving', 'donate', 'calendar', 'view',
  'all', 'a-z', 'index', 'map', 'accessibility', 'title', 'ix', 'copyright',
]);

function looksLikeName(text) {
  const t = (text || '').trim().replace(/\s+/g, ' ');
  if (!t || t.length > 45) return false;
  if (/\d/.test(t)) return false;
  if (!NAME_RE.test(t)) return false;
  const words = t.toLowerCase().split(/\s+/);
  if (words.some(w => BANNED_WORDS.has(w))) return false;
  return true;
}

// Blocklisting every sports/entertainment term that could show up on a
// "notable alumni" page is a losing game (mls, emmy, all-american,
// figure skater, animator, ... the list never ends). Flip it: Connect.AI
// wants tech/business/consulting leads specifically, so require the bio
// to actually signal that, instead of trying to name everything it isn't.
const RELEVANT_BIO_TERMS = [
  'business', 'founder', 'co-founder', 'entrepreneur', 'startup', 'start-up',
  'ceo', 'cfo', 'coo', 'cto', 'chief executive', 'chief operating',
  'chief financial', 'chief technology', 'president', 'vice president',
  'executive', 'director', 'manager', 'partner', 'board member',
  'engineer', 'engineering', 'software', 'developer', 'programmer',
  'product manager', 'technology', 'tech company', 'ai ', 'artificial intelligence',
  'machine learning', 'data scien', 'data analy', 'consultant', 'consulting',
  'finance', 'financial', 'investment', 'venture cap', 'private equity',
  'banking', 'analyst', 'marketing', 'sales', 'operations', 'strategy',
  'industry', 'company', 'corporation', 'firm', 'enterprise', 'nonprofit',
  'organization', 'law firm', 'attorney', 'real estate', 'healthcare',
  'medicine', 'physician', 'biotech', 'pharmaceutical',
];

function isRelevantBio(bio) {
  if (!bio) return false;
  const b = bio.toLowerCase();
  return RELEVANT_BIO_TERMS.some(term => b.includes(term));
}

module.exports = { looksLikeName, isRelevantBio, NAME_RE, BANNED_WORDS };
