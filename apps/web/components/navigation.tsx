"use client";

import { Activity, Bell, CalendarDays, ChartNoAxesColumn, ChevronDown, CircleAlert, ClipboardCheck, FileText, Settings, Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ThemeToggle } from "./client";

export const labels = {
  today: "Today", activity: "Team activity", blockers: "Blocker board", commitments: "Commitments", digest: "Digests",
  insights: "Team insights", settings: "Settings", notifications: "Notifications",
};

const nav = [
  { key: "today", Icon: CalendarDays }, { key: "activity", Icon: Activity }, { key: "blockers", Icon: CircleAlert },
  { key: "commitments", Icon: ClipboardCheck }, { key: "digest", Icon: FileText }, { key: "insights", Icon: ChartNoAxesColumn },
  { key: "notifications", Icon: Bell }, { key: "settings", Icon: Settings },
] as const;

export function Navigation({ workspace, name, section, viewer }: { workspace: string; name: string; section: keyof typeof labels; viewer: string }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    const stream = new EventSource(`/api/events?workspace=${encodeURIComponent(workspace)}`);
    stream.addEventListener("unread", event => setUnread(Number(event.data)));
    return () => stream.close();
  }, [workspace]);
  return <aside className="sidebar">
    <div className="sidebar-head">
      <Link className="workspace-switch" href="/workspaces">
        <span className="avatar workspace-avatar">{name.slice(0, 2).toUpperCase()}</span>
        <span className="ws-title"><strong>{name}</strong><small>Workspace</small></span>
        <ChevronDown size={15} />
      </Link>
      <button type="button" className="icon-button mobile-menu" aria-expanded={open} aria-controls="workspace-nav" aria-label={open ? "Close navigation" : "Open navigation"} onClick={() => setOpen(!open)}>{open ? <X size={21} /> : <Menu size={21} />}</button>
    </div>
    <nav id="workspace-nav" className={`nav ${open ? "opened" : ""}`} aria-label="Workspace">
      {nav.map(({ key, Icon }) => <Link key={key} href={`/w/${workspace}/${key}`} aria-current={key === section ? "page" : undefined} onClick={() => setOpen(false)}>
        <Icon size={18} /><span>{labels[key]}</span>{key === "notifications" && unread > 0 && <span className="nav-count" aria-label={`${unread} unread`}>{Math.min(99, unread)}</span>}
      </Link>)}
    </nav>
    <div className="sidebar-footer"><div className="row"><span className="avatar">{viewer.slice(0, 2).toUpperCase()}</span><strong>{viewer}</strong></div><ThemeToggle /></div>
  </aside>;
}
