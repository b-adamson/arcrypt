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
<main className="relative isolate min-h-[100svh] bg-black overflow-hidden">
  <div id="home-sentinel" className="absolute top-0 left-0 h-px w-px" />
      
<section className="relative isolate h-[100svh] w-full overflow-hidden bg-black flex items-center justify-center">
  <video
    autoPlay
    muted
    loop
    playsInline
    className="absolute inset-0 h-full w-full object-cover z-0 pointer-events-none"
    style={{ opacity: 0.2, transform: "scale(1.02)" }}
  >
    <source src="/backdrop.mp4" type="video/mp4" />
  </video>
    <div className="absolute inset-0 z-10 bg-black/10" />

  {/* <div className="relative z-20 max-w-4xl mx-auto px-6 text-center"></div> */}

        <div className="relative z-20 max-w-4xl mx-auto px-6 text-center flex flex-col items-center">
          <h1
            className="text-6xl md:text-8xl lg:text-9xl font-extrabold leading-tight tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-neutral-400"
            style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
          >
            {displayText}
            <span className="animate-pulse">|</span>
          </h1>

          <p className="mt-6 text-lg md:text-xl text-gray-400 max-w-2xl">
            Private, sealed-bid auctions powered by Arcium on Solana. Selling DAO treasuries, NFTs and more with full encryption.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
<a
  href="/docs"
  className="inline-flex items-center justify-center border border-white/10 px-6 py-3 text-sm text-gray-200 hover:border-white/20 transition"
>
  Read docs
</a>

<a
  href="#get-started"
  onClick={scrollToPanels}
  className="inline-flex items-center justify-center bg-gradient-to-r from-[#ff2bd3] via-[#c14bff] to-[#4ec7ff] px-6 py-3 text-sm font-semibold text-black shadow-lg hover:opacity-95 transition cursor-pointer"
>
  Get started
</a>
          </div>

<p className="mt-8 text-sm text-gray-400 text-center">
  🧩 Deployed on Solana devnet
</p>
        </div>
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
      
<article className="rounded-none border border-white/10 bg-[#0b0b12] p-8 shadow-none transition hover:border-white/20 hover:bg-[#10101a]">
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
   

       <article className="rounded-none border border-white/10 bg-[#0b0b12] p-8 shadow-none transition hover:border-white/20 hover:bg-[#10101a]">

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
<article className="rounded-none border border-white/10 bg-[#0b0b12] p-8 shadow-none transition hover:border-white/20 hover:bg-[#10101a]">

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

<article className="rounded-none border border-white/10 bg-[#0b0b12] p-8 shadow-none transition hover:border-white/20 hover:bg-[#10101a]">

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