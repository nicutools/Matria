// Proxied through Cloudflare Pages Function to avoid CORS restrictions
const SEARCH_BASE = '/api/search';

export async function searchDrugs(query, signal) {
  if (!query.trim()) return { results: [] };

  const params = new URLSearchParams({
    drug_name: query.trim(),
  });

  const res = await fetch(`${SEARCH_BASE}?${params}`, { signal });
  if (!res.ok) throw new Error(`Search error: ${res.status}`);

  const json = await res.json();

  return { results: json.results || [] };
}
