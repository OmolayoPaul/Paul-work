import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="card mx-auto max-w-lg p-8 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-forest-600">Page not found</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink">We couldn't find that page</h1>
      <p className="mt-2 text-sm text-ink-soft">
        The page may have moved, or your role may not have access to it.
      </p>
      <Link to="/" className="btn-primary mt-6">
        Back to home
      </Link>
    </div>
  );
}
