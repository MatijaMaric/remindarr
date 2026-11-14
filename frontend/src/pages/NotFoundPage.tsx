import { Link } from "react-router";

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
      <p className="text-xl text-foreground-secondary">Page not found</p>
      <p className="text-sm text-muted-foreground">
        The page you are looking for does not exist.
      </p>
      <Link
        to="/"
        className="mt-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        Go back home
      </Link>
    </div>
  );
}
