/**
 * /api/zk-proxy — Server-side proxy for Umbra ZK circuit assets.
 *
 * The ZK prover needs to fetch .zkey and .wasm files from the Umbra CDN.
 * The CDN does not send CORS headers, so browser fetches are blocked.
 * This route proxies the request server-side (no CORS restriction) and
 * streams the response back to the browser.
 *
 * Only URLs from the known Umbra CDN are allowed (allowlist check).
 */

import { type NextRequest, NextResponse } from "next/server";

const ALLOWED_CDN_ORIGIN = "https://d3j9fjdkre529f.cloudfront.net";

export async function GET(request: NextRequest): Promise<Response> {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  if (!url.startsWith(ALLOWED_CDN_ORIGIN)) {
    return NextResponse.json({ error: "URL not in allowlist" }, { status: 403 });
  }

  let upstream: globalThis.Response;
  try {
    upstream = await fetch(url);
  } catch {
    return NextResponse.json({ error: "CDN unreachable" }, { status: 502 });
  }

  if (!upstream.ok) {
    return new NextResponse(null, { status: upstream.status });
  }

  const contentType =
    upstream.headers.get("content-type") ?? "application/octet-stream";
  const contentLength = upstream.headers.get("content-length");

  const headers: Record<string, string> = {
    "Content-Type": contentType,
    // Cache aggressively — these files are versioned and immutable
    "Cache-Control": "public, max-age=604800, immutable",
  };
  if (contentLength) headers["Content-Length"] = contentLength;

  // Stream the body directly — avoids buffering 50-100 MB files in memory
  return new Response(upstream.body, { headers });
}