export default function FormattedText({ text, className = '' }) {
  if (!text) return null;

  const paragraphs = text.split(/\n{2,}/);

  return (
    <div className={`break-words ${className}`}>
      {paragraphs.map((para, i) => {
        const lines = para.split('\n').filter(Boolean);

        // Check if all lines are bullet points
        const bulletLines = lines.filter(l => /^[•\-]\s/.test(l));
        if (bulletLines.length > 0 && bulletLines.length === lines.length) {
          return (
            <ul key={i} className="mt-2 list-disc space-y-1 pl-5 first:mt-0">
              {lines.map((line, j) => (
                <li key={j}>{line.replace(/^[•\-]\s*/, '')}</li>
              ))}
            </ul>
          );
        }

        // Mixed content: render line by line
        return (
          <p key={i} className="mt-2 first:mt-0">
            {lines.map((line, j) => {
              // Sub-heading: short line, no sentence-ending punctuation, not a bullet
              const isHeading = line.length < 80 && !/[.;:,]$/.test(line) && !/^[•\-]\s/.test(line);

              return (
                <span key={j}>
                  {j > 0 && <br />}
                  {isHeading ? <strong>{line}</strong> : line}
                </span>
              );
            })}
          </p>
        );
      })}
    </div>
  );
}
