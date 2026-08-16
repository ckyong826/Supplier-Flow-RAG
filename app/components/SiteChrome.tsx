"use client";

export type PublicView = "catalog" | "rfq" | "track" | "ai";

export function SupplierFlowMark() {
  return <><span className="wordmark-mark">S</span>Supplier<span>Flow</span></>;
}

export function SiteHeader({
  view,
  cartCount,
  onView,
  onAdmin,
}: {
  view: PublicView;
  cartCount: number;
  onView: (view: PublicView) => void;
  onAdmin: () => void;
}) {
  return (
    <header className="topbar">
      <button className="wordmark" type="button" aria-label="SupplierFlow home" onClick={() => onView("catalog")}>
        <SupplierFlowMark />
      </button>
      <nav className="main-nav">
        <button type="button" className={view === "catalog" ? "active" : ""} aria-current={view === "catalog" ? "page" : undefined} onClick={() => onView("catalog")}>Catalogue</button>
        <button type="button" className={view === "rfq" ? "active" : ""} aria-current={view === "rfq" ? "page" : undefined} onClick={() => onView("rfq")}>My RFQ <span className="nav-count">{cartCount}</span></button>
        <button type="button" className={view === "track" ? "active" : ""} aria-current={view === "track" ? "page" : undefined} onClick={() => onView("track")}>Track RFQ</button>
        <button type="button" className={view === "ai" ? "active" : ""} aria-current={view === "ai" ? "page" : undefined} onClick={() => onView("ai")}>Ask SupplyAI</button>
        <button type="button" onClick={onAdmin}>Admin desk</button>
      </nav>
    </header>
  );
}

export function SiteFooter({ onAdmin }: { onAdmin: () => void }) {
  return (
    <footer className="app-footer">
      <span>SupplierFlow</span>
      <span>B2B electrical sourcing · catalogue, RFQ and quotation management</span>
      <button type="button" onClick={onAdmin}>Admin desk →</button>
    </footer>
  );
}
