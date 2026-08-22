"use client";

import type { FormEvent } from "react";
import { AdminTable, AdminToolbar } from "../AdminPrimitives";
import type { CrmTask, Rfq, StaffMember, TaskDraft } from "./types";

export function TasksSection({
  tasks, search, filter, draft, teamMembers, rfqs, saving,
  onSearch, onFilter, onDraftChange, onSave, onUpdateStatus,
}: {
  tasks: CrmTask[];
  search: string;
  filter: string;
  draft: TaskDraft;
  teamMembers: StaffMember[];
  rfqs: Rfq[];
  saving: boolean;
  onSearch: (value: string) => void;
  onFilter: (value: string) => void;
  onDraftChange: (draft: TaskDraft) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onUpdateStatus: (task: CrmTask, status: "completed") => void;
}) {
  return <div className="admin-table-card portal-card">
    <AdminToolbar eyebrow="CRM workflow" title={`${tasks.length} tasks`} searchLabel="Search tasks" search={search} onSearch={onSearch} placeholder="Task, RFQ, company..." />
    <form className="portal-form customer-pricing-form" onSubmit={onSave}>
      <label>Task title<input required value={draft.title} onChange={(event) => onDraftChange({ ...draft, title: event.target.value })} placeholder="Call buyer about lead time" /></label>
      <label>Type<select value={draft.taskType} onChange={(event) => onDraftChange({ ...draft, taskType: event.target.value })}><option value="follow_up">Follow-up</option><option value="call">Call</option><option value="email">Email</option><option value="internal">Internal</option></select></label>
      <label>Due<input type="datetime-local" value={draft.dueAt} onChange={(event) => onDraftChange({ ...draft, dueAt: event.target.value })} /></label>
      <label>Assignee<select value={draft.assigneeId} onChange={(event) => onDraftChange({ ...draft, assigneeId: event.target.value })}><option value="">Unassigned</option>{teamMembers.map((member) => <option key={member.id} value={member.id}>{member.email}</option>)}</select></label>
      <label>RFQ<select value={draft.rfqId} onChange={(event) => onDraftChange({ ...draft, rfqId: event.target.value })}><option value="">No linked RFQ</option>{rfqs.map((rfq) => <option key={rfq.id} value={rfq.id}>{rfq.reference} · {rfq.company_name}</option>)}</select></label>
      <label className="full">Notes<textarea rows={2} value={draft.notes} onChange={(event) => onDraftChange({ ...draft, notes: event.target.value })} /></label>
      <div className="portal-actions full"><button className="primary-button" disabled={saving}>{saving ? "Creating…" : "Create task"}</button></div>
    </form>
    <div className="status-filters">{["ALL", "open", "in_progress", "completed", "cancelled"].map((status) => <button className={filter === status ? "active" : ""} key={status} type="button" onClick={() => onFilter(status)}>{status === "ALL" ? "All" : status.replace("_", " ")}</button>)}</div>
    <AdminTable rows={tasks} empty="No CRM tasks match this search." columns={[
      { key: "task", label: "Task", render: (task) => <><strong>{task.title}</strong><small>{task.task_type.replace("_", " ")}{task.notes ? ` · ${task.notes}` : ""}</small></> },
      { key: "link", label: "Linked work", render: (task) => <><strong>{task.rfqs?.reference || "Account task"}</strong><small>{task.rfqs?.company_name || task.customer_accounts?.company_name || "No linked account"}</small></> },
      { key: "due", label: "Due", render: (task) => task.due_at ? new Date(task.due_at).toLocaleString("en-MY") : "No due date" },
      { key: "status", label: "Status", align: "center", render: (task) => <em className={`status-chip ${task.status === "completed" ? "accepted" : task.status === "cancelled" ? "rejected" : "reviewing"}`}>{task.status.replace("_", " ")}</em> },
      { key: "action", label: "Action", align: "right", render: (task) => task.status === "completed" || task.status === "cancelled" ? null : <button className="table-action" type="button" onClick={() => onUpdateStatus(task, "completed")}>Complete</button> },
    ]} />
  </div>;
}
