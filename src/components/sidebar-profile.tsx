import Link from "next/link";
import { getTeacherOrNull } from "@/lib/auth";
import { localePath, type Locale } from "@/i18n/config";

// The foot of the side navigation: who is signed in, linking to the Profile page. It only shows what the Profile page
// already shows (name and email). It reads the same cached teacher the pages read, so it adds no query, and it never
// redirects: a signed-out visitor is sent away by the page itself, so here it just renders nothing.
export async function SidebarProfile({ locale }: { locale: Locale }) {
  const teacher = await getTeacherOrNull();
  if (!teacher) return null;
  const initials = teacher.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
  return (
    <Link
      href={localePath(locale, "/profile")}
      className="flex items-center gap-3 rounded-lg p-2 max-lg:justify-center hover:bg-surface-2"
    >
      <span
        aria-hidden="true"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent"
      >
        {initials}
      </span>
      {/* On the narrow rail only the initials show; the text stays for screen readers. */}
      <span className="min-w-0 max-lg:sr-only">
        <span className="block truncate text-sm font-medium">{teacher.name}</span>
        <span className="block truncate text-xs text-muted">{teacher.email}</span>
      </span>
    </Link>
  );
}

// Shown while the teacher is being read, so the foot of the sidebar does not jump.
export function SidebarProfileSkeleton() {
  return (
    <div aria-hidden="true" className="flex items-center gap-3 p-2 max-lg:justify-center">
      <span className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-surface-2" />
      <span className="min-w-0 flex-1 space-y-1.5 max-lg:hidden">
        <span className="block h-3 w-24 animate-pulse rounded bg-surface-2" />
        <span className="block h-2.5 w-32 animate-pulse rounded bg-surface-2" />
      </span>
    </div>
  );
}
