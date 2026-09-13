import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSep38Quote, startSep6Withdraw } from "@/lib/anchor";
import { getOrCreateProfileId } from "@/lib/profiles";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { TRY_SEP38_ASSET, usdcSep38Asset } from "@/lib/assets";
import { getErrorMessage } from "@/lib/errors";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const tryAmount = body?.tryAmount as number | undefined;
  const iban = body?.iban as string | undefined;
  const loanId = body?.loanId as string | undefined;
  if (!tryAmount || tryAmount <= 0 || !iban) {
    return NextResponse.json({ error: "Missing or invalid 'tryAmount' or 'iban'" }, { status: 400 });
  }

  try {
    const quote = await getSep38Quote({
      jwt: session.jwt,
      sellAsset: usdcSep38Asset(),
      buyAsset: TRY_SEP38_ASSET,
      buyAmount: String(tryAmount),
    });

    const withdraw = await startSep6Withdraw({
      jwt: session.jwt,
      account: session.publicKey,
      assetCode: "USDC",
      // Matches the deposit-side fix: this anchor reads `amount` as the
      // fiat (TRY) amount, not the on-chain USDC amount from the quote.
      amount: String(tryAmount),
      quoteId: quote.id,
      dest: iban,
    });

    const borrowerId = await getOrCreateProfileId(session.publicKey);
    const supabase = getSupabaseServiceClient();
    const { data: row, error } = await supabase
      .from("withdrawals")
      .insert({
        borrower_id: borrowerId,
        loan_id: loanId ?? null,
        try_amount: tryAmount,
        usdc_amount: Number(quote.sell_amount),
        iban,
        anchor_ref: withdraw.id,
        status: "pending",
      })
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({
      withdrawal: row,
      anchorDestination: { accountId: withdraw.account_id, memoType: withdraw.memo_type, memo: withdraw.memo },
      quote,
    });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to start withdrawal") },
      { status: 502 },
    );
  }
}
