"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Command } from "@nomeet/domain";
import { useCommand } from "../lib/use-command";
import { Button } from "./ui";

export function useAction() {
  const router = useRouter();
  const mutation = useCommand();
  return { ...mutation, router };
}

export function WorkspaceForm() {
  const { mutate, error, isPending, router } = useAction();
  const [zone] = useState(() => typeof window === "undefined" ? "America/Chicago" : Intl.DateTimeFormat().resolvedOptions().timeZone);
  return <form className="stack" onSubmit={event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    mutate({ action: "workspace", name: String(form.get("name")), timezone: String(form.get("timezone")) }, { onSuccess: data => router.push(`/w/${data.workspaceId}/today`) });
  }}>
    <label>Workspace name<input name="name" required maxLength={80} placeholder="e.g. Northstar Engineering" /></label>
    <label>Team time zone<input key={zone} name="timezone" required maxLength={100} defaultValue={zone} suppressHydrationWarning /></label>
    <Button variant="primary" disabled={isPending}>Create workspace</Button>
    {error && <p role="alert" className="form-error">{error.message}</p>}
  </form>;
}

export function InviteForm({ workspaceId }: { workspaceId: string }) {
  const { mutate, error, isPending } = useAction();
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (url) dialog.current?.showModal(); }, [url]);
  return <form className="stack" onSubmit={event => {
    event.preventDefault();
    setUrl("");
    setCopied(false);
    mutate({ action: "invite", workspaceId, email: String(new FormData(event.currentTarget).get("email")) }, {
      onSuccess: data => setUrl(`${location.origin}/invite/${data.token}`),
    });
  }}>
    <label>Invite a teammate<input name="email" placeholder="teammate@example.com" type="email" maxLength={254} required /></label>
    <Button disabled={isPending}>Create invite link</Button>
    {error && <p role="alert" className="form-error">{error.message}</p>}
    {url && <dialog ref={dialog} className="card invite-dialog" aria-labelledby="invite-title" onClose={() => setUrl("")}>
      <div className="stack">
        <h2 id="invite-title">Invitation ready</h2>
        <p className="muted small">Share this link with the invited person. It expires in 72 hours.</p>
        <label>Invite link<input readOnly value={url} onFocus={event => event.currentTarget.select()} /></label>
        <div className="row">
          <Button variant="primary" type="button" onClick={() => navigator.clipboard.writeText(url).then(() => setCopied(true), () => setCopied(false))}>{copied ? "Copied" : "Copy link"}</Button>
          <Button type="button" onClick={() => dialog.current?.close()}>Done</Button>
        </div>
      </div>
    </dialog>}
  </form>;
}

export function AcceptInvite({ token }: { token: string }) {
  const { mutate, isPending, error, router } = useAction();
  return <div className="stack">
    <Button variant="primary" disabled={isPending} onClick={() => mutate({ action: "join", token }, { onSuccess: data => router.push(`/w/${data.workspaceId}/today`) })}>Accept invitation</Button>
    {error && <p role="alert" className="form-error">{error.message}</p>}
  </div>;
}
