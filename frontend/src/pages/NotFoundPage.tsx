import { Link } from "react-router";

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <h1 className="text-6xl font-bold text-zinc-600">404</h1>
      <p className="text-xl text-zinc-400">Page not found</p>
      <p className="text-sm text-zinc-500">The page you are looking for does not exist.</p>
      <Link
        to="/"
        className="mt-2 px-4 py-2 rounded-lg bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 transition-colors"
      >
        Go back home
      </Link>
    </div>
  );
}
