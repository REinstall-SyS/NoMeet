import { AppError, getActivity, getBlockers, getCommitments, getDigest, getInsights, getNotifications, getPeople, getToday, getUpdate, getWorkspace } from "@nomeet/db";
import { blankUpdate, daySchema, fields, localTime, sections, shiftDay, templates } from "@nomeet/domain";
import { CalendarDays, CheckCircle2, CircleAlert, Clock3, ListChecks, Search, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InviteForm } from "../../../../components/action";
import { Editor } from "../../../../components/editor";
import { Navigation } from "../../../../components/navigation";
import { Button, Empty, NextPage, Source } from "../../../../components/ui";
import { BlockerForm, CommitmentForm, Complete, CreateWork, NotificationList, Preferences, RoleForm, SettingsForm } from "../../../../components/work-actions";
import { requireUser, visible } from "../../../../lib/session";

const headings = {
  today: ["Today", "Share progress and see who’s checked in."],
  activity: ["Team activity", "Search updates and follow changes across the workspace."],
  blockers: ["Blocker board", "See what’s holding the team up, who owns it, and what’s resolved."],
  commitments: ["Commitments", "Track work with an owner, due date, and source update."],
  digest: ["Team digests", "Review progress, decisions, and open blockers with links to the original updates."],
  insights: ["Team insights", "Check-in participation and follow-through across the workspace."],
  settings: ["Workspace settings", "Manage your team, standing schedule, and notification preferences."],
  notifications: ["Notifications", "Assignments, decision requests, reminders, and digests."],
} as const;
type Section = keyof typeof headings;
type Context = { workspaceId: string; viewer: string; lead: boolean; owner: boolean; root: string; today: string };
type SearchParams = Record<string, string | string[] | undefined>;
const param = (search: SearchParams, key: string) => typeof search[key] === "string" ? search[key] : undefined;
const name = (value: string | null | undefined) => value ?? "Teammate";
const dateLabel = (day: string) => new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(day));
const daysOld = (now: string, start: string) => Math.max(0, Math.round((Date.parse(now) - Date.parse(start)) / 864e5));

export default async function WorkspacePage({ params, searchParams }: { params: Promise<{ workspace: string; section?: string[] }>; searchParams: Promise<SearchParams> }) {
  const { workspace: workspaceId, section: path } = await params;
  const section = (path?.[0] ?? "today") as Section;
  if ((path && path.length !== 1) || !sections.includes(section)) notFound();
  const root = `/w/${workspaceId}`;
  const user = await requireUser(`${root}/${section}`);
  const member = await visible(getWorkspace(workspaceId, user.id));
  const today = localTime(new Date(), member.workspace.timezone).day;
  const ctx = { workspaceId, viewer: user.id, lead: member.role !== "MEMBER", owner: member.role === "OWNER", root, today };
  const search = await searchParams;
  const [title, subtitle] = headings[section];
  let body: React.ReactNode;

  switch (section) {
    case "today": body = <Today {...ctx} search={search} template={member.workspace.template} />; break;
    case "activity": body = <Activity {...ctx} search={search} />; break;
    case "blockers": body = <Blockers {...ctx} search={search} zone={member.workspace.timezone} />; break;
    case "commitments": body = <Commitments {...ctx} search={search} />; break;
    case "digest": body = <Digests {...ctx} search={search} />; break;
    case "insights": body = <Insights {...ctx} />; break;
    case "settings": body = <Settings {...ctx} member={member} />; break;
    case "notifications": {
      const items = await visible(getNotifications(workspaceId, user.id));
      body = <section className="card">{items.length ? <NotificationList workspaceId={workspaceId} items={items} root={root} /> : <Empty title="You’re all caught up">New notifications will appear here.</Empty>}</section>;
    }
  }

  return <div className="shell">
    <a className="skip-link" href="#workspace-content">Skip to content</a>
    <Navigation key={workspaceId} workspace={workspaceId} name={member.workspace.name} section={section} viewer={name(user.name)} />
    <main className="workspace-main" id="workspace-content">
      <header className="breadcrumbs"><Link href="/workspaces">Workspaces</Link><span>/</span><Link href={`${root}/today`}>{member.workspace.name}</Link><span>/</span><strong>{title}</strong></header>
      <div className="workspace-content">
        <header className="page-header"><div><h1>{title}</h1><p>{subtitle}</p></div>{section === "today" && <span className="date-chip"><CalendarDays size={16} /> {dateLabel(today)}</span>}</header>
        {body}
      </div>
    </main>
  </div>;
}

