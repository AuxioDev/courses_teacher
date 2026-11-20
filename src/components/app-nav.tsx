"use client";

import { Suspense, type ComponentType, type ReactNode, type SVGProps } from "react";
import Link from "next/link";
import { Brand } from "@/components/brand";
import Image from "next/image";
import { LinkPending } from "./link-pending";
import { usePathname } from "next/navigation";
import { localePath, type Locale } from "@/i18n/config";
import { CalendarIcon, SunIcon, TaskIcon, UserIcon, UsersIcon } from "./icons";

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

// `footer` is the signed-in teacher at the foot of the side navigation. It is rendered on the server and passed in.
type Props = { locale: Locale; labels: NavLabels; footer?: ReactNode };
type ViewProps = Props & { pathname: string | null };

function Bar({ locale, labels, pathname }: ViewProps) {
  return (
    <nav
      aria-label={labels.main}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex">
        {items.map(({ path, key, Icon }) => {
          const active = isActive(path, pathname);
          return (
            <li key={path} className="min-w-0 flex-1">
              <Link
                href={localePath(locale, path)}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-1.5 text-[0.6875rem] ${
                  active ? "font-semibold text-accent" : "font-medium text-muted"
                }`}
              >
                {/* The current page sits in a soft pill, so it reads without relying on colour alone. */}
                <span className={`grid h-7 w-12 place-items-center rounded-full ${active ? "bg-accent-soft" : ""}`}>
                  <Icon strokeWidth={active ? 2.2 : 1.8} />
                </span>
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

// 768-1023px: a narrow rail of icons (the names stay for screen readers). From 1024px: the full sidebar, 14.5rem wide.
// The page's left padding in the app layout follows the same two widths.
function Side({ locale, labels, pathname, footer }: ViewProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-16 flex-col border-r border-line bg-surface md:flex lg:w-[14.5rem]">
      <Link
        href={localePath(locale, "/")}
        className="flex h-[3.25rem] shrink-0 items-center gap-2.5 px-4 text-[0.9375rem] font-semibold tracking-tight max-lg:justify-center max-lg:px-0"
      >
        <Image src="/icon.svg" alt="" width={28} height={28} className="brand-mark h-[28px] w-[28px] shrink-0" />
        <Brand name={labels.appName} className="max-lg:sr-only" />
      </Link>
      <nav aria-label={labels.main} className="flex-1 overflow-y-auto px-3 pb-4 pt-1">
        <ul className="space-y-0.5">
          {items.map(({ path, key, Icon }) => {
            const active = isActive(path, pathname);
            return (
              <li key={path}>
                <Link
                  href={localePath(locale, path)}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium max-lg:justify-center max-lg:px-0 ${
                    active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-ink"
                  }`}
                >
                  <Icon width={20} height={20} strokeWidth={active ? 2.2 : 1.8} />
                  <span className="max-lg:sr-only">{labels[key]}</span>
                  <LinkPending />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {footer && <div className="shrink-0 border-t border-line p-3">{footer}</div>}
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
