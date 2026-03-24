import type { Title } from "../types";
import TitleCard from "./TitleCard";

interface Props {
  titles: Title[];
  onTrackToggle?: () => void;
  emptyMessage?: string;
}

export default function TitleList({ titles, onTrackToggle, emptyMessage = "No titles found" }: Props) {
  if (titles.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {titles.map((title) => (
        <TitleCard key={title.id} title={title} onTrackToggle={onTrackToggle} />
      ))}
    </div>
  );
}
