"use client";
import { Button } from "../components/ui";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="auth-screen"><section className="card stack"><h1>Couldn’t load this page</h1><p>Try again in a moment.</p><Button onClick={reset}>Try again</Button></section></main>;
}
