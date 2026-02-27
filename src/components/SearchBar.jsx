import ThemeToggle from './ThemeToggle';

export default function SearchBar({ query, onChange, onHomeClick }) {
  return (
    <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md px-4 pt-6 pb-4 shadow-sm dark:bg-slate-900/80 dark:shadow-none">
      <div className="flex items-start justify-between">
        <div>
          <h1
            className="mb-3 cursor-pointer w-fit"
            onClick={onHomeClick}
          >
            <img src="/logo.png" alt="Matria" className="h-20 dark:invert dark:hue-rotate-180" />
          </h1>
        </div>
        <ThemeToggle />
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search by drug or brand name..."
        autoFocus
        className="w-full rounded-2xl border border-slate-300 bg-zinc-50 px-4 py-3 text-base
                   placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2
                   focus:ring-teal-200 transition-colors dark:border-slate-700 dark:bg-slate-800
                   dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:ring-teal-800"
      />
    </div>
  );
}
