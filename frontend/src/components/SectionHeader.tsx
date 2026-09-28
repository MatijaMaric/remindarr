import type { ReactNode } from "react";
import { Link } from "react-router";
import { Kicker } from "./design";

/** Shared home-section header: kicker, title, and an optional trailing link. */
export function SectionHeader({
  kicker,
  title,
  href,
  linkLabel,
  headingExtra,
}: {
  kicker: ReactNode;
  title: ReactNode;
  href?: string;
  linkLabel?: ReactNode;
  headingExtra?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between mb-4">
      <div>
        <Kicker>{kicker}</Kicker>
        {headingExtra ? (
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold tracking-[-0.01em]">{title}</h2>
            {headingExtra}
          </div>
        ) : (
          <h2 className="text-xl font-bold tracking-[-0.01em]">{title}</h2>
        )}
      </div>
      {href && linkLabel != null ? (
        <Link
          to={href}
          className="font-mono text-xs text-amber-400 hover:text-amber-300 transition-colors"
        >
          {linkLabel}
        </Link>
      ) : null}
    </div>
  );
}
