import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_GATEWAY =
  (process.env.PINATA_GATEWAY_URL || "https://gateway.pinata.cloud/ipfs").replace(/\/$/, "");

function asMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    try {
      return JSON.stringify(err);
    } catch {
      return "Unknown object error";
    }
  }
  return String(err);
}

function cidFromPinataResponse(json: any): string {
  return json?.IpfsHash ?? json?.ipfsHash ?? json?.cid ?? json?.Hash ?? "";
}

function ipfsUri(cid: string) {
  return `${PINATA_GATEWAY}/${cid}`;
}

async function pinFileToPinata(file: Blob, filename: string): Promise<{ cid: string; uri: string }> {
  if (!PINATA_JWT) {
    throw new Error("PINATA_JWT is not configured.");
  }

  const formData = new FormData();
  formData.append("file", file, filename);

  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PINATA_JWT}`,
    },
    body: formData,
  });

  const text = await res.text();
  let json: any = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    throw new Error(asMessage(json?.error ?? json?.message ?? text ?? "Pinata upload failed."));
  }

  const cid = cidFromPinataResponse(json);
  if (!cid) {
    throw new Error("Pinata did not return an IPFS hash.");
  }

  return {
    cid,
    uri: ipfsUri(cid),
  };
}

async function pinJsonToPinata(payload: unknown): Promise<{ cid: string; uri: string }> {
  if (!PINATA_JWT) {
    throw new Error("PINATA_JWT is not configured.");
  }

  const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PINATA_JWT}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pinataContent: payload,
      pinataMetadata: {
        name: "auction-metadata.json",
      },
    }),
  });

  const text = await res.text();
  let json: any = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    throw new Error(asMessage(json?.error ?? json?.message ?? text ?? "Pinata JSON upload failed."));
  }

  const cid = cidFromPinataResponse(json);
  if (!cid) {
    throw new Error("Pinata did not return an IPFS hash for metadata JSON.");
  }

  return { cid, uri: ipfsUri(cid) };
}

export async function POST(req: NextRequest) {
  try {
    if (!PINATA_JWT) {
      return NextResponse.json({ error: "PINATA_JWT is not configured." }, { status: 500 });
    }

    const form = await req.formData();

    const name = String(form.get("name") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const image = form.get("image");

    if (!name) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }

    let uploadedImage: { cid: string; uri: string } | null = null;

    if (image instanceof File && image.size > 0) {
      uploadedImage = await pinFileToPinata(image, image.name || "auction-image");
    }

    const metadata = {
      name,
      description,
      ...(uploadedImage?.uri ? { image: uploadedImage.uri } : {}),
    };

    const uploadedMetadata = await pinJsonToPinata(metadata);

    return NextResponse.json({
      imageCid: uploadedImage?.cid ?? null,
      imageUri: uploadedImage?.uri ?? null,
      metadataCid: uploadedMetadata.cid,
      metadataUri: uploadedMetadata.uri,
      metadata,
      gatewayBase: PINATA_GATEWAY,
    });
  } catch (err: any) {
    console.error("pin-metadata route failed:", err);
    return NextResponse.json(
      { error: err?.message ?? asMessage(err) ?? "Failed to pin metadata." },
      { status: 500 }
    );
  }
}