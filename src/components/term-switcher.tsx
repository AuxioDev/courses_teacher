import Link from "next/link";
import type { TeacherTerm } from "@/lib/data";

// Shown only when the teacher has work in more than one term.
export function TermSwitcher({
  terms,
  selected,
  hrefFor,
  label,
  currentLabel,
}: {
  terms: TeacherTerm[];
  selected: string | null;
  hrefFor: (term: TeacherTerm) => string;
  label: string;
  currentLabel: string;
}) {
  if (terms.length < 2) return null;
  return (
    <nav aria-label={label} className="scroll-hint -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [--scroll-cover:var(--bg)] sm:mx-0 sm:px-0">
      {terms.map((term) => {
        const active = term.id === selected;
        return (
          <Link
            key={term.id}
            href={hrefFor(term)}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium ${
              active ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface text-ink"
            }`}
          >
            {term.name}
            {term.current && <span className={active ? "ml-1 opacity-80" : "ml-1 text-muted"}>· {currentLabel}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
