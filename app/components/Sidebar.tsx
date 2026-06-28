"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: string;
};

type NavSection = {
  title: string;
  color: string;
  items: NavItem[];
};

const sections: NavSection[] = [
  {
    title: "YouTube",
    color: "text-red-600",
    items: [{ href: "/youtube", label: "Product Research", icon: "▶" }],
  },
  {
    title: "Facebook Pages",
    color: "text-blue-600",
    items: [
      { href: "/facebook/dashboard", label: "Scheduled Posts", icon: "📅" },
      { href: "/facebook/compose", label: "Compose Post", icon: "✏️" },
      { href: "/facebook/queue", label: "Content Queue", icon: "📋" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 min-h-screen bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
      <div className="px-4 py-5 border-b border-gray-100">
        <span className="text-base font-bold text-gray-900 tracking-tight">
          Influ Tools
        </span>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-6 overflow-y-auto">
        {sections.map((section) => (
          <div key={section.title}>
            <p
              className={`px-2 mb-1 text-xs font-semibold uppercase tracking-wider ${section.color}`}
            >
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/" && pathname.startsWith(item.href));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm transition-colors ${
                        active
                          ? "bg-gray-100 text-gray-900 font-medium"
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      }`}
                    >
                      <span className="text-base leading-none">{item.icon}</span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
        v0.1.0
      </div>
    </aside>
  );
}
