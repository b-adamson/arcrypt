import { Suspense } from "react";
import CollectionClient from "./CollectionClient";

export default function CollectionPage({
  params,
}: {
  params: { collectionMint: string };
}) {
  return (
    <Suspense
      fallback={
        <main className="page-shell min-h-screen px-4 py-6">
          <div className="mx-auto max-w-[1600px]">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-[420px] animate-pulse border border-[var(--line)] bg-[var(--surface)]" />
              ))}
            </div>
          </div>
        </main>
      }
    >
      <CollectionClient collectionMint={decodeURIComponent(params.collectionMint)} />
    </Suspense>
  );
}
