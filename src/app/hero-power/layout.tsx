import type { ReactNode } from "react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function HeroPowerLayout({ children }: { children: ReactNode }) {
  return children;
}
