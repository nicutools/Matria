const CATEGORY_CONFIG = {
  A: {
    color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-800',
    wash: 'bg-emerald-50 dark:bg-emerald-900/20',
    description: 'Taken by a large number of pregnant women without an increase in birth defects or harmful effects on the fetus.',
  },
  B1: {
    color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-800',
    wash: 'bg-amber-50 dark:bg-amber-900/20',
    description: 'Limited use in pregnant women, no increase in malformations. Animal studies show no evidence of fetal harm.',
  },
  B2: {
    color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-800',
    wash: 'bg-amber-50 dark:bg-amber-900/20',
    description: 'Limited use in pregnant women, no increase in malformations. Animal studies are inadequate or lacking.',
  },
  B3: {
    color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-800',
    wash: 'bg-amber-50 dark:bg-amber-900/20',
    description: 'Limited use in pregnant women, no increase in malformations. Animal studies show increased fetal damage, significance uncertain in humans.',
  },
  C: {
    color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
    border: 'border-orange-200 dark:border-orange-800',
    wash: 'bg-orange-50 dark:bg-orange-900/20',
    description: 'Has caused or may be suspected of causing harmful effects on the fetus, without causing malformations. Effects may be reversible.',
  },
  D: {
    color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    border: 'border-red-200 dark:border-red-800',
    wash: 'bg-red-50 dark:bg-red-900/20',
    description: 'Known to cause an increased incidence of fetal malformations or irreversible damage. May still be necessary in some situations.',
  },
  X: {
    color: 'bg-red-200 text-red-900 dark:bg-red-900/60 dark:text-red-200',
    border: 'border-red-300 dark:border-red-700',
    wash: 'bg-red-50 dark:bg-red-900/20',
    description: 'High risk of permanent damage to the fetus. Should not be used in pregnancy or when there is a possibility of pregnancy.',
  },
};

function formatTgaDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
}

export default function TGACategoryBadge({ category, statement, updatedDate }) {
  const config = CATEGORY_CONFIG[category];
  if (!config) return null;

  return (
    <div className={`mt-3 rounded-2xl ${config.wash} p-4`}>
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${config.color}`}
        >
          {category}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Australian TGA Category
          </h3>
          <p className="mt-0.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {config.description}
          </p>
        </div>
      </div>

      {statement && (
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {statement}
        </p>
      )}

      <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
        Source: Australian TGA — {formatTgaDate(updatedDate) || updatedDate}
      </p>
    </div>
  );
}
