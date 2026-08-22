"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { money } from "../lib/format";

/** Order matters: this is the RFQ lifecycle, so the donut reads clockwise as it progresses. */
const RFQ_STATUSES = ["NEW", "REVIEWING", "QUOTED", "WON", "LOST", "CANCELLED"] as const;
const QUOTE_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"] as const;

/** Same palette the status chips use, so a colour means the same thing everywhere. */
const STATUS_COLOR: Record<string, string> = {
  NEW: "#2563eb",
  DRAFT: "#2563eb",
  REVIEWING: "#ea580c",
  QUOTED: "#7c3aed",
  SENT: "#7c3aed",
  WON: "#059669",
  ACCEPTED: "#059669",
  LOST: "#dc2626",
  REJECTED: "#dc2626",
  EXPIRED: "#dc2626",
  CANCELLED: "#64748b",
};

type Rfq = { status: string };
type Quote = {
  status: string;
  delivery_fee: number;
  quotation_items: Array<{ quantity: number; unit_price: number }>;
};

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function quoteTotal(quote: Quote) {
  const items = Array.isArray(quote.quotation_items) ? quote.quotation_items : [];
  return items.reduce((sum, item) => sum + num(item.quantity) * num(item.unit_price), 0) + num(quote.delivery_fee);
}

function ChartEmpty({ message }: { message: string }) {
  return <p className="admin-chart-empty">{message}</p>;
}

export function AdminDashboardCharts({ rfqs, quotes }: { rfqs: Rfq[]; quotes: Quote[] }) {
  const rfqData = useMemo(
    () =>
      RFQ_STATUSES.map((status) => ({
        name: status,
        value: rfqs.filter((rfq) => rfq.status === status).length,
      })).filter((slice) => slice.value > 0),
    [rfqs],
  );

  const pipelineData = useMemo(
    () =>
      QUOTE_STATUSES.map((status) => {
        const matching = quotes.filter((quote) => quote.status === status);
        return {
          name: status,
          value: matching.reduce((sum, quote) => sum + quoteTotal(quote), 0),
          count: matching.length,
        };
      }).filter((bar) => bar.count > 0),
    [quotes],
  );

  const totalRfqs = rfqData.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <div className="admin-charts">
      <article className="portal-card admin-chart-card">
        <p className="kicker">RFQ status mix</p>
        <h3>{totalRfqs} request{totalRfqs === 1 ? "" : "s"}</h3>
        {rfqData.length ? (
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={rfqData}
                dataKey="value"
                nameKey="name"
                innerRadius={54}
                outerRadius={84}
                paddingAngle={2}
                stroke="#ffffff"
                strokeWidth={2}
              >
                {rfqData.map((slice) => (
                  <Cell key={slice.name} fill={STATUS_COLOR[slice.name] ?? "#94a3b8"} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => {
                  const count = num(value);
                  return [`${count} RFQ${count === 1 ? "" : "s"}`, String(name)];
                }}
                contentStyle={{ borderRadius: 6, border: "1px solid #dbe4ee", fontSize: 11 }}
              />
              <Legend
                verticalAlign="bottom"
                height={28}
                iconType="circle"
                iconSize={8}
                formatter={(value: string) => <span className="admin-chart-legend">{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <ChartEmpty message="No RFQs yet." />
        )}
      </article>

      <article className="portal-card admin-chart-card">
        <p className="kicker">Quotation pipeline</p>
        <h3>{money(pipelineData.reduce((sum, bar) => sum + bar.value, 0))}</h3>
        {pipelineData.length ? (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={pipelineData} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={78}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: "#64748b" }}
              />
              <Tooltip
                cursor={{ fill: "#f1f5f9" }}
                formatter={(value, _name, item) => {
                  const count = num((item as { payload?: { count?: number } })?.payload?.count);
                  return [`${money(num(value))} · ${count} quote(s)`, "Value"];
                }}
                contentStyle={{ borderRadius: 6, border: "1px solid #dbe4ee", fontSize: 11 }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={22}>
                {pipelineData.map((bar) => (
                  <Cell key={bar.name} fill={STATUS_COLOR[bar.name] ?? "#94a3b8"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ChartEmpty message="No quotations yet." />
        )}
      </article>
    </div>
  );
}
