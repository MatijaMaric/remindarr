import type { CastMember } from "../../types";
import PersonCard from "../PersonCard";
import ScrollableRow from "../ScrollableRow";
import { Section } from "./Section";

export interface CastProps {
  cast: CastMember[];
}

export default function Cast({ cast }: CastProps) {
  if (cast.length === 0) return null;
  return (
    <Section title="Cast">
      <ScrollableRow className="gap-4 pb-2">
        {cast.map((c) => (
          <PersonCard key={c.id} id={c.id} name={c.name} role={c.character} profilePath={c.profile_path} />
        ))}
      </ScrollableRow>
    </Section>
  );
}
