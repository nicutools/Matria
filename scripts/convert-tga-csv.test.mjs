// Run with: npm test  (node:test — no test framework dependency)
//
// These cover the date logic specifically, because a wrong date here is shown
// to a clinician as a currency claim about pregnancy-safety data.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractDateFromUrl,
  validateIsoDate,
  dateFromLastModified,
  pickCsvLink,
} from './convert-tga-csv.js';

test('extracts an ISO date from the CSV filename', () => {
  assert.equal(
    extractDateFromUrl('https://tga.gov.au/x/medicines-pregnancy-current-database-2026-05-19.csv'),
    '2026-05-19',
  );
});

test('extracts a YYMMDD date from the CSV filename', () => {
  assert.equal(
    extractDateFromUrl('https://tga.gov.au/x/medicines_in_pregnancy_for_web_250818.csv'),
    '2025-08-18',
  );
});

test('never invents a date when the filename has none', () => {
  // Regression: this used to return TODAY, silently stamping a fresh currency
  // date onto data of completely unknown age.
  assert.equal(extractDateFromUrl('https://tga.gov.au/x/pregnancy-database.csv'), null);
  assert.equal(extractDateFromUrl('https://tga.gov.au/x/current.csv'), null);
});

test('rejects six digits that are not a real date', () => {
  // Regression: "123456" became "2012-34-56", which rendered to clinicians as
  // the literal string "Invalid Date".
  assert.equal(extractDateFromUrl('https://tga.gov.au/x/export-123456.csv'), null);
  assert.equal(extractDateFromUrl('https://tga.gov.au/x/export-999999.csv'), null);
});

test('rejects impossible calendar dates', () => {
  assert.equal(extractDateFromUrl('https://tga.gov.au/x/db-2026-02-31.csv'), null);
  assert.equal(extractDateFromUrl('https://tga.gov.au/x/db-2026-13-01.csv'), null);
});

test('handles non-string input without throwing', () => {
  assert.equal(extractDateFromUrl(null), null);
  assert.equal(extractDateFromUrl(undefined), null);
  assert.equal(extractDateFromUrl(42), null);
});

test('validateIsoDate accepts real dates and rejects the rest', () => {
  assert.equal(validateIsoDate('2026-05-19'), '2026-05-19');
  assert.equal(validateIsoDate('2026-02-29'), null); // 2026 is not a leap year
  assert.equal(validateIsoDate('2024-02-29'), '2024-02-29'); // 2024 is
  assert.equal(validateIsoDate('1999-01-01'), null); // implausibly early
  assert.equal(validateIsoDate('2026-5-19'), null); // not zero-padded
  assert.equal(validateIsoDate(''), null);
});

test('falls back to a Last-Modified header', () => {
  assert.equal(dateFromLastModified('Tue, 19 May 2026 02:01:56 GMT'), '2026-05-19');
});

test('ignores an unusable Last-Modified header', () => {
  assert.equal(dateFromLastModified('not a date'), null);
  assert.equal(dateFromLastModified(''), null);
  assert.equal(dateFromLastModified(null), null);
});

test('picks the pregnancy CSV over any other CSV on the page', () => {
  assert.equal(
    pickCsvLink([
      'https://www.tga.gov.au/sites/default/files/other-report.csv',
      'https://www.tga.gov.au/sites/default/files/2026-05/medicines-pregnancy-current-database-2026-05-19.csv',
    ]),
    'https://www.tga.gov.au/sites/default/files/2026-05/medicines-pregnancy-current-database-2026-05-19.csv',
  );
});

test('makes a root-relative CSV link absolute', () => {
  assert.equal(
    pickCsvLink(['/sites/default/files/medicines-pregnancy.csv']),
    'https://www.tga.gov.au/sites/default/files/medicines-pregnancy.csv',
  );
});

test('ignores links that only mention csv, and reports none found', () => {
  assert.equal(pickCsvLink(['https://www.tga.gov.au/csv-help', 'https://www.tga.gov.au/']), null);
  assert.equal(pickCsvLink([]), null);
});
