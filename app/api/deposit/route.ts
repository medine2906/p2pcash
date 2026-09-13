import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSep38Quote, startSep6Deposit } from "@/lib/anchor";
import { getOrCreateProfileId } from "@/lib/profiles";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { TRY_SEP38_ASSET, usdcSep38Asset } from "@/lib/assets";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const tryAmount = body?.tryAmount as number | undefined;
  if (!tryAmount || tryAmount <= 0) {
    return NextResponse.json({ error: "Missing or invalid 'tryAmount'" }, { status: 400 });
  }

  try {
    const quote = await getSep38Quote({
      jwt: session.jwt,
      sellAsset: TRY_SEP38_ASSET,
      buyAsset: usdcSep38Asset(),
      sellAmount: String(tryAmount),
    });

    const deposit = await startSep6Deposit({
      jwt: session.jwt,
      account: session.publicKey,
      assetCode: "USDC",
      amount: quote.buy_amount,
      quoteId: quote.id,
    });

    const lenderId = await getOrCreateProfileId(session.publicKey);
    const supabase = getSupabaseServiceClient();
    const { data: row, error } = await supabase
      .from("deposits")
      .insert({
        lender_id: lenderId,
        try_amount: tryAmount,
        usdc_amount: Number(quote.buy_amount),
        anchor_ref: deposit.id,
        status: "pending",
      })
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ deposit: row, instructions: deposit.instructions, quote });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start deposit" },
      { status: 502 },
    );
  }
}
