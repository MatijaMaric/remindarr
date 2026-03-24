import { Link } from "react-router";

const TMDB_IMG = "https://image.tmdb.org/t/p";

interface PersonCardProps {
  id: number;
  name: string;
  role: string;
  profilePath: string | null;
}

export default function PersonCard({ id, name, role, profilePath }: PersonCardProps) {
  return (
    <Link to={`/person/${id}`} className="flex-shrink-0 w-28 text-center group">
      <div className="w-20 h-20 mx-auto rounded-full overflow-hidden bg-zinc-800 mb-2 group-hover:ring-2 group-hover:ring-amber-400 transition-all">
        {profilePath ? (
          <img src={`${TMDB_IMG}/w185${profilePath}`} alt={name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600 text-2xl">
            {name.charAt(0)}
          </div>
        )}
      </div>
      <p className="text-sm font-medium text-white truncate group-hover:text-amber-400 transition-colors">{name}</p>
      <p className="text-xs text-zinc-400 truncate">{role}</p>
    </Link>
  );
}
