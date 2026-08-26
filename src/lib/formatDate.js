// Date parsing and formatting for source-asserted dates (TGA database revision
// dates, FDA label effective dates). These are shown to clinicians as a
// currency claim, so they must be exact or absent — never approximate, never
// invented.
//
// The subtlety: `new Date('2026-04-15')` is parsed by JavaScript as UTC
// midnight, but `toLocaleDateString` renders in the viewer's local zone. West
// of UTC that lands on the previous day, so a label effective 15 April is
// displayed as 14 April for every user in the Americas. Constructing from
// explicit parts forces a local-midnight parse and removes the shift.

/**
 * Parses an ISO `YYYY-MM-DD` string to a local-midnight Date.
 * Returns null for anything that is not a real calendar date, so a malformed
 * upstream value renders as nothing rather than as "Invalid Date".
 */
export function parseIsoDate(iso) {
  if (typeof iso !== 'string') return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(year, month - 1, day);

  // Reject values that don't round-trip: 2026-02-31, 2026-13-01, 2012-34-56.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

const DAY_FORMAT = { year: 'numeric', month: 'short', day: 'numeric' };
const MONTH_FORMAT = { year: 'numeric', month: 'short' };

/** Formats an ISO date as e.g. "Apr 15, 2026". Null in, null out. */
export function formatIsoDate(iso, options = DAY_FORMAT) {
  const date = parseIsoDate(iso);
  return date ? date.toLocaleDateString('en-US', options) : null;
}

/** Formats an ISO date to month precision, e.g. "May 2026". */
export function formatIsoMonth(iso) {
  return formatIsoDate(iso, MONTH_FORMAT);
}

/**
 * Formats an FDA `effectiveTime` (compact `YYYYMMDD`) as e.g. "Apr 15, 2026".
 * Returns null if it is not a real calendar date.
 */
export function formatCompactDate(yyyymmdd) {
  if (typeof yyyymmdd !== 'string' || !/^\d{8}$/.test(yyyymmdd.trim())) return null;
  const s = yyyymmdd.trim();
  return formatIsoDate(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`);
}
