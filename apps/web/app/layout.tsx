import "@fontsource-variable/inter";
import "./styles.css";
import type { Metadata } from "next";
import { ClientProviders } from "../components/client";

export const metadata: Metadata = {
  title: { default: "NoMeet · Async standups for small teams", template: "%s · NoMeet" },
  description: "Share progress, surface blockers, and keep commitments in one team workspace.",
  referrer: "same-origin",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body>
    <script dangerouslySetInnerHTML={{ __html: "try{document.documentElement.dataset.theme=localStorage.getItem('nomeet-theme')||'system'}catch{}" }} />
    <ClientProviders>{children}</ClientProviders>
  </body></html>;
}
