"use client";

import type { ReactNode } from "react";
import { SupplierFlowMark } from "../../components/SiteChrome";
import { canViewSection, type DemoTier } from "../../lib/demoTier";
import { portalMenu } from "./portal-utils";
import type { Section, Settings, StaffRole } from "./types";

const adminOnlySections: Section[] = ["knowledge", "settings", "integrations", "ai-actions", "audit"];

export function PortalShell({
  section,
  role,
  demoTier,
  demoTierLabel,
  settings,
  canManageAdmin,
  notice,
  loadFailures,
  loading,
  onSectionChange,
  onSignOut,
  onRetry,
  onDismissNotice,
  children,
}: {
  section: Section;
  role: StaffRole;
  demoTier: DemoTier;
  demoTierLabel: string;
  settings: Settings;
  canManageAdmin: boolean;
  notice: string;
  loadFailures: string[];
  loading: boolean;
  onSectionChange: (section: Section) => void;
  onSignOut: () => void;
  onRetry: () => void;
  onDismissNotice: () => void;
  children: ReactNode;
}) {
  const title = portalMenu.find(([id]) => id === section)?.[1];

  return (
    <section className="admin-portal">
      <aside className="portal-sidebar">
        <button className="portal-brand" type="button">
          <SupplierFlowMark logoUrl={settings.logo_url} companyName={settings.company_name} />
        </button>
        <nav className="portal-nav">
          {portalMenu.filter(([id]) => canViewSection(demoTier, id) && (canManageAdmin || !adminOnlySections.includes(id))).map(([id, label]) => (
            <button className={section === id ? "active" : ""} key={id} type="button" onClick={() => onSectionChange(id)}>
              {label}
            </button>
          ))}
        </nav>
        <button className="portal-signout" type="button" onClick={onSignOut}>Sign out</button>
      </aside>
      <main className="portal-main">
        <header className="portal-header">
          <div><p className="kicker">Administration · {demoTierLabel}</p><h1>{title}</h1></div>
          <span className="portal-user">{role === "owner" ? "OWNER" : role === "admin" ? "AD" : role.toUpperCase()}</span>
        </header>
        {notice && <div className="portal-notice">
          {notice}
          {loadFailures.length > 0 && <button type="button" onClick={onRetry} disabled={loading}>{loading ? "Retrying…" : "Retry"}</button>}
          <button type="button" onClick={onDismissNotice}>×</button>
        </div>}
        {children}
      </main>
    </section>
  );
}
