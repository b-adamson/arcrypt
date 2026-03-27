'use client';

import { useEffect, useRef, useState } from 'react';

type NavItem = { id: string; label: string; children?: NavItem[] };

const NAV: NavItem[] = [
  {
    id: 'intro',
    label: 'Intro to ARCIBID',
    children: [
      { id: 'what-is-arcibid', label: 'What is ARCIBID' },
      { id: 'mission', label: 'The Mission' },
    ],
  },
  { id: 'arcium', label: 'What is Arcium' },
  {
    id: 'rules',
    label: 'How it works',
    children: [
      { id: 'seller-flow', label: 'Seller flow' },
      { id: 'auction-types', label: 'Auction types' },
      { id: 'bidding-escrow', label: 'Bidding & escrow' },
      { id: 'settlement', label: 'Settlement' },
    ],
  },
  { id: 'dao-proposal', label: 'Create a DAO proposal' },
  { id: 'arcibid-dao', label: 'Create an ARCIBID DAO' },
  {
    id: 'developers',
    label: 'Developers',
    children: [
      { id: 'dev-ts', label: 'Typescript SDK' },
      { id: 'dev-rust', label: 'Rust SDK' },
    ],
  },
  { id: 'faq', label: 'FAQ' },
];

export default function DocsSidebar() {
  const [activeId, setActiveId] = useState<string>('what-is-arcibid');
  const ticking = useRef(false);
  const sectionsRef = useRef<HTMLElement[]>([]);
  const offsetRef = useRef<number>(96); // default offset (will be computed)
  const flatIdsRef = useRef<string[]>([]);

  // helper to flatten NAV into ordered ids (parent then children)
  function flattenNav(nav: NavItem[]) {
    const out: string[] = [];
    for (const item of nav) {
      out.push(item.id);
      if (item.children) {
        for (const c of item.children) out.push(c.id);
      }
    }
    return out;
  }

  // compute sections and header offset once
  useEffect(() => {
    flatIdsRef.current = flattenNav(NAV);

    sectionsRef.current = flatIdsRef.current
      .map((id) => document.getElementById(id))
      .filter(Boolean) as HTMLElement[];

    // compute offset from any fixed header/banner if present
    const headerEl = document.querySelector('header');
    const headerHeight = headerEl ? headerEl.getBoundingClientRect().height : 0;
    // extra gap for sticky top spacing
    offsetRef.current = Math.max(64, Math.round(headerHeight + 24));
  }, []);

  // scroll handler using rAF: choose the section whose top is <= offset and closest to offset,
  // or if none above offset, choose the first section below the offset.
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
          const pick =
            (bestDist > 0 && distance <= 0) ||
            Math.abs(distance) < Math.abs(bestDist);

          if (pick) best = { id: el.id, distance };
        }

        if (best && best.id !== activeId) {
          setActiveId(best.id);
        }

        ticking.current = false;
      });
    }

    // initial call to set active
    onScroll();

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [activeId]);

  // programmatic smooth scroll that accounts for offset
  function scrollToId(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const offset = offsetRef.current;
    const targetY = window.scrollY + rect.top - offset;
    window.scrollTo({ top: Math.max(0, Math.round(targetY)), behavior: 'smooth' });
    setActiveId(id);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLUListElement>) {
    const flat = flatIdsRef.current;
    const idx = flat.findIndex((i) => i === activeId);
    if (e.key === 'ArrowDown') {
      const next = flat[Math.min(flat.length - 1, Math.max(0, idx + 1))];
      if (next) scrollToId(next);
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      const prev = flat[Math.max(0, idx - 1)];
      if (prev) scrollToId(prev);
      e.preventDefault();
    } else if (e.key === 'Home') {
      scrollToId(flat[0]);
      e.preventDefault();
    } else if (e.key === 'End') {
      scrollToId(flat[flat.length - 1]);
      e.preventDefault();
    }
  }

  return (
    <>
      {/* Desktop: sticky left rail */}
      <aside className="hidden lg:block w-64 shrink-0 px-4" aria-label="Docs navigation">
        <nav className="sticky top-24">
          <div className="mb-4 text-sm font-semibold text-gray-300">On this page</div>

          <ul
            className="space-y-2 text-sm text-gray-400 outline-none"
            role="list"
            tabIndex={0}
            onKeyDown={onKeyDown}
          >
            {NAV.map((item) => {
              const isActiveParent = activeId === item.id;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => scrollToId(item.id)}
                    className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                      isActiveParent
                        ? 'font-medium text-white bg-gradient-to-r from-[#ff2bd3]/20 to-[#4ec7ff]/10'
                        : 'hover:text-white hover:bg-white/2'
                    }`}
                    aria-current={isActiveParent ? 'true' : undefined}
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
                              className={`w-full text-left px-3 py-1 rounded-md text-sm transition ${
                                isActive
                                  ? 'font-medium text-white bg-white/6'
                                  : 'text-gray-300 hover:text-white hover:bg-white/2'
                              }`}
                              style={{ paddingLeft: 24 }}
                              aria-current={isActive ? 'true' : undefined}
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

      {/* Mobile: horizontal anchor bar */}
      <nav className="lg:hidden sticky top-14 z-40 bg-neutral-950/80 backdrop-blur-sm border-b border-white/5">
        <div className="overflow-x-auto px-4 py-3">
          <ul className="flex gap-3 text-sm text-gray-300 whitespace-nowrap">
            {NAV.map((item) => {
              const isActiveParent = activeId === item.id;
              return (
                <li key={item.id} className="flex items-center">
                  <button
                    onClick={() => scrollToId(item.id)}
                    className={`inline-block px-3 py-1 rounded-md transition ${
                      isActiveParent ? 'bg-white/8 text-white font-medium' : 'hover:bg-white/4'
                    }`}
                  >
                    {item.label}
                  </button>

                  {/* children rendered as smaller pill buttons for mobile */}
                  {item.children &&
                    item.children.map((child) => {
                      const isActive = activeId === child.id;
                      return (
                        <button
                          key={child.id}
                          onClick={() => scrollToId(child.id)}
                          className={`ml-2 inline-block px-2 py-1 rounded-md text-xs transition ${
                            isActive ? 'bg-white/8 text-white font-medium' : 'hover:bg-white/4 text-gray-300'
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