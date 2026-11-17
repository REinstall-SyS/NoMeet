"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const theme = document.documentElement.dataset.theme;
    setDark(theme === "dark" || (theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches));
  }, []);
  return <button type="button" className="icon-button" aria-label={dark ? "Use light theme" : "Use dark theme"}
    onClick={() => {
      const theme = dark ? "light" : "dark";
      localStorage.setItem("nomeet-theme", theme);
      document.documentElement.dataset.theme = theme;
      setDark(!dark);
    }}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button>;
}
