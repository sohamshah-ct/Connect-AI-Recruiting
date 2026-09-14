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
  'home', 'page', 'sitemap', 'directory', 'staff', 'faculty', 'student',
  'students', 'admissions', 'giving', 'donate', 'calendar', 'view', 'all',
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

module.exports = { looksLikeName, NAME_RE, BANNED_WORDS };
