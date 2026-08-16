"use client";

import { ReactNode } from "react";

export type AdminColumn<Row> = {
  key: string;
  label: string;
  render: (row: Row) => ReactNode;
};

export function AdminToolbar({
  eyebrow,
  title,
  searchLabel,
  search,
  onSearch,
  placeholder,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  searchLabel: string;
  search: string;
  onSearch: (value: string) => void;
  placeholder: string;
  actions?: ReactNode;
}) {
  return (
    <div className="admin-table-toolbar">
      <div>
        <p className="kicker">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <div className="admin-toolbar-actions">
        <label className="admin-search">
          <span>{searchLabel}</span>
          <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder={placeholder} />
        </label>
        {actions}
      </div>
    </div>
  );
}

export function AdminTable<Row extends { id: string }>({
  rows,
  columns,
  empty = "No records found.",
  onRowClick,
}: {
  rows: Row[];
  columns: AdminColumn<Row>[];
  empty?: string;
  onRowClick?: (row: Row) => void;
}) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? (event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onRowClick(row);
              } : undefined}
              tabIndex={onRowClick ? 0 : undefined}
            >
              {columns.map((column) => <td key={column.key}>{column.render(row)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="portal-empty">{empty}</p>}
    </div>
  );
}

export function AdminPagination({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const start = total ? (page - 1) * pageSize + 1 : 0;
  return (
    <div className="admin-pagination">
      <span>Showing {start}–{Math.min(page * pageSize, total)} of {total}</span>
      <div>
        <button disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button>
        <b>Page {page} of {pageCount}</b>
        <button disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>Next</button>
      </div>
    </div>
  );
}

export function AdminModal({
  titleId,
  label,
  children,
  onClose,
  className = "",
}: {
  titleId: string;
  label: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  return (
    <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <article className={`admin-modal ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <button className="modal-close" aria-label={label} onClick={onClose}>×</button>
        {children}
      </article>
    </div>
  );
}
