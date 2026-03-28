'use client';
import { useEffect, useRef, useState } from "react";

export default function HomePage() {
  console.log(process.env.NEXT_PUBLIC_RPC_URL)
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const panelsRef = useRef<HTMLElement | null>(null);

  const fullText = "ARCIBID";
const [displayText, setDisplayText] = useState("");

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = 0.8; // slow it down
    }
  }, []);

  useEffect(() => {
  let i = 0;

  const interval = setInterval(() => {
    setDisplayText(fullText.slice(0, i + 1));
    i++;

    if (i === fullText.length) {
      clearInterval(interval);
    }
  }, 120); // speed (lower = faster)

  return () => clearInterval(interval);
}, []);

  function scrollToPanels(e?: React.MouseEvent) {
    e?.preventDefault();
    panelsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="bg-black text-white">
      <section className="relative min-h-[80vh] flex items-center overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none"
          style={{ opacity: 0.2, transform: "scale(1.02)" }}
        >
          <source src="/padlocks.mp4" type="video/mp4" />
        </video>

        {/* DARK OVERLAY (tunes brightness) */}
        <div
          aria-hidden
          className="absolute inset-0 z-10 pointer-events-none"
          style={{
            background: "linear-gradient(180deg, rgba(5,5,5,0.85), rgba(6,6,6,0.95))",
          }}
        />

        {/* SUBTLE RADIAL GRADIENT */}
        <div
          aria-hidden
          className="absolute inset-0 z-15 pointer-events-none"
          style={{
            background:
              "radial-gradient(1000px 500px at 70% 50%, rgba(96,71,255,0.06), transparent)",
          }}
        />

        {/* CONTENT (bring to front) */}
        <div className="relative z-20 max-w-7xl mx-auto w-full px-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 items-center">
            {/* LEFT: headline + copy */}
            <div className="md:col-span-7 lg:col-span-6">
              <div className="max-w-xl">
<h1
  className="text-5xl md:text-6xl lg:text-7xl font-extrabold leading-tight tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white/95 to-neutral-300"
  style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
>
  {displayText}
  <span className="animate-pulse">|</span>
</h1>

                <p className="mt-6 text-lg md:text-xl text-gray-400">
                  Private, sealed-bid auctions powered by
                  Arcium on Solana. Selling DAO treasuries, NFTs and more with full encryption.
                </p>

                <div className="mt-8 flex flex-col sm:flex-row gap-3 sm:items-center">
                  <a
                    href="/docs"
                    className="inline-flex items-center justify-center rounded-none bg-gradient-to-r from-[#ff2bd3] via-[#c14bff] to-[#4ec7ff] px-6 py-3 text-sm font-semibold text-black shadow-lg hover:opacity-95 transition"
                  >
                    Read docs
                  </a>

                  {/* Scroll trigger: stays a link for semantics but uses JS to smooth-scroll */}
                  <a
                    href="#get-started"
                    onClick={scrollToPanels}
                    className="inline-flex items-center justify-center rounded-none border border-white/10 px-6 py-3 text-sm text-gray-200 hover:border-white/20 transition cursor-pointer"
                  >
                    Get started
                  </a>
                </div>

                <ul className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-400">
                  <li>🔐 State of the art MPC technology</li>
                  <li>⚡ Fast on-chain settlements</li>
                  <li>📈 No MEV, no sandwiching, best price discovery</li>
                  <li>🧩 Deployed on Solana devnet</li>
                </ul>

                <div className="mt-8 flex gap-8 items-center text-xs text-gray-500">
                  <div>
                    <div className="text-sm font-medium text-gray-200">Protocol beta</div>
                    <div>100+ test auctions</div>
                  </div>
                  <div className="border-l border-white/5 h-6" />
                  <div>
                    <div className="text-sm font-medium text-gray-200">Security</div>
                    <div>Audited primitives</div>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT: logo / visual */}
            <div className="md:col-span-5 lg:col-span-6 flex justify-center md:justify-end">
              <div
                className="relative rounded-none p-8 w-[320px] md:w-[420px] lg:w-[520px] flex items-center justify-center"
                style={{
                  background: "linear-gradient(180deg, rgba(0,0,0,0.62), rgba(0,0,0,0.72))",
                  boxShadow:
                    "0 10px 30px rgba(8,6,24,0.75), inset 0 1px 0 rgba(255,255,255,0.02), 0 20px 80px rgba(78,199,255,0.12), 0 10px 40px rgba(255,43,211,0.08)",
                  border: "1px solid rgba(255,255,255,0.04)",
                  backdropFilter: "saturate(1.05) blur(6px)",
                }}
              >
                <div
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    borderRadius: 0,
                    background:
                      "radial-gradient(300px 140px at 30% 35%, rgba(255,43,211,0.16), transparent 25%), radial-gradient(260px 120px at 80% 65%, rgba(78,199,255,0.14), transparent 25%)",
                    filter: "blur(36px)",
                    zIndex: 0,
                    mixBlendMode: "screen",
                  }}
                />

                <div
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    zIndex: 1,
                    background: "linear-gradient(180deg, rgba(0,0,0,0.18), rgba(0,0,0,0.28))",
                    borderRadius: 0,
                  }}
                />

                <img
                  src="/logo/SQUARE_TRANSPARENT.svg"
                  alt="ARCIBID logo"
                  className="relative z-10 w-56 md:w-72 lg:w-80 h-auto drop-shadow-[0_20px_40px_rgba(16,10,40,0.6)] saturate-90 contrast-95"
                  style={{ filter: "brightness(1.05) saturate(2) contrast(1)" }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* prefers-reduced-motion: hide / pause animated background for accessibility */}
        <style jsx>{`
          @media (prefers-reduced-motion: reduce) {
            .absolute[aria-hidden] {
              background-image: none !important;
              animation: none !important;
            }
          }
        `}</style>
      </section>

      {/* ---------- NEW: Pink Panels Section (UI-only) ---------- */}
      <section
        id="get-started"
        ref={panelsRef}
        className="py-20 bg-gradient-to-b from-[#1a021a] to-[#120014]"
        aria-label="Get started panels"
      >
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl font-bold mb-8 text-pink-300">Get started — pick an option</h2>

          <div className="w-full overflow-x-auto">
            <div className="min-w-full grid grid-cols-1 md:grid-cols-3 gap-6">
      
