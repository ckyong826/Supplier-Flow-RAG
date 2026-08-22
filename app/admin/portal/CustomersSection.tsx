"use client";

import type { FormEvent } from "react";
import { AdminModal, AdminTable, AdminToolbar } from "../AdminPrimitives";
import type { CustomerAccount, CustomerDraft } from "./types";

export function CustomersSection({
  accounts, search, draft, modalOpen, saving,
  onSearch, onDraftChange, onSave, onClose, onAdd, onEdit,
}: {
  accounts: CustomerAccount[];
  search: string;
  draft: CustomerDraft;
  modalOpen: boolean;
  saving: boolean;
  onSearch: (value: string) => void;
  onDraftChange: (draft: CustomerDraft) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  onAdd: () => void;
  onEdit: (account: CustomerAccount) => void;
}) {
  return <div className="admin-table-card portal-card">
    {modalOpen && <AdminModal titleId="customer-modal-title" label="Close customer account editor" onClose={onClose} className="customer-editor-modal">
      <div className="portal-card-heading"><div><p className="kicker">Account profile</p><h2 id="customer-modal-title">{draft.id ? "Edit customer account" : "New customer account"}</h2></div></div>
      <form className="portal-form" onSubmit={onSave}>
        <label>Company name<input required value={draft.companyName} onChange={(event) => onDraftChange({ ...draft, companyName: event.target.value })} /></label>
        <label>Primary contact<input required value={draft.contactName} onChange={(event) => onDraftChange({ ...draft, contactName: event.target.value })} /></label>
        <label>Primary email<input required type="email" value={draft.email} onChange={(event) => onDraftChange({ ...draft, email: event.target.value })} /></label>
        <label>Phone<input value={draft.phone} onChange={(event) => onDraftChange({ ...draft, phone: event.target.value })} /></label>
        <label>Status<select value={draft.status} onChange={(event) => onDraftChange({ ...draft, status: event.target.value as CustomerDraft["status"] })}><option value="active">Active</option><option value="on_hold">On hold</option></select></label>
        <label className="full">Internal notes<textarea rows={3} value={draft.notes} onChange={(event) => onDraftChange({ ...draft, notes: event.target.value })} /></label>
        <div className="portal-actions full"><button type="button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? "Saving…" : "Save account"}</button></div>
      </form>
    </AdminModal>}
    <AdminToolbar eyebrow="Customer CRM" title={`${accounts.length} customer accounts`} searchLabel="Search customer accounts" search={search} onSearch={onSearch} placeholder="Company, contact, email..." actions={<button className="primary-button" type="button" onClick={onAdd}>Add account</button>} />
    <AdminTable rows={accounts} empty="No customer accounts match this search." columns={[
      { key: "company", label: "Company", render: (account) => <><strong>{account.company_name}</strong><small>{account.primary_contact_name} · {account.primary_email}</small></> },
      { key: "phone", label: "Phone", render: (account) => account.phone || "—" },
      { key: "status", label: "Status", align: "center", render: (account) => <em className={`status-chip ${account.status === "active" ? "accepted" : "hidden"}`}>{account.status === "active" ? "ACTIVE" : "ON HOLD"}</em> },
      { key: "rfqs", label: "RFQs", align: "right", render: (account) => account.rfqs?.[0]?.count || 0 },
      { key: "prices", label: "Price rules", align: "right", render: (account) => account.customer_price_overrides?.[0]?.count || 0 },
      { key: "action", label: "Action", align: "right", render: (account) => <button className="table-action" type="button" onClick={() => onEdit(account)}>Edit</button> },
    ]} />
  </div>;
}
