import Link from "next/link";
import { Brand, Button } from "../components/ui";
export default function Missing() {
  return <main className="auth-screen"><Brand /><section className="card stack"><h1>Page unavailable</h1><p>This page may have moved or you may need an invitation.</p><Button asChild><Link href="/workspaces">Go to workspaces</Link></Button></section></main>;
}
