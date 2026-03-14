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
      <div className="w-20 h-20 mx-auto rounded-full overflow-hidden bg-gray-800 mb-2 group-hover:ring-2 group-hover:ring-indigo-500 transition-all">
        {profilePath ? (
          <img src={`${TMDB_IMG}/w185${profilePath}`} alt={name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-600 text-2xl">
            {name.charAt(0)}
          </div>
        )}
      </div>
      <p className="text-sm font-medium text-white truncate group-hover:text-indigo-400 transition-colors">{name}</p>
      <p className="text-xs text-gray-400 truncate">{role}</p>
    </Link>
  );
}
