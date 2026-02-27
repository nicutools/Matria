export async function fetchPregnancy(genericName, signal) {
  const res = await fetch(
    `/api/pregnancy?name=${encodeURIComponent(genericName)}`,
    { signal },
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res.json();
}
