"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { key: string; href: string; label: string };

const ICONS: Record<string, React.ReactNode> = {
  today: <path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" />,
  grow: <path d="M4 20h16M6 16l4-5 3 3 5-8M18 6h-4M18 6v4" />,
  catering: <path d="M3 18h18M5 18a7 7 0 0 1 14 0M12 8V6M10 6h4" />,
  operations: <path d="M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6" />,
  settings: <path d="M4 7h10M18 7h2M4 17h2M10 17h10M16 4.5v5M8 14.5v5" />,
};

export function OwnerNav({ items, label }: { items: Item[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav className="o-nav" aria-label={label}>
      <ul className="o-nav__list">
        {items.map((item) => {
          const current = item.href === "/owner" ? pathname === "/owner" : pathname.startsWith(item.href);
          return (
            <li key={item.key}>
              <Link className="o-nav__link" href={item.href} aria-current={current ? "page" : undefined}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {ICONS[item.key]}
                </svg>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
