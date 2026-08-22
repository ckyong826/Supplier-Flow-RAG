"use client";

import { AdminDashboardCharts } from "../AdminCharts";
import { AdminTable } from "../AdminPrimitives";
import { money } from "../../lib/format";
import type { Product, Quote, Rfq } from "./types";

export function DashboardSection({ rfqs, quotes, products, quoteValue, onOpenRfq }: {
  rfqs: Rfq[];
  quotes: Quote[];
  products: Product[];
  quoteValue: number;
  onOpenRfq: (rfq: Rfq) => void;
}) {
  return <>
    <div className="portal-kpis">
      <article><span>Open RFQs</span><strong>{rfqs.filter((rfq) => ["NEW", "REVIEWING"].includes(rfq.status)).length}</strong></article>
      <article><span>Quotation value</span><strong>{money(quoteValue)}</strong></article>
      <article><span>Won RFQs</span><strong>{rfqs.filter((rfq) => rfq.status === "WON").length}</strong></article>
      <article><span>Active products</span><strong>{products.filter((product) => product.is_active).length}</strong></article>
    </div>
    <AdminDashboardCharts rfqs={rfqs} quotes={quotes} />
    <div className="admin-table-card portal-card">
      <div className="admin-table-toolbar"><div><p className="kicker">Recent activity</p><h2>Latest RFQs</h2></div></div>
      <AdminTable
        rows={rfqs.slice(0, 6)}
        empty="No RFQs yet."
        onRowClick={onOpenRfq}
        columns={[
          { key: "reference", label: "Reference", render: (rfq) => <><strong>{rfq.reference}</strong><small>{rfq.company_name}</small></> },
          { key: "customer", label: "Customer", render: (rfq) => <><strong>{rfq.customer_name}</strong><small>{rfq.email}</small></> },
          { key: "items", label: "Items", render: (rfq) => `${rfq.rfq_items?.length || 0} line(s)` },
          { key: "status", label: "Status", align: "center", render: (rfq) => <em className={`status-chip ${rfq.status.toLowerCase()}`}>{rfq.status}</em> },
        ]}
      />
    </div>
  </>;
}