<article className="rounded-lg p-8 min-h-[280px] flex flex-col justify-between bg-gradient-to-br from-pink-900/60 to-pink-800/40 border border-pink-500/10">
  <div>
    <div className="text-sm font-medium text-pink-50/90 uppercase tracking-wide">
      Create Sealed Auction
    </div>
    <h3 className="mt-4 text-2xl font-extrabold tracking-tight text-pink-50">
      Make a sealed auction and share the link
    </h3>

    <p className="mt-4 text-sm text-pink-100/75">
      Launch your item on the public arcibid marketplace, or get a private but shareable link.
    </p>

    <div className="mt-4 p-3 rounded-md bg-black/30 text-xs text-pink-50/80">
      <div className="font-medium">Example shareable link (mock):</div>
      <div className="mt-1 break-all text-sm">https://arcibid.app/auctions/SEAL1234</div>
    </div>
  </div>

  <div className="mt-6 text-xs text-pink-200/80">
    <div className="italic">No creation will occur from this panel — UI preview only.</div>
  </div>
</article>
   

           <article className="rounded-lg p-8 min-h-[280px] flex flex-col justify-between bg-gradient-to-br from-[#ff2bd3]/20 via-[#c14bff]/10 to-[#4ec7ff]/08 border border-white/5">
  <div>
    <div className="text-sm font-medium text-white/90 uppercase tracking-wide">
      DAO / Realms integration
    </div>
    <h3 className="mt-4 text-2xl font-extrabold tracking-tight text-white">
      Prepare a governance proposal payload
    </h3>

    <p className="mt-4 text-sm text-gray-200/80">
      Generate a sealed-auction instruction bundle that can be inserted into Realms or another DAO
      governance flow. This panel is a preview only — no on-chain action is taken here.
    </p>

    <pre
      className="mt-4 p-4 rounded-md bg-black/40 text-xs text-pink-100 overflow-auto"
      aria-hidden="true"
    >
{`Generate serialized instruction bytes

AAECAwQFBgcICQ==

Or connect directly with Realms SPL
`}
    </pre>
  </div>

  <div className="mt-6 text-xs text-gray-300/70">
    <div className="italic">
      Preview only — the real payload can be wired into Realms or your DAO workflow.
    </div>
  </div>
</article>
<article className="rounded-lg p-8 min-h-[280px] flex flex-col justify-between bg-gradient-to-br from-[#4ec7ff]/12 via-[#c14bff]/10 to-[#ff2bd3]/12 border border-white/5">
  <div>
    <div className="text-sm font-medium text-white/90 uppercase tracking-wide">
      Build with our SDK
    </div>
    <h3 className="mt-4 text-2xl font-extrabold tracking-tight text-white">
      Use encrypted auctions in your app
    </h3>

    <p className="mt-4 text-sm text-gray-200/80">
      Integrate ARCIBID SDKs to add sealed-bid auctions to lending protocols, DAO launchpads,
      marketplaces, and more.
    </p>

    <div className="mt-4 p-4 rounded-md bg-black/40 border border-white/5 text-xs text-pink-100 overflow-auto">
      <div className="font-medium text-white/90 mb-2">Install example</div>
      <pre className="whitespace-pre-wrap break-words">
{`npm install @arcibid/sdk

# or

cargo install arcibid-sdk`}
      </pre>
    </div>
  </div>

  <div className="mt-6 text-xs text-gray-300/70">
    <div className="italic">
      Example use cases: lending protocols, DAO launchpads, treasury tooling, and auction-based
      DeFi apps.
    </div>
  </div>
</article>

<article
  className="rounded-lg p-8 min-h-[280px] flex flex-col justify-between bg-pink-600/10 border border-pink-500/20"
  aria-hidden="true"
>
  <div>
    <div className="text-sm font-medium text-pink-100/90 uppercase tracking-wide">
      Create Sealed Auction DAO
    </div>
    <h3 className="mt-4 text-2xl font-extrabold tracking-tight text-pink-50">
      (Coming Soon)
    </h3>

    <p className="mt-4 text-sm text-pink-100/70">
      Launch a DAO that tokenizes part of the treasury token pool for auction. Raise capital for your startup using sealed bids.
    </p>
  </div>

  <div className="mt-6 text-xs text-pink-200/80">
    <div className="italic">Status: UI only — no live functionality.</div>
  </div>
</article>


            </div>
          </div>

          {/* Optional: smaller explanatory row */}
          <div className="mt-10 text-sm text-pink-200/60 max-w-3xl">
            <strong>Notes:</strong> these panels are intentionally non-functional placeholders so you can
            iterate on copy, layout, and visual language. When you’re ready we can wire them up to
            wallet flows, DAO instructions, and backend endpoints.
          </div>
        </div>
      </section>
    </main>
  );
}