import { TGA_UPDATED, TGA_CHECKED } from '../api/tgaLookup';
import { formatIsoMonth, formatIsoDate } from '../lib/formatDate';

export default function Disclaimer() {
  const revised = formatIsoMonth(TGA_UPDATED);
  const checked = formatIsoDate(TGA_CHECKED);

  return (
    <footer className="px-4 py-6 text-center text-xs leading-relaxed text-slate-400 dark:text-slate-500">
      <p>
        Data from the{' '}
        <a
          href="https://www.tga.gov.au/resources/health-professional-information-and-resources/australian-categorisation-system-prescribing-medicines-pregnancy/prescribing-medicines-pregnancy-database"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-slate-600 dark:hover:text-slate-300"
        >
          Australian TGA
        </a>{' '}
        and{' '}
        <a
          href="https://open.fda.gov/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-slate-600 dark:hover:text-slate-300"
        >
          US FDA (OpenFDA)
        </a>
        . This information is for educational purposes only and does not
        constitute medical advice. Always consult a qualified healthcare
        provider before making decisions about medication use during pregnancy.
      </p>

      {/* Dataset-level currency, kept at footer level rather than on each drug
          card — a card for a drug with no TGA category must not carry a TGA
          currency claim. "Synced" deliberately describes an automated fetch,
          never a clinical review of the content. */}
      {(revised || checked) && (
        <p className="mt-3">
          TGA pregnancy database
          {revised && ` revised ${revised}`}
          {checked && `, synced ${checked}`}. FDA labelling is retrieved live.
        </p>
      )}
    </footer>
  );
}
