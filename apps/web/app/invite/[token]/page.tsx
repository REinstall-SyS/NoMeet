import { inviteToken } from "@nomeet/domain";
import { notFound } from "next/navigation";
import { AcceptInvite } from "../../../components/action";
import { Brand } from "../../../components/ui";
import { requireUser } from "../../../lib/session";

export default async function Invitation({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!inviteToken.safeParse(token).success) notFound();
  const user = await requireUser(`/invite/${token}`);
  return <main className="auth-screen"><Brand /><section className="card auth-card stack">
    <div><h1>Join your team</h1><p className="muted">You’re accepting this invitation as {user.email}.</p></div>
    <AcceptInvite token={token} />
  </section></main>;
}