async function Today(ctx: Context & { search: SearchParams; template: string }) {
  const { workspaceId, viewer, root, search, lead } = ctx;
  const item = await visible(getToday(workspaceId, viewer, param(search, "day")));
  const people = item.update ? await visible(getPeople(workspaceId, viewer)) : [];
  const hints = templates[ctx.template as keyof typeof templates] ?? templates.ENGINEERING;
  return <div className="split">
    <div className="stack">
      <form className="filter-form" action={`${root}/today`}><label>Update date<input type="date" name="day" defaultValue={item.day} max={item.today} min={shiftDay(item.today, -90)} required /></label>
        <Button type="submit">View date</Button>{item.day !== item.today && <Link href={`${root}/today`} className="small">Back to today</Link>}</form>
      <Editor key={`${item.day}:${item.update?.version ?? 0}`} workspaceId={workspaceId} day={item.day} version={item.update?.version ?? 0} draftVersion={item.draftVersion}
        initial={item.draft ?? fields.safeParse(item.update).data ?? blankUpdate} hints={hints} />
      {item.update && <section className="card stack">
        <div className="between"><h2>Published update</h2><Source root={root} id={item.update.id} label="Open update" /></div>
        <CreateWork workspaceId={workspaceId} viewer={viewer} lead={lead} people={people} day={item.today} sourceId={item.update.id} allowCommitment />
        <details className="disclosure"><summary>Edit history</summary>
          <div className="stack compact">{item.update.revisions.map(revision => {
            const snapshot = fields.safeParse(revision.snapshot).data;
            return <details key={revision.version} className="disclosure"><summary>Version {revision.version} · {revision.createdAt.toISOString().slice(0, 10)}</summary>
              {snapshot && <UpdateFields update={snapshot} />}</details>;
          })}</div>
        </details>
      </section>}
    </div>
    <aside className="stack">
      <section className="card stack">
        <div className="between"><h2 className="row"><Users size={18} /> Team check-ins</h2><span className="pill">{item.roster.filter(member => item.checkedIn.some(row => row.authorId === member.userId)).length} / {item.roster.length}</span></div>
        <ul className="items">{item.roster.map(member => {
          const update = item.checkedIn.find(row => row.authorId === member.userId);
          const label = name(member.user.name);
          return <li key={member.userId} className="list-row">
            <div className="row"><span className="avatar">{label.slice(0, 2).toUpperCase()}</span><span>{label}{member.userId === viewer ? " (you)" : ""}</span></div>
            {update ? <Link href={`${root}/activity?update=${update.id}`} className="success small row"><CheckCircle2 size={15} /> Posted</Link> : <span className="muted small">Pending</span>}
          </li>;
        })}</ul>
      </section>
      <section className="card stack">
        <h2 className="row"><ListChecks size={18} /> Carryover</h2>
        {item.outstanding.length ? <ul className="items">{item.outstanding.map(work => <li className="stack compact list-item" key={work.id}>
          <Link href={`${root}/commitments#${work.id}`}>{work.description}</Link><span className="muted small">Due {work.dueDay}</span>
          <Complete workspaceId={workspaceId} item={{ id: work.id, ownerId: work.ownerId, dueDay: work.dueDay, version: work.version }} />
        </li>)}</ul> : <Empty title="No commitments due">Open work from previous updates and commitments due by this date will appear here.</Empty>}
      </section>
    </aside>
  </div>;
}

