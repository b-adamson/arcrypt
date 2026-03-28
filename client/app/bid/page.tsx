import { Suspense } from "react";
import BidClient from "./BidClient";

export default function Page({
  searchParams,
}: {
  searchParams: { auctionPk?: string };
}) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <BidClient auctionPk={searchParams.auctionPk ?? null} />
    </Suspense>
  );
}