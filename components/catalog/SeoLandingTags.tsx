import Link from "next/link";

interface SeoLandingTagsProps {
  tags: Array<{ href: string; label: string }>;
  /** Currently active landing slug label to highlight (optional). */
  activeLabel?: string;
}

export function SeoLandingTags({ tags, activeLabel }: SeoLandingTagsProps) {
  if (!tags.length) return null;

  return (
    <div className="mb-5 flex flex-wrap gap-2">
      {tags.map((tag) => {
        const active =
          activeLabel != null &&
          tag.label.toLowerCase() === activeLabel.toLowerCase();
        return (
          <Link
            key={tag.href}
            href={tag.href}
            className={
              active
                ? "rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white"
                : "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-black/80 hover:border-slate-400 hover:text-black"
            }
          >
            {tag.label}
          </Link>
        );
      })}
    </div>
  );
}