function UpdateFields({ update }: { update: { done: string; next: string; impediments: string; decisions: string; links: string[] } }) {
  return <div className="stack">
    {([[ "Accomplishments", update.done ], [ "Next priorities", update.next ], [ "Blockers", update.impediments ], [ "Decisions or help", update.decisions ]] as const).filter(([, content]) => content).map(([label, content]) =>
      <div key={label}><h3>{label}</h3><p className="preserve">{content}</p></div>)}
    {!!update.links.length && <div><h3>Links</h3><ul className="items">{update.links.map((link, i) => <li key={i}><a className="source" href={link} rel="noreferrer" target="_blank">{link}</a></li>)}</ul></div>}
  </div>;
}

async function Activity(ctx: Context & { search: SearchParams }) {
  const { workspaceId, viewer, root, search, lead, today } = ctx;
  const focus = param(search, "update");
  if (focus) {
    const [item, people] = await Promise.all([visible(getUpdate(workspaceId, viewer, focus)), visible(getPeople(workspaceId, viewer))]);
    return <div className="stack"><Link href={`${root}/activity`} className="source">‹ Back to activity</Link><article className="card stack">
      <div><h2>{name(item.author.user.name)}’s update</h2><p className="muted small">{dateLabel(item.day)}</p></div>
      <UpdateFields update={item} />
      {!!item.legacyReplies.length && <section className="stack compact"><h3>Archived discussion</h3>{item.legacyReplies.map(reply => <div key={reply.path} className="list-item">
        <strong>{reply.authorLabel}</strong><p className="preserve">{reply.body}</p>
      </div>)}</section>}
      <CreateWork workspaceId={workspaceId} viewer={viewer} lead={lead} people={people} day={today} sourceId={item.id} allowCommitment={lead || viewer === item.authorId} />
    </article></div>;
  }
  const q = param(search, "q");
  let feed;
  try { feed = await visible(getActivity(workspaceId, viewer, param(search, "cursor"), q)); }
  catch (error) {
    if (!(error instanceof AppError) || error.status !== 400) throw error;
    return <section className="card stack"><p>{error.message}</p><Link href={`${root}/activity`}>Return to the latest activity</Link></section>;
  }
  return <section className="card stack">
    <form action={`${root}/activity`} className="filter-form">
      <label>Search activity<input type="search" name="q" maxLength={100} defaultValue={q} placeholder="Search updates or teammates" /></label><Button type="submit"><Search size={16} /> Search</Button>
      {q && <Link href={`${root}/activity`}>Clear</Link>}
    </form>
    {feed.items.length ? <ul className="items">{feed.items.map(item => <li className="list-row" key={item.id}>
      <Link href={`${root}/${item.path}`} className="activity-link"><span className="avatar">{name(item.actor.user.name).slice(0, 2)}</span>
        <span><strong>{name(item.actor.user.name)}</strong> · {item.label}</span></Link><time dateTime={item.createdAt.toISOString()} className="muted small">{item.createdAt.toISOString().slice(0, 10)}</time>
    </li>)}</ul> : <Empty title={q ? "No matching activity" : "No team activity yet"}>{q ? "Try a different search." : "Publish your first update to start the team feed."}</Empty>}
    {feed.next && <NextPage href={`${root}/activity?cursor=${feed.next}${q ? `&q=${encodeURIComponent(q)}` : ""}`} />}
  </section>;
}

