import Link from "next/link";
import { ArrowRight, CalendarCheck2, CircleAlert, ListChecks } from "lucide-react";
import { Brand, Button } from "../components/ui";
import { ThemeToggle } from "../components/client";

const features = [
  { icon: CalendarCheck2, title: "Check in on your schedule", detail: "Give your team a clear daily record of what shipped, what’s next, and where you need help." },
  { icon: CircleAlert, title: "Keep blockers visible", detail: "Assign an owner, discuss the issue, and follow it through to a resolution." },
  { icon: ListChecks, title: "Follow through on commitments", detail: "Carry open work into the next check-in and review progress with your team." },
];

export default function Home() {
  return <main className="landing">
    <header className="landing-nav"><Brand /><div className="row"><ThemeToggle /><Button asChild variant="quiet"><Link href="/signin">Sign in</Link></Button></div></header>
    <section className="hero">
      <div className="hero-content"><p className="eyebrow"><span /> ASYNC STANDUPS</p>
        <h1>Keep everyone<br />in the loop.</h1>
        <p className="lede">One place for daily updates, blockers, and commitments. Built for small teams that work on different schedules.</p>
        <Button asChild variant="primary"><Link href="/workspaces">Open your workspace <ArrowRight size={17} /></Link></Button>
      </div>
      <div className="feature-stack">{features.map(({ icon: Icon, title, detail }) => <article key={title}>
        <div className="feature-icon"><Icon size={22} /></div>
        <div><h2>{title}</h2><p>{detail}</p></div>
      </article>)}</div>
    </section>
    <footer className="landing-footer"><Brand /><span>Team progress, in one place.</span></footer>
  </main>;
}
