"use client";

import { canViewPublic, type DemoTier } from "../lib/demoTier";

export type PublicView = "catalog" | "rfq" | "track" | "ai";

export function SupplierFlowMark({ logoUrl, companyName = "SupplierFlow" }: { logoUrl?: string | null; companyName?: string }) {
  const name = companyName.trim() || "SupplierFlow";
  return logoUrl ? <><img className="site-mark-logo" src={logoUrl} alt="" /><span className="site-mark-company">{name}</span></> : name === "SupplierFlow" ? <><span className="wordmark-mark">S</span>Supplier<span>Flow</span></> : <><span className="wordmark-mark">{name[0].toUpperCase()}</span><span className="site-mark-company">{name}</span></>;
}

export function SiteHeader({
  view,
  cartCount,
  demoTier,
  logoUrl,
  companyName,
  onView,
  onAdmin,
}: {
  view: PublicView;
  cartCount: number;
  demoTier: DemoTier;
  logoUrl?: string | null;
  companyName?: string;
  onView: (view: PublicView) => void;
  onAdmin: () => void;
}) {
  const publicNav: Array<[PublicView, string]> = [["catalog", "Catalogue"], ["rfq", "My RFQ"], ["track", "Track RFQ"], ["ai", "Ask SupplyAI"]];
  return (
    <header className="topbar">
      <button className="wordmark" type="button" aria-label="SupplierFlow home" onClick={() => onView("catalog")}>
        <SupplierFlowMark logoUrl={logoUrl} companyName={companyName} />
      </button>
      <nav className="main-nav">
        {publicNav.filter(([id]) => canViewPublic(demoTier, id)).map(([id, label]) => <button type="button" className={view === id ? "active" : ""} aria-current={view === id ? "page" : undefined} key={id} onClick={() => onView(id)}>{label}{id === "rfq" && <span className="nav-count">{cartCount}</span>}</button>)}
        <button type="button" onClick={onAdmin}>Admin desk</button>
      </nav>
    </header>
  );
}

export function SiteFooter({ logoUrl, companyName, onAdmin }: { logoUrl?: string | null; companyName?: string; onAdmin: () => void }) {
  return (
    <footer className="app-footer">
      <span><SupplierFlowMark logoUrl={logoUrl} companyName={companyName} /></span>
      <span>B2B electrical sourcing · catalogue, RFQ and quotation management</span>
      <button type="button" onClick={onAdmin}>Admin desk →</button>
    </footer>
  );
}
