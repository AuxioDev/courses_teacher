"use client";

import { Suspense, type ComponentType, type SVGProps } from "react";
import Link from "next/link";
import { LinkPending } from "./link-pending";
import { usePathname } from "next/navigation";
import { localePath, type Locale } from "@/i18n/config";
import { BookIcon, CalendarIcon, SunIcon, TaskIcon, UserIcon, UsersIcon } from "./icons";

export type NavLabels = {
  dashboard: string;
  lessons: string;
  groups: string;
  homework: string;
  profile: string;
  main: string;
  appName: string;
};

type Item = { path: string; key: Exclude<keyof NavLabels, "main" | "appName">; Icon: ComponentType<SVGProps<SVGSVGElement>> };

// Pages are added here as each build step ships them.
const items: Item[] = [
  { path: "/", key: "dashboard", Icon: SunIcon },
  { path: "/lessons", key: "lessons", Icon: CalendarIcon },
  { path: "/groups", key: "groups", Icon: UsersIcon },
  { path: "/homework", key: "homework", Icon: TaskIcon },
  { path: "/profile", key: "profile", Icon: UserIcon },
];

function isActive(path: string, pathname: string | null) {
  if (pathname === null) return false;
  return path === "/" ? pathname === "/" : pathname.startsWith(path);
}

type Props = { locale: Locale; labels: NavLabels };
type ViewProps = Props & { pathname: string | null };

function Bar({ locale, labels, pathname }: ViewProps) {
  return (
    <nav
      aria-label={labels.main}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur md:hidden"
    >
      <ul className="flex">
        {items.map(({ path, key, Icon }) => {
          const active = isActive(path, pathname);
          return (
            <li key={path} className="min-w-0 flex-1">
              <Link
                href={localePath(locale, path)}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-[0.6875rem] font-medium ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                <Icon strokeWidth={active ? 2.2 : 1.8} />
                <span className="max-w-full truncate px-0.5">{labels[key]}</span>
                <LinkPending />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Side({ locale, labels, pathname }: ViewProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-56 flex-col border-r border-line bg-surface-2 md:flex">
      <Link href={localePath(locale, "/")} className="flex h-14 items-center gap-2 px-5 text-[0.9375rem] font-semibold tracking-tight">
        <BookIcon className="text-accent" />
        {labels.appName}
      </Link>
      <nav aria-label={labels.main} className="overflow-y-auto px-3 pb-4">
        <ul className="space-y-0.5">
          {items.map(({ path, key, Icon }) => {
            const active = isActive(path, pathname);
            return (
              <li key={path}>
                <Link
                  href={localePath(locale, path)}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-lg border-l-2 px-3 py-2 text-sm font-medium ${
                    active ? "border-accent bg-surface text-accent" : "border-transparent text-muted hover:text-ink"
                  }`}
                >
                  <Icon width={20} height={20} strokeWidth={active ? 2.2 : 1.8} />
                  {labels[key]}
                  <LinkPending />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}

function Views(props: ViewProps) {
  return (
    <>
      <Bar {...props} />
      <Side {...props} />
    </>
  );
}

function ActiveViews(props: Props) {
  // Strip the /az, /en or /ru prefix before matching.
  const path = usePathname().replace(/^\/[^/]+/, "") || "/";
  return <Views {...props} pathname={path} />;
}

// The path is only known at request time on dynamic routes, so the static shell
// renders the navigation without an active item and the highlight streams in.
export function AppNav(props: Props) {
  return (
    <Suspense fallback={<Views {...props} pathname={null} />}>
      <ActiveViews {...props} />
    </Suspense>
  );
}
