import Link from "next/link";
import { ArrowRight, CircleDot, Command, Link2 } from "lucide-react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";

const buttonVariants = cva("button", { variants: { variant: { primary: "primary", secondary: "secondary", quiet: "quiet" } }, defaultVariants: { variant: "secondary" } });
export function Button({ variant, asChild, className, ...props }: React.ComponentProps<"button"> & { variant?: "primary" | "secondary" | "quiet"; asChild?: boolean }) {
  const Element = asChild ? Slot : "button";
  return <Element className={buttonVariants({ variant, className })} {...props} />;
}

export function Brand() {
  return <Link href="/" className="brand"><span className="brand-mark"><Command size={19} strokeWidth={2.4} /></span>NoMeet<span className="brand-dot">.</span></Link>;
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return <div className="empty"><CircleDot size={20} /><strong>{title}</strong>{children && <p>{children}</p>}</div>;
}

export function Source({ root, id, label = "Source update" }: { root: string; id: string; label?: string }) {
  return <Link className="source" href={`${root}/activity?update=${id}`}><Link2 size={14} />{label}</Link>;
}

export function NextPage({ href }: { href: string }) {
  return <Link className="button secondary" href={href}>Older items <ArrowRight size={15} /></Link>;
}
