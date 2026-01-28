"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Code2, Play, Settings } from "lucide-react";

const navItems = [
  { href: "/decode", label: "Decode", icon: Code2 },
  { href: "/simulate", label: "Simulate", icon: Play },
  { href: "/config", label: "Settings", icon: Settings },
];

export function Header() {
  const pathname = usePathname();

  // Don't show header on home page
  if (pathname === "/") {
    return null;
  }

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-sm border-b border-slate-200">
      <div className="max-w-[1800px] mx-auto px-4 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Home button */}
          <Link
            href="/"
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
          >
            <Home className="w-5 h-5" />
            <span className="font-medium">Compound Security</span>
          </Link>

          {/* Navigation */}
          <nav className="flex items-center gap-1">
            {navItems.map(({ href, label, icon: Icon }) => {
              const isActive = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    isActive
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
