import { workspaces } from "@nomeet/db";
import { ArrowRight, Layers3, Plus } from "lucide-react";
import Link from "next/link";
import { Brand } from "../../components/ui";
import { WorkspaceForm } from "../../components/action";
import { ThemeToggle } from "../../components/client";
import { requireUser } from "../../lib/session";
import { signOut } from "../../auth";

export default async function WorkspaceIndex() {
  const user = await requireUser();
  const items = await workspaces(user.id);
  return <main className="index-screen">
    <header className="index-nav"><Brand /><div className="row"><ThemeToggle /><form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}><button className="button quiet">Sign out</button></form></div></header>
    <div className="index-inner stack">
      <div><h1>Your workspaces</h1><p className="muted">Signed in as {user.email}</p></div>
      <div className="workspace-grid">{items.map(({ workspace, role }) =>
        <Link className="card workspace-tile" href={`/w/${workspace.id}/today`} key={workspace.id}>
          <span className="feature-icon"><Layers3 size={20} /></span><span><strong>{workspace.name}</strong><span className="muted small">{workspace.timezone} · {role.toLowerCase()}</span></span><ArrowRight size={18} />
        </Link>)}</div>
      <section className="card create-workspace stack"><h2 className="row"><Plus size={20} /> Create a workspace</h2><WorkspaceForm /></section>
    </div>
  </main>;
}
