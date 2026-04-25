import type { ReactNode } from "react";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-[18px] font-semibold text-white tracking-tight leading-tight">{title}</h2>
      {children}
    </section>
  );
}
