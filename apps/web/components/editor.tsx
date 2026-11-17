"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Save } from "lucide-react";
import { fields, type UpdateFields } from "@nomeet/domain";
import { send } from "../lib/use-command";
import { Button } from "./ui";

type DisplayFields = Omit<UpdateFields, "links"> & { links: string };
const inputs = [
  ["done", "Accomplishments"], ["next", "Next priorities"], ["impediments", "Blockers"], ["decisions", "Decisions or help"],
] as const;

export function Editor({ workspaceId, day, version, draftVersion, initial, hints }: {
  workspaceId: string; day: string; version: number; draftVersion: number; initial: UpdateFields;
  hints: { done: string; next: string };
}) {
  const router = useRouter();
  const [values, setValues] = useState<DisplayFields>({ ...initial, links: initial.links.join("\n") });
  const [track, setTrack] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [status, setStatus] = useState(draftVersion ? "Draft saved" : version ? "Published" : "");
  const [error, setError] = useState("");
  const currentVersion = useRef(draftVersion);
  const updateVersion = useRef(version);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const publishingRef = useRef(false);

  function parse(data: DisplayFields) {
    return fields.parse({ ...data, links: data.links.split("\n").map(link => link.trim()).filter(Boolean) });
  }

  function edit(key: keyof DisplayFields, value: string) {
    const next = { ...values, [key]: value };
    setValues(next);
    setStatus("");
    setError("");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      queue.current = queue.current.then(async () => {
        if (publishingRef.current) return;
        setSaving(true);
        try {
          const content = parse(next);
          const saved = await send({ action: "draft", workspaceId, day, version: currentVersion.current, standupVersion: updateVersion.current, content });
          currentVersion.current = saved.version!;
          setStatus("Draft saved");
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "Could not save the draft.");
        } finally { setSaving(false); }
      });
    }, 850);
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function publish(event: React.FormEvent) {
    event.preventDefault();
    if (publishingRef.current) return;
    publishingRef.current = true;
    if (timer.current) clearTimeout(timer.current);
    setPublishing(true);
    setError("");
    try {
      await queue.current;
      const result = await send({ action: "standup", workspaceId, day, version: updateVersion.current, draftVersion: currentVersion.current, content: parse(values), trackBlocker: track });
      updateVersion.current = result.version!;
      currentVersion.current = 0;
      setTrack(false);
      setStatus("Published");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not publish your update.");
    } finally {
      publishingRef.current = false;
      setPublishing(false);
    }
  }

  return <form className="card editor stack" onSubmit={publish} onKeyDown={event => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); event.currentTarget.requestSubmit(); }
  }}>
    <div className="between editor-head"><div><h2>{version ? "Edit your update" : "Write your update"}</h2><p className="muted small">Your workspace can read published updates.</p></div>
      <span className="editor-status" role="status">{saving ? <><Save size={15} /> Saving…</> : status && <><CheckCircle2 size={15} /> {status}</>}</span></div>
    <fieldset className="stack editor-fields" disabled={publishing}>
      {inputs.map(([key, label]) => <label key={key}>{label}<textarea name={key}
        maxLength={key === "done" || key === "next" ? 4000 : 2000}
        value={values[key]} placeholder={key === "done" || key === "next" ? hints[key] : key === "impediments" ? "What’s holding up progress?" : "What needs a decision, and from whom?"}
        onChange={event => edit(key, event.target.value)} /></label>)}
      {!!values.impediments.trim() && <label className="checkbox"><input type="checkbox" checked={track} onChange={event => setTrack(event.target.checked)} /> Track this blocker on the board</label>}
      <label>Links <span className="muted small">(optional, one per line)</span><textarea className="links-field" value={values.links} maxLength={8008} placeholder="https://…" onChange={event => edit("links", event.target.value)} /></label>
    </fieldset>
    <div className="between"><Button variant="primary" disabled={publishing}>{publishing ? "Publishing…" : version ? "Save update" : "Publish update"}</Button><span className="muted small desktop">Ctrl / ⌘ + Enter</span></div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </form>;
}
