import type { ReactNode } from "react";
import { AlertIcon, InfoIcon } from "./icons";

// A line of explanation above a page's content ("this term is closed", "attendance opens at 09:45"). The tone says how
// much it matters: neutral for a standing fact, info for something that will change, warn for something that went wrong.
// The icon means the same, so the tone does not rest on colour alone. Looks are in role-theme.css (.notice).
export function Notice({ tone = "neutral", children }: { tone?: "neutral" | "info" | "warn"; children: ReactNode }) {
  const Icon = tone === "warn" ? AlertIcon : InfoIcon;
  return (
    <p className={`notice notice-${tone} mb-4`}>
      <Icon width={18} height={18} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
