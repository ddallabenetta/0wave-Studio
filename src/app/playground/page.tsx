import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { PlaygroundRoot } from "@/components/playground/PlaygroundRoot";

export const metadata: Metadata = { title: "Playground" };

export default function PlaygroundPage() {
  return (
    <AppShell>
      <PlaygroundRoot />
    </AppShell>
  );
}
