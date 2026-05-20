import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

function makeReferralCode(length = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export async function POST(req: Request) {
  try {
    const origin = new URL(req.url).origin;

    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const referredByCode = body.referredByCode ? String(body.referredByCode).trim() : null;

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const existing = await sql`
      select id, email, referral_code, referral_count, tier
      from waitlist_signups
      where email = ${email}
      limit 1
    `;

    if (existing.length > 0) {
      return NextResponse.json(
        { ok: true, alreadyJoined: true, signup: existing[0] },
        { status: 200 }
      );
    }

    let referralCode = makeReferralCode();

    while (true) {
      const match = await sql`
        select id from waitlist_signups where referral_code = ${referralCode} limit 1
      `;
      if (match.length === 0) break;
      referralCode = makeReferralCode();
    }

    await sql`
      insert into waitlist_signups (
        email,
        referral_code,
        referred_by_code,
        referral_count,
        tier
      )
      values (
        ${email},
        ${referralCode},
        ${referredByCode},
        0,
        'standard'
      )
    `;

    return NextResponse.json({
      ok: true,
      referralCode,
      referralLink: `${origin}/?ref=${referralCode}`,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}