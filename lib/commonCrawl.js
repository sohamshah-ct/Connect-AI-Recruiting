// Common Crawl (commoncrawl.org) is a nonprofit that crawls and publicly
// archives billions of web pages — free, no API key, no account, no
// billing card, updated roughly monthly. This is the same category of
// data Google's own index is built from, just openly published instead
// of kept behind a paid API. We use its free CDX index server purely for
// URL DISCOVERY: "what pages exist under this UConn subdomain that look
// alumni-related?" — then fetch those pages live over normal HTTPS (not
// from Common Crawl's archived copy) and run them through the same
// extractor the direct page scanner uses.

const CDX_HOST = 'https://index.commoncrawl.org';

async function latestIndexId() {
  const resp = await fetch(`${CDX_HOST}/collinfo.json`, { signal: AbortSignal.timeout(10000) });
  if (!resp.ok) throw new Error(`collinfo.json HTTP ${resp.status}`);
  const list = await resp.json();
  if (!Array.isArray(list) || !list.length) throw new Error('collinfo.json returned no crawls');
  return list[0].id; // most recent crawl first
}

// Every URL Common Crawl has archived under a subdomain (and its own
// subdomains), most recent crawl only. Returns raw CDX records.
async function cdxDomainQuery(indexId, host, limit = 400) {
  const qs = new URLSearchParams({
    url: host,
    matchType: 'domain',
    output: 'json',
    filter: 'status:200',
    collapse: 'urlkey',
    fl: 'url,status',
    limit: String(limit),
  });
  const resp = await fetch(`${CDX_HOST}/${indexId}-index?${qs}`, { signal: AbortSignal.timeout(15000) });
  if (resp.status === 404) return []; // this index has nothing for that host
  if (!resp.ok) throw new Error(`CDX HTTP ${resp.status}`);
  const text = await resp.text();
  if (!text.trim()) return [];
  return text.trim().split('\n').map(line => {
    try { return JSON.parse(line); } catch (e) { return null; }
  }).filter(Boolean);
}

module.exports = { latestIndexId, cdxDomainQuery };