async function Blockers(ctx: Context & { search: SearchParams; zone: string }) {
  const { workspaceId, root, viewer, lead, today, zone, search } = ctx;
  const [people, open, resolved] = await Promise.all([visible(getPeople(workspaceId, viewer)),
    visible(getBlockers(workspaceId, viewer, "OPEN", param(search, "open"))), visible(getBlockers(workspaceId, viewer, "RESOLVED", param(search, "resolved")))]);
  return <div className="board">{([[ "Open", open, "open" ], [ "Resolved", resolved, "resolved" ]] as const).map(([label, group, key]) => <section className="board-column stack" key={key}>
    <h2 className="row">{key === "open" ? <CircleAlert size={19} /> : <CheckCircle2 size={19} />}{label}</h2>
    {!group.items.length && <Empty title={`No ${label.toLowerCase()} blockers`}>{key === "open" ? "Track a blocker from a published update." : "Resolved blockers will appear here."}</Empty>}
    {group.items.map(item => <article className="card stack" key={item.id} id={item.id}>
      <div className="between"><span className={`pill severity-${item.severity.toLowerCase()}`}>{item.severity.toLowerCase()} severity</span>
        <span className="muted small row"><Clock3 size={14} /> {daysOld(item.resolvedAt ? localTime(item.resolvedAt, zone).day : today, localTime(item.createdAt, zone).day)}d</span></div>
      <div><h3>{item.title}</h3><p className="muted small">{item.owner ? name(item.owner.user.name) : "Unassigned"}</p></div>
      <div className="row wrap">{item.sources.map(source => <Source key={source.standupId} root={root} id={source.standupId} label={source.standup.day} />)}</div>
      {!!item.comments.length && <details className="disclosure"><summary>Discussion ({item.comments.length}{item.comments.length === 30 ? "+" : ""})</summary>
        {item.comments.map(comment => <div className="list-item" key={comment.id}><strong className="small">{name(comment.author.user.name)}</strong><p className="preserve">{comment.body}</p></div>)}</details>}
      <BlockerForm key={item.version} workspaceId={workspaceId} item={item} people={people} lead={lead} viewer={viewer} />
    </article>)}
    {group.next && <NextPage href={`${root}/blockers?${key}=${group.next}`} />}
  </section>)}</div>;
}

async function Commitments(ctx: Context & { search: SearchParams }) {
  const { workspaceId, root, viewer, lead, today, search } = ctx;
  const statuses = ["OPEN", "COMPLETED", "CANCELED"] as const;
  const [people, ...groups] = await Promise.all([visible(getPeople(workspaceId, viewer)), ...statuses.map(status => visible(getCommitments(workspaceId, viewer, status, param(search, status))))]);
  return <div className="stack">{groups.map(({ items, next }, i) => (i === 0 || items.length > 0) && <section className="stack" key={statuses[i]}>
    <h2 className="section-label">{["Outstanding", "Completed", "Canceled"][i]}</h2>
    {!items.length && <div className="card"><Empty title="No outstanding commitments">Create work from a published update or check back when new work is assigned.</Empty></div>}
    {items.map(item => <article className="card stack" key={item.id} id={item.id}>
      <div className="between"><h3>{item.description}</h3><span className={`pill ${item.status === "OPEN" && item.dueDay < today ? "severity-high" : ""}`}>{item.status === "OPEN" && item.dueDay < today ? "Overdue" : item.status.toLowerCase()}</span></div>
      <div className="row wrap"><span className="muted small">{name(item.owner.user.name)} · Due {item.dueDay}</span><Source root={root} id={item.sourceId} /></div>
      {(lead || item.ownerId === viewer) && <CommitmentForm key={item.version} workspaceId={workspaceId} item={item} people={people} lead={lead} />}
      <details className="disclosure"><summary>History</summary><ul className="items">{item.history.map(event => <li className="list-row" key={event.id}>
        <span>{name(event.actor.user.name)} · {event.status.toLowerCase()} · Due {event.dueDay}</span><span className="muted small">{event.createdAt.toISOString().slice(0, 10)}</span>
      </li>)}</ul></details>
    </article>)}
    {next && <NextPage href={`${root}/commitments?${statuses[i]}=${next}`} />}
  </section>)}</div>;
}

