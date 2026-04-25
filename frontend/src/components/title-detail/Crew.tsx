import type { CrewMember } from "../../types";
import { Section } from "./Section";

export interface CrewProps {
  directors: CrewMember[];
  writers: CrewMember[];
}

export default function Crew({ directors, writers }: CrewProps) {
  if (directors.length === 0 && writers.length === 0) return null;
  return (
    <Section title="Crew">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {directors.length > 0 && (
          <div>
            <span className="text-zinc-400">Director: </span>
            <span className="text-white">{directors.map((d) => d.name).join(", ")}</span>
          </div>
        )}
        {writers.length > 0 && (
          <div>
            <span className="text-zinc-400">Writers: </span>
            <span className="text-white">{writers.map((w) => w.name).join(", ")}</span>
          </div>
        )}
      </div>
    </Section>
  );
}
