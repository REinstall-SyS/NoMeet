"use client";

import { useState } from "react";
import type { Command } from "@nomeet/domain";
import { templates } from "@nomeet/domain";
import { Button } from "./ui";
import { useAction } from "./action";

type Person = { userId: string; user: { name: string | null } };
type FormProps = {
  children: React.ReactNode; build: (values: FormData) => Command; label: string; reset?: boolean;
  onSuccess?: () => void; primary?: boolean; onStart?: () => void; onFailure?: () => void;
};

function CommandForm({ children, build, label, reset, onSuccess, primary, onStart, onFailure }: FormProps) {
  const { mutate, isPending, error, router } = useAction();
  const [saved, setSaved] = useState(false);
  return <form className="stack compact" onSubmit={event => {
    event.preventDefault();
    const form = event.currentTarget;
    setSaved(false);
    onStart?.();
    mutate(build(new FormData(form)), { onSuccess: () => {
      if (reset) form.reset();
      setSaved(true);
      onSuccess?.();
      router.refresh();
    }, onError: () => onFailure?.() });
  }}>
    {children}
    <div className="row"><Button variant={primary ? "primary" : "secondary"} disabled={isPending}>{isPending ? "Saving…" : label}</Button>
    {saved && <span className="small success" role="status">Saved</span>}</div>
    {error && <p className="form-error" role="alert">{error.message}</p>}
  </form>;
}

const value = (form: FormData, key: string) => String(form.get(key) ?? "");
const present = (form: FormData, key: string) => form.has(key);
const severity = (form: FormData) => value(form, "severity") as "LOW" | "NORMAL" | "HIGH";

function Owners({ people, owner, empty, editable = true }: { people: Person[]; owner?: string | null; empty?: boolean; editable?: boolean }) {
  const ordered = editable ? people : people.filter(person => person.userId === owner);
  return <label>Owner<select name="owner" defaultValue={owner ?? ""} required={!empty}>
    {empty && <option value="">Unassigned</option>}
    {owner && !ordered.some(person => person.userId === owner) && <option value={owner}>Former teammate</option>}
    {ordered.map(person => <option key={person.userId} value={person.userId}>{person.user.name ?? "Teammate"}</option>)}
  </select></label>;
}

function Severity({ initial = "NORMAL" }: { initial?: string }) {
  return <label>Severity<select name="severity" defaultValue={initial}><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option></select></label>;
}

export function CreateWork({ workspaceId, sourceId, people, viewer, lead, day, allowCommitment }: {
  workspaceId: string; sourceId: string; people: Person[]; viewer: string; lead: boolean; day: string; allowCommitment: boolean;
}) {
  return <div className="stack compact">
    <details className="disclosure"><summary>Create a blocker from this update</summary>
      <CommandForm label="Create blocker" reset build={form => ({ action: "blocker", workspaceId, sourceId, title: value(form, "title"), severity: severity(form) })}>
        <label>Blocker title<input name="title" maxLength={200} required /></label><Severity />
      </CommandForm>
    </details>
    {allowCommitment && <details className="disclosure"><summary>Create a commitment from this update</summary>
      <CommandForm label="Create commitment" reset build={form => ({ action: "commitment", workspaceId, sourceId, ownerId: value(form, "owner"), description: value(form, "description"), dueDay: value(form, "due") })}>
        <label>Description<input name="description" maxLength={500} required /></label>
        <div className="form-columns"><Owners people={people} owner={viewer} editable={lead} /><label>Due date<input type="date" name="due" defaultValue={day} required /></label></div>
      </CommandForm>
    </details>}
  </div>;
}

export function BlockerForm({ workspaceId, item, people, lead, viewer }: {
  workspaceId: string; item: { id: string; ownerId: string | null; version: number; severity: "LOW" | "NORMAL" | "HIGH"; status: "OPEN" | "RESOLVED" };
  people: Person[]; lead: boolean; viewer: string;
}) {
  return <div className="stack compact">
    {(lead || item.ownerId === viewer) && <details className="disclosure"><summary>Manage blocker</summary>
      <CommandForm label="Save blocker" build={form => ({
        action: "blockerChange", workspaceId, id: item.id, version: item.version, ownerId: value(form, "owner") || null, severity: severity(form), status: value(form, "status") as "OPEN" | "RESOLVED",
      })}>
        <div className="form-columns"><Owners people={people} owner={item.ownerId} empty={lead} editable={lead} /><Severity initial={item.severity} /></div>
        <label>Status<select name="status" defaultValue={item.status}><option value="OPEN">Open</option><option value="RESOLVED">Resolved</option></select></label>
      </CommandForm>
    </details>}
    <details className="disclosure"><summary>Add comment</summary>
      <CommandForm label="Post comment" reset build={form => ({ action: "comment", workspaceId, id: item.id, body: value(form, "body") })}>
        <label>Comment<textarea name="body" rows={2} maxLength={2500} required /></label>
      </CommandForm>
    </details>
  </div>;
}

