import { NextRequest, NextResponse } from "next/server";
import { submitSep10Challenge } from "@/lib/anchor";
import { setSessionCookie } from "@/lib/session";
import { getSupabaseServiceClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const transaction = body?.transaction as string | undefined;
  const publicKey = body?.publicKey as string | undefined;

  if (!transaction || !publicKey) {
    return NextResponse.json({ error: "Missing 'transaction' or 'publicKey'" }, { status: 400 });
  }

  let jwt: string;
  try {
    ({ token: jwt } = await submitSep10Challenge(transaction));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to exchange SEP-10 challenge" },
      { status: 502 },
    );
  }

  await setSessionCookie({ jwt, publicKey });

  let profileSynced = true;
  try {
    const supabase = getSupabaseServiceClient();
    await supabase.from("profiles").upsert(
      { stellar_public_key: publicKey },
      { onConflict: "stellar_public_key" },
    );
  } catch {
    // Supabase may not be provisioned in every environment yet; the SEP-10
    // session is still valid without the off-chain profile cache.
    profileSynced = false;
  }

  return NextResponse.json({ success: true, publicKey, profileSynced });
}
