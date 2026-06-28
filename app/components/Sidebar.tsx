"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// ── SVG icons ────────────────────────────────────────────────────────────────

function IconPlay() {
  return (
    <svg width="11" height="13" viewBox="0 0 11 13" fill="currentColor">
      <path d="M1 1.5 10 6.5 1 11.5V1.5Z" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <rect x="1" y="2.5" width="12" height="10" rx="1.5" />
      <path d="M1 6h12M4.5 1v3M9.5 1v3" />
    </svg>
  );
}

function IconPencil() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2 12 4.5l-7.5 7.5H2v-2.5L9.5 2Z" />
    </svg>
  );
}

function IconList() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2 4h10M2 7h10M2 10h10" />
    </svg>
  );
}

function IconChevronLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2 4 7l5 5" />
    </svg>
  );
}

function IconMenu() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M2 4h10M2 7h10M2 10h10" />
    </svg>
  );
}

// ── Nav data ─────────────────────────────────────────────────────────────────

type NavItem = {
  href: string;
  label: string;
  Icon: () => JSX.Element;
};

type NavSection = {
  title: string;
  labelColor: string;
  items: NavItem[];
};

const sections: NavSection[] = [
  {
    title: "YouTube",
    labelColor: "#E05540",
    items: [{ href: "/youtube", label: "Product Research", Icon: IconPlay }],
  },
  {
    title: "Facebook Pages",
    labelColor: "#3B82F6",
    items: [
      { href: "/facebook/dashboard", label: "Scheduled Posts", Icon: IconCalendar },
      { href: "/facebook/compose",   label: "Compose Post",    Icon: IconPencil },
      { href: "/facebook/queue",     label: "Content Queue",   Icon: IconList },
    ],
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      className="flex flex-col flex-shrink-0 min-h-screen bg-white border-r border-black/5 transition-all duration-200"
      style={{ width: collapsed ? 52 : 216 }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-4 border-b border-black/5">
        <button
          onClick={onToggle}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors flex-shrink-0"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <IconMenu /> : <IconChevronLeft />}
        </button>
        {!collapsed && (
          <span className="text-sm font-bold text-gray-900 tracking-tight whitespace-nowrap">
            Influ Tools
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-5 overflow-hidden">
        {sections.map((section) => (
          <div key={section.title}>
            {!collapsed && (
              <p
                className="px-2 mb-1.5 text-[10px] font-bold uppercase tracking-widest"
                style={{ color: section.labelColor }}
              >
                {section.title}
              </p>
            )}
            {collapsed && <div className="mb-1.5 h-px bg-gray-100 mx-1" />}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/" && pathname.startsWith(item.href));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={`flex items-center gap-2.5 rounded-lg text-sm transition-colors ${
                        collapsed ? "justify-center px-0 py-2.5" : "px-2.5 py-2"
                      } ${
                        active
                          ? "bg-gray-900 text-white"
                          : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                      }`}
                    >
                      <span className="flex-shrink-0 flex items-center justify-center w-4">
                        <item.Icon />
                      </span>
                      {!collapsed && (
                        <span className="whitespace-nowrap">{item.label}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="px-4 py-3 border-t border-black/5 text-[11px] text-gray-300">
          v0.1.0
        </div>
      )}
    </aside>
  );
}
