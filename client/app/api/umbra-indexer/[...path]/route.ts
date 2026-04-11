// app/api/umbra-indexer/[...path]/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const UPSTREAM = "https://utxo-indexer.api-devnet.umbraprivacy.com";

function copyHeaders(upstream: Response) {
  const headers = new Headers();
  const keep = ["content-type", "cache-control", "etag", "last-modified"];
  for (const key of keep) {
    const value = upstream.headers.get(key);
    if (value) headers.set(key, value);
  }
  headers.set("access-control-allow-origin", "*");
  return headers;
}

async function proxy(
  request: NextRequest,
  ctx: { params: Promise<{ path?: string[] }> }
) {
  const { path } = await ctx.params;
  const pathParts = path ?? [];

  console.log("pathParts:", pathParts);

  const upstreamUrl = new URL(UPSTREAM);
  upstreamUrl.pathname = `/${pathParts.join("/")}`;
  upstreamUrl.search = request.nextUrl.search;

  console.log("Proxying to:", upstreamUrl.toString());

  const hasBody = !["GET", "HEAD"].includes(request.method);

  const upstream = await fetch(upstreamUrl.toString(), {
    method: request.method,
    headers: {
      accept: request.headers.get("accept") ?? "application/json",
      "content-type": request.headers.get("content-type") ?? "application/json",
    },
    body: hasBody ? await request.arrayBuffer() : undefined,
    cache: "no-store",
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: copyHeaders(upstream),
  });
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ path?: string[] }> }
) {
  return proxy(request, ctx);
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ path?: string[] }> }
) {
  return proxy(request, ctx);
}

export async function PUT(
  request: NextRequest,
  ctx: { params: Promise<{ path?: string[] }> }
) {
  return proxy(request, ctx);
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ path?: string[] }> }
) {
  return proxy(request, ctx);
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ path?: string[] }> }
) {
  return proxy(request, ctx);
}

export async function OPTIONS(
  request: NextRequest,
  ctx: { params: Promise<{ path?: string[] }> }
) {
  return proxy(request, ctx);
}