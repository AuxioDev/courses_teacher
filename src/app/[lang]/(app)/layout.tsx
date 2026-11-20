import { Suspense } from "react";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { AppNav } from "@/components/app-nav";
import { LanguageMenu } from "@/components/language-menu";
import { PageTransition } from "@/components/page-transition";
import { SidebarProfile, SidebarProfileSkeleton } from "@/components/sidebar-profile";

// Phones get a bar at the bottom. Tablets get a narrow rail of icons, and laptops and desktops the full sidebar (the
// padding on the left follows the same two widths as the sidebar in app-nav.tsx).
export default async function AppLayout({ children }: LayoutProps<"/[lang]">) {
  const { locale, t } = await getI18n();
  return (
    <div className="min-h-dvh pb-24 md:pb-10 md:pl-16 lg:pl-[14.5rem]">
      <header className="sticky top-0 z-10 border-b border-line bg-surface pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-[3.25rem] max-w-6xl items-center justify-between px-4 sm:px-6 md:justify-end">
          <Link href={localePath(locale, "/")} className="inline-flex min-h-11 items-center text-[0.9375rem] font-semibold tracking-tight md:hidden">
            <Brand name={t.meta.appName} />
          </Link>
          <LanguageMenu locale={locale} label={t.profile.language} saveToAccount />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pt-5 sm:px-6 md:pt-8">
        <PageTransition>{children}</PageTransition>
      </main>
      <AppNav
        locale={locale}
        labels={{ ...t.nav, appName: t.meta.appName }}
        footer={
          <Suspense fallback={<SidebarProfileSkeleton />}>
            <SidebarProfile locale={locale} />
          </Suspense>
        }
      />
    </div>
  );
}