export function CommitmentForm({ workspaceId, item, people, lead }: {
  workspaceId: string; item: { id: string; ownerId: string; dueDay: string; version: number; status: "OPEN" | "COMPLETED" | "CANCELED" };
  people: Person[]; lead: boolean;
}) {
  return <details className="disclosure"><summary>Manage commitment</summary>
    <CommandForm label="Save commitment" build={form => ({
      action: "commitmentChange", workspaceId, id: item.id, version: item.version, ownerId: value(form, "owner"), dueDay: value(form, "due"), status: value(form, "status") as typeof item.status,
    })}>
      <div className="form-columns"><Owners people={people} owner={item.ownerId} editable={lead} /><label>Due date<input type="date" name="due" defaultValue={item.dueDay} required /></label></div>
      <label>Status<select name="status" defaultValue={item.status}><option value="OPEN">Open</option><option value="COMPLETED">Completed</option><option value="CANCELED">Canceled</option></select></label>
    </CommandForm>
  </details>;
}

export function Complete({ workspaceId, item }: { workspaceId: string; item: { id: string; ownerId: string; dueDay: string; version: number } }) {
  const [done, setDone] = useState(false);
  return done ? <span className="success small" role="status">Completed</span> : <CommandForm label="Mark complete"
    onSuccess={() => setDone(true)} build={() => ({ action: "commitmentChange", workspaceId, status: "COMPLETED", ...item })}>{null}</CommandForm>;
}

export function SettingsForm({ item }: { item: { id: string; name: string; timezone: string; weekdays: number[]; reminderTime: string; digestTime: string; template: string; aiEnabled: boolean } }) {
  return <CommandForm primary label="Save workspace settings" build={form => ({
    action: "settings", workspaceId: item.id, name: value(form, "name"), timezone: value(form, "timezone"),
    weekdays: form.getAll("days").map(Number), reminderTime: value(form, "reminder"), digestTime: value(form, "digest"),
    template: value(form, "template") as "ENGINEERING" | "PROJECT", aiEnabled: present(form, "ai"),
  })}>
    <label>Name<input name="name" defaultValue={item.name} maxLength={80} required /></label>
    <label>Time zone<input name="timezone" defaultValue={item.timezone} maxLength={100} required /></label>
    <fieldset className="weekdays"><legend>Standup days</legend>
      {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((day, i) => <label className="checkbox" key={day}><input type="checkbox" name="days" value={i} defaultChecked={item.weekdays.includes(i)} />{day}</label>)}
    </fieldset>
    <div className="form-columns"><label>Reminder time<input type="time" name="reminder" defaultValue={item.reminderTime} required /></label>
      <label>Digest time<input type="time" name="digest" defaultValue={item.digestTime} required /></label></div>
    <label>Template<select name="template" defaultValue={item.template}>{Object.entries(templates).map(([key, template]) => <option key={key} value={key}>{template.name}</option>)}</select></label>
    <label className="checkbox"><input type="checkbox" defaultChecked={item.aiEnabled} name="ai" />Allow configured Gemini processing for this workspace</label>
  </CommandForm>;
}

export function Preferences({ workspaceId, reminders, emailOptIn }: { workspaceId: string; reminders: boolean; emailOptIn: boolean }) {
  return <CommandForm label="Save preferences" build={form => ({ action: "preferences", workspaceId, reminders: present(form, "reminders"), emailOptIn: present(form, "email") })}>
    <label className="checkbox"><input type="checkbox" defaultChecked={reminders} name="reminders" />Standup and blocker reminders</label>
    <label className="checkbox"><input type="checkbox" defaultChecked={emailOptIn} name="email" />Send notifications by email</label>
  </CommandForm>;
}

export function RoleForm({ workspaceId, userId, role, name }: { workspaceId: string; userId: string; role: string; name: string }) {
  return <CommandForm label="Apply" build={form => ({ action: "membership", workspaceId, userId, role: value(form, "role") as "ADMIN" | "MEMBER" | "REMOVE" })}>
    <label className="sr-only" htmlFor={`role-${userId}`}>Role for {name}</label>
    <select id={`role-${userId}`} name="role" defaultValue={role}><option value="MEMBER">Member</option><option value="ADMIN">Admin</option><option value="REMOVE">Remove member</option></select>
  </CommandForm>;
}

export function NotificationList({ workspaceId, items, root }: { workspaceId: string; root: string; items: { id: string; title: string; path: string; readAt: Date | null; createdAt: Date }[] }) {
  const [optimistic, setOptimistic] = useState<string[]>([]);
  const unread = items.some(item => !item.readAt);
  return <div className="stack">
    {unread && <CommandForm label="Mark all as read" onStart={() => setOptimistic(items.filter(item => !item.readAt).map(item => item.id))} onFailure={() => setOptimistic([])}
      build={() => ({ action: "read", workspaceId })}>{null}</CommandForm>}
    <ul className="items">{items.map(item => <li key={item.id} className="list-row">
      <a href={`${root}/${item.path}`}>{!optimistic.includes(item.id) && !item.readAt && <span className="unread-dot" aria-label="Unread" />}{item.title}</a>
      <time className="muted small" dateTime={new Date(item.createdAt).toISOString()}>{new Date(item.createdAt).toISOString().slice(0,10)}</time>
    </li>)}</ul>
  </div>;
}
