"use client";

import { useEffect, useRef, useState } from "react";

type NavItem = { id: string; label: string; children?: NavItem[] };

const NAV: NavItem[] = [
  {
    id: "intro",
    label: "Intro to ARCRYPT",
    children: [
      { id: "what-is-arcrypt", label: "What is ARCRYPT" },
      { id: "mission", label: "The Mission" },
    ],
  },
  { id: "ensuring-privacy", label: "Ensuring privacy" },
  { id: "arcium", label: "What is Arcium" },
  {
    id: "rules",
    label: "How it works",
    children: [
      { id: "seller-flow", label: "Seller flow" },
      { id: "auction-types", label: "Auction types" },
      { id: "bidding-escrow", label: "Bidding & escrow" },
      { id: "settlement", label: "Settlement" },
    ],
  },
  { id: "dao-proposal", label: "Create a DAO proposal" },
  { id: "arcrypt-dao", label: "Create an ARCRYPT DAO" },
  {
    id: "developers",
    label: "Developers",
    children: [
      { id: "dev-ts", label: "Typescript SDK" },
      { id: "dev-rust", label: "Rust SDK" },
    ],
  },
  { id: "faq", label: "FAQ" },
];

export default function DocsSidebar() {
  const [activeId, setActiveId] = useState<string>("what-is-arcrypt");
  const ticking = useRef(false);
  const sectionsRef = useRef<HTMLElement[]>([]);
  const offsetRef = useRef<number>(96);
  const flatIdsRef = useRef<string[]>([]);

  function flattenNav(nav: NavItem[]) {
    const out: string[] = [];
    for (const item of nav) {
      out.push(item.id);
      if (item.children) for (const c of item.children) out.push(c.id);
    }
    return out;
  }

  useEffect(() => {
    flatIdsRef.current = flattenNav(NAV);

    sectionsRef.current = flatIdsRef.current
      .map((id) => document.getElementById(id))
      .filter(Boolean) as HTMLElement[];

    const headerEl = document.querySelector("header");
    const headerHeight = headerEl ? headerEl.getBoundingClientRect().height : 0;
    offsetRef.current = Math.max(64, Math.round(headerHeight + 24));
  }, []);

  useEffect(() => {
    function onScroll() {
      if (ticking.current) return;
      ticking.current = true;

      requestAnimationFrame(() => {
        const sections = sectionsRef.current;
        const offset = offsetRef.current;

        let best: { id: string; distance: number } | null = null;

        for (const el of sections) {
          const rect = el.getBoundingClientRect();
          const distance = rect.top - offset;

          if (!best) {
            best = { id: el.id, distance };
            continue;
          }

          const bestDist = best.distance;
          const pick = (bestDist > 0 && distance <= 0) || Math.abs(distance) < Math.abs(bestDist);
          if (pick) best = { id: el.id, distance };
        }

        if (best && best.id !== activeId) {
          setActiveId(best.id);
        }

        ticking.current = false;
      });
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [activeId]);

  function scrollToId(id: string) {
    const el = document.getElementById(id);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const offset = offsetRef.current;
    const targetY = window.scrollY + rect.top - offset;

    window.scrollTo({ top: Math.max(0, Math.round(targetY)), behavior: "smooth" });
    setActiveId(id);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLUListElement>) {
    const flat = flatIdsRef.current;
    const idx = flat.findIndex((i) => i === activeId);

    if (e.key === "ArrowDown") {
      const next = flat[Math.min(flat.length - 1, Math.max(0, idx + 1))];
      if (next) scrollToId(next);
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      const prev = flat[Math.max(0, idx - 1)];
      if (prev) scrollToId(prev);
      e.preventDefault();
    } else if (e.key === "Home") {
      scrollToId(flat[0]);
      e.preventDefault();
    } else if (e.key === "End") {
      scrollToId(flat[flat.length - 1]);
      e.preventDefault();
    }
  }

  return (
    <>
      <aside
        className="hidden lg:block fixed left-0 top-0 z-40 h-screen w-64 border-r border-[var(--line)] bg-[var(--background)] px-4 pt-24"
        aria-label="Docs navigation"
      >
        <nav className="h-full overflow-y-auto">
          <div className="mb-4 text-sm font-semibold text-[var(--foreground)]">On this page</div>

          <ul className="space-y-2 text-sm text-[var(--muted)] outline-none" role="list" tabIndex={0} onKeyDown={onKeyDown}>
            {NAV.map((item) => {
              const isActiveParent = activeId === item.id;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => scrollToId(item.id)}
                    className={`w-full border px-3 py-2 text-left transition ${
                      isActiveParent
                        ? "border-[var(--accent)] bg-[var(--surface)] text-[var(--foreground)]"
                        : "border-transparent bg-transparent hover:border-[var(--line)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
                    }`}
                    aria-current={isActiveParent ? "true" : undefined}
                  >
                    {item.label}
                  </button>

                  {item.children && (
                    <ul className="mt-1 space-y-1">
                      {item.children.map((child) => {
                        const isActive = activeId === child.id;
                        return (
                          <li key={child.id}>
                            <button
                              onClick={() => scrollToId(child.id)}
                              className={`w-full border px-3 py-1 text-left text-sm transition ${
                                isActive
                                  ? "border-[var(--accent)] bg-[var(--surface-2)] text-[var(--foreground)]"
                                  : "border-transparent bg-transparent text-[var(--muted)] hover:border-[var(--line)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
                              }`}
                              style={{ paddingLeft: 24 }}
                              aria-current={isActive ? "true" : undefined}
                            >
                              {child.label}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <nav className="sticky top-14 z-40 border-b border-[var(--line)] bg-[var(--background)]/95 backdrop-blur-sm lg:hidden">
        <div className="overflow-x-auto px-4 py-3">
          <ul className="flex gap-3 whitespace-nowrap text-sm text-[var(--muted)]">
            {NAV.map((item) => {
              const isActiveParent = activeId === item.id;
              return (
                <li key={item.id} className="flex items-center">
                  <button
                    onClick={() => scrollToId(item.id)}
                    className={`inline-block border px-3 py-1 transition ${
                      isActiveParent
                        ? "border-[var(--accent)] bg-[var(--surface)] text-[var(--foreground)] font-medium"
                        : "border-transparent text-[var(--muted)] hover:border-[var(--line)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    {item.label}
                  </button>

                  {item.children &&
                    item.children.map((child) => {
                      const isActive = activeId === child.id;
                      return (
                        <button
                          key={child.id}
                          onClick={() => scrollToId(child.id)}
                          className={`ml-2 inline-block border px-2 py-1 text-xs transition ${
                            isActive
                              ? "border-[var(--accent)] bg-[var(--surface-2)] text-[var(--foreground)] font-medium"
                              : "border-transparent text-[var(--muted)] hover:border-[var(--line)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
                          }`}
                        >
                          {child.label}
                        </button>
                      );
                    })}
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
    </>
  );
}