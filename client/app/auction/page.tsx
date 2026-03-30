import { Suspense } from "react";
import AuctionClient from "./AuctionClient";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 20 }}>Loading...</div>}>
      <AuctionClient />
    </Suspense>
  );
}