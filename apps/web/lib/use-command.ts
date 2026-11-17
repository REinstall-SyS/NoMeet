"use client";

import { useMutation } from "@tanstack/react-query";
import type { Command } from "@nomeet/domain";

type Result = { workspaceId?: string; token?: string; version?: number; id?: string };

export async function send(input: Command): Promise<Result> {
  const response = await fetch("/api/commands", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "Try again.");
  return payload.data;
}

export function useCommand() {
  return useMutation({ mutationFn: send });
}
