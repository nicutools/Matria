const TGA_PAGE = 'https://www.tga.gov.au/resources/health-professional-information-and-resources/australian-categorisation-system-prescribing-medicines-pregnancy/prescribing-medicines-pregnancy-database';
const TGA_BASE = 'https://www.tga.gov.au';

export async function onRequest({ request }) {
  const url = new URL(request.url);
  if (url.searchParams.get('ping') === '1') {
    return Response.json({ ok: true });
  }

  try {
    // Use Cloudflare's fetch with cf options to avoid edge caching issues
    const res = await fetch(TGA_PAGE, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Matria/1.0; +https://matria.nicutools.org)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      cf: { cacheTtl: 0, cacheEverything: false },
    });

    if (!res.ok) {
      return Response.json(
        { found: false, error: `TGA returned HTTP ${res.status}` },
        { status: 502 },
      );
    }

    const html = await res.text();
    const match = html.match(/["']([^"']*\.csv[^"']*?)["']/i);

    if (!match) {
      return Response.json(
        { found: false, error: 'No CSV link found on TGA page' },
        { status: 404 },
      );
    }

    const csvPath = match[1];
    const csvUrl = csvPath.startsWith('http') ? csvPath : TGA_BASE + csvPath;

    return Response.json(
      { found: true, csvUrl },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return Response.json(
      { found: false, error: `Fetch failed: ${err.message}` },
      { status: 502 },
    );
  }
}
