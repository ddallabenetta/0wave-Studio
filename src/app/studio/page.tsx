import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { StudioRoot } from "@/components/studio/StudioRoot";

export const metadata: Metadata = { title: "Studio" };

export default function StudioPage() {
  return (
    <AppShell>
      <StudioRoot />
    </AppShell>
  );
}
