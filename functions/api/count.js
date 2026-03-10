export async function onRequest(context) {
  const url = new URL(context.request.url);
  const term = url.searchParams.get('q')?.trim();

  if (!term) {
    return new Response('', { status: 400 });
  }

  const kv = context.env?.SEARCH_COUNTS || null;
  if (kv) {
    const key = term.toLowerCase();
    context.waitUntil(
      kv.get(key).then((val) => kv.put(key, String((parseInt(val) || 0) + 1)))
    );
  }

  return new Response('', { status: 204 });
}
