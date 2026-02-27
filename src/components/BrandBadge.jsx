export default function BrandBadge({ original, generic, type }) {
  if (!original) return null;

  const label =
    type === 'brand'
      ? 'is a brand name for'
      : 'is also known as';

  return (
    <div className="mb-3 rounded-2xl bg-teal-50 border border-teal-200 px-4 py-3 text-sm text-teal-900 dark:bg-teal-900/30 dark:border-teal-800 dark:text-teal-200">
      <span className="font-semibold">{original}</span> {label}{' '}
      <span className="font-semibold">{generic}</span>
    </div>
  );
}
