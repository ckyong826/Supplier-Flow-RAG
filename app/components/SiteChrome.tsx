"use client";

import { canViewPublic, demoTierLabel, type DemoTier } from "../lib/demoTier";

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

export function SiteFooter({
  demoTier,
  logoUrl,
  companyName,
  onView,
  onAdmin,
}: {
  demoTier: DemoTier;
  logoUrl?: string | null;
  companyName?: string;
  onView?: (view: PublicView) => void;
  onAdmin: () => void;
}) {
  const year = new Date().getFullYear();
  const browseNav: Array<[PublicView, string]> = [
    ["catalog", "Catalogue"],
    ["rfq", "My RFQ"],
    ["track", "Track RFQ"],
    ["ai", "Ask SupplyAI"],
  ];
  const workflow = ["Browse the catalogue", "Build and submit an RFQ", "Receive a quotation", "Accept, revise or decline"];

  return (
    <footer className="app-footer">
      <div className="app-footer-top">
        <div className="app-footer-brand">
          <span className="app-footer-mark">
            <SupplierFlowMark logoUrl={logoUrl} companyName={companyName} />
          </span>
          <p>B2B electrical sourcing — catalogue, RFQ and quotation management for SME suppliers and their buyers.</p>
          <button type="button" className="app-footer-cta" onClick={onAdmin}>
            Admin desk →
          </button>
        </div>

        <nav className="app-footer-nav" aria-label="Footer navigation">
          <div>
            <h3>Browse</h3>
            <ul>
              {browseNav
                .filter(([id]) => canViewPublic(demoTier, id))
                .map(([id, label]) => (
                  <li key={id}>
                    <button type="button" onClick={() => onView?.(id)}>
                      {label}
                    </button>
                  </li>
                ))}
            </ul>
          </div>

          <div>
            <h3>How it works</h3>
            <ul>
              {workflow.map((step) => (
                <li key={step}>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3>Operations</h3>
            <ul>
              <li>
                <button type="button" onClick={onAdmin}>
                  Admin desk
                </button>
              </li>
              <li>
                <span>Quotation management</span>
              </li>
              <li>
                <span>Inventory &amp; pricing</span>
              </li>
              <li>
                <span>Audit trail</span>
              </li>
            </ul>
          </div>
        </nav>
      </div>

      <div className="app-footer-bar">
        <span className="app-footer-copy">© {year} SupplierFlow</span>
        <span>{demoTierLabel[demoTier]}</span>
        <span className="app-footer-legal">
          Demonstration environment. Products, pricing and companies shown are sample data only.
        </span>
      </div>
    </footer>
  );
}
