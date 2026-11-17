import { AppError } from "@nomeet/db";
import { notFound, redirect } from "next/navigation";
import { auth } from "../auth";

export async function requireUser(next = "/workspaces") {
  const session = await auth();
  if (!session?.user?.id) redirect(`/signin?next=${encodeURIComponent(next)}`);
  return session.user;
}

export async function visible<T>(read: Promise<T>) {
  try { return await read; }
  catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
}
