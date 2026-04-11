// app/api/umbra/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const ALLOWED_HOSTS = new Set([
  "d3j9fjdkre529f.cloudfront.net",
]);

function buildError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get("url");

  if (!target) {
    return buildError("Missing url query parameter.");
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(target);
  } catch {
    return buildError("Invalid url.");
  }

  if (targetUrl.protocol !== "https:" || !ALLOWED_HOSTS.has(targetUrl.hostname)) {
    return buildError("Blocked url.", 403);
  }

  const upstream = await fetch(targetUrl.toString(), {
    method: "GET",
    headers: {
      // Keep this simple; the asset host does not need your browser headers.
      Accept: "*/*",
    },
    cache: "no-store",
  });

  const headers = new Headers();
  const copyHeaders = [
    "content-type",
    "content-length",
    "cache-control",
    "etag",
    "last-modified",
    "content-disposition",
  ];

  for (const key of copyHeaders) {
    const value = upstream.headers.get(key);
    if (value) headers.set(key, value);
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  });
}