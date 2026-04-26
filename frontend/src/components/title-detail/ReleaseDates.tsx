import type { ReleaseDatesResult } from "../../types";
import { Card } from "@/components/ui/card";
import { Section } from "./Section";
import { RELEASE_TYPE_LABELS, formatDate } from "./utils";

export interface ReleaseDatesProps {
  releaseDates: ReleaseDatesResult | undefined;
}

export default function ReleaseDates({ releaseDates }: ReleaseDatesProps) {
  if (!releaseDates || releaseDates.release_dates.length === 0) return null;
  return (
    <Section title={`Release Dates (${releaseDates.iso_3166_1})`}>
      <Card padding="none" className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="text-left py-2 px-4 text-zinc-400 font-medium">Type</th>
              <th className="text-left py-2 px-4 text-zinc-400 font-medium">Date</th>
              <th className="text-left py-2 px-4 text-zinc-400 font-medium">Certification</th>
              <th className="text-left py-2 px-4 text-zinc-400 font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {releaseDates.release_dates.map((rd) => (
              <tr key={`${rd.release_date}-${rd.type}`} className="border-b border-zinc-800/50 last:border-0">
                <td className="py-2 px-4 text-zinc-300">{RELEASE_TYPE_LABELS[rd.type] || `Type ${rd.type}`}</td>
                <td className="py-2 px-4 text-zinc-300">{formatDate(rd.release_date)}</td>
                <td className="py-2 px-4">
                  {rd.certification && (
                    <span className="border border-white/[0.10] px-1.5 py-0.5 rounded text-xs text-zinc-300">
                      {rd.certification}
                    </span>
                  )}
                </td>
                <td className="py-2 px-4 text-zinc-500 text-xs">{rd.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </Section>
  );
}