async function Digests({ workspaceId, viewer, root, search, today }: Context & { search: SearchParams }) {
  const selected = daySchema.safeParse(param(search, "day")).data;
  const day = selected && selected <= today ? selected : today;
  const period = param(search, "period") === "weekly" ? "weekly" : "daily";
  const { content, ai, createdAt } = await visible(getDigest(workspaceId, viewer, period, day));
  const decisions = content.updates.filter(update => update.decisions);
  return <div className="stack">
    <form className="filter-form" action={`${root}/digest`}><label>Period<select name="period" defaultValue={period}><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
      <label>Ending on<input name="day" type="date" defaultValue={day} max={today} /></label><Button>View digest</Button></form>
    <section className="card stack">
      <div className="between"><h2>{dateLabel(day)}</h2><span className="pill">{createdAt ? "Scheduled snapshot" : "Live digest"}</span></div>
      <p className="muted">{content.updates.length} published {content.updates.length === 1 ? "update" : "updates"} · {content.outstanding} outstanding {content.outstanding === 1 ? "commitment" : "commitments"}</p>
      {!content.updates.length && <Empty title="No updates in this period">Published updates will appear in the digest.</Empty>}
      {content.updates.map(update => <article className="list-item stack compact" key={update.id}>
        <div className="between"><h3>{update.author}</h3><Source root={root} id={update.id} label={update.day} /></div>
        {update.done && <p className="preserve"><b>Done</b> · {update.done}</p>}{update.next && <p className="preserve"><b>Next</b> · {update.next}</p>}
      </article>)}
    </section>
    <div className="board"><section className="card stack"><h2>Open blockers</h2>{content.blockers.length ? content.blockers.map(item => <div className="list-item" key={item.id}>
      <Link href={`${root}/blockers#${item.id}`}>{item.title}</Link><div className="row wrap">{item.sourceIds.map(id => <Source root={root} id={id} key={id} />)}</div>
    </div>) : <Empty title="No tracked blockers" />}</section>
      <section className="card stack"><h2>Decisions and help</h2>{decisions.length ? decisions.map(item => <div className="list-item" key={item.id}><p className="preserve">{item.decisions}</p><Source root={root} id={item.id} /></div>) : <Empty title="No requests in this period" />}</section></div>
    {!!ai?.observations.length && <section className="card stack"><h2>Gemini observations</h2><p className="muted">Review the cited updates before acting on a suggestion.</p>
      {ai.observations.map((item, i) => <article className="list-item" key={i}><span className="pill">{item.kind}</span><p>{item.text}</p><div className="row wrap">{item.sourceIds.map(id => <Source root={root} id={id} key={id} />)}</div></article>)}
    </section>}
  </div>;
}

async function Insights({ workspaceId, viewer }: Context) {
  const data = await visible(getInsights(workspaceId, viewer));
  const metrics = [
    ["Scheduled check-in rate", data.completion === null ? "—" : `${data.completion}%`],
    ["Average blocker resolution", data.averageHours === null ? "—" : `${data.averageHours.toFixed(1)} h`],
    ["Outstanding commitments", data.outstanding], ["Overdue commitments", data.overdue],
  ];
  return <div className="stack"><div className="metric-grid">{metrics.map(([label, value]) => <div className="card metric" key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
    <section className="card stack"><div><h2>Check-ins this week</h2><p className="muted">Published updates from eligible members over the last seven days.</p></div>
      <ul className="items">{data.days.map(item => <li className="chart-row" key={item.day}>
        <time dateTime={item.day}>{item.day.slice(5)}</time>
        <meter min={0} max={Math.max(item.expected, 1)} value={item.actual} aria-label={`Check-ins for ${item.day}`} />
        <span className="muted small">{item.actual} / {item.expected}{!item.scheduled && " · off"}</span>
      </li>)}</ul></section>
  </div>;
}

async function Settings({ workspaceId, viewer, lead, owner, member }: Context & { member: Awaited<ReturnType<typeof getWorkspace>> }) {
  const people = await visible(getPeople(workspaceId, viewer));
  return <div className="split"><div className="stack">
    <section className="card stack"><h2>Team</h2><ul className="items">{people.map(person => <li key={person.userId} className="list-row">
      <div className="row"><span className="avatar">{name(person.user.name).slice(0, 2)}</span><div><strong>{name(person.user.name)}</strong><p className="muted small">{person.role.toLowerCase()}</p></div></div>
      {owner && person.role !== "OWNER" && <RoleForm workspaceId={workspaceId} userId={person.userId} role={person.role} name={name(person.user.name)} />}
    </li>)}</ul>{lead && <InviteForm workspaceId={workspaceId} />}</section>
    {lead && <section className="card stack"><h2>Standup schedule</h2><SettingsForm item={member.workspace} /></section>}
  </div><section className="card stack"><h2>My preferences</h2><Preferences workspaceId={workspaceId} reminders={member.reminders} emailOptIn={member.emailOptIn} /></section></div>;
}
