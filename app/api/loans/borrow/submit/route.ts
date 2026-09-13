import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { submitSignedTransaction } from "@/lib/blend";
import { startSep6Withdraw } from "@/lib/anchor";
import { getOrCreateProfileId } from "@/lib/profiles";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { getErrorMessage } from "@/lib/errors";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const signedXdr = body?.signedXdr as string | undefined;
  const collateralAsset = body?.collateralAsset as string | undefined;
  const collateralAmount = body?.collateralAmount as number | undefined;
  const usdcAmount = body?.usdcAmount as number | undefined;
  const tryAmount = body?.tryAmount as number | undefined;
  const iban = body?.iban as string | undefined;

  if (!signedXdr || !collateralAsset || !collateralAmount || !usdcAmount || !tryAmount || !iban) {
    return NextResponse.json(
      { error: "Missing 'signedXdr', 'collateralAsset', 'collateralAmount', 'usdcAmount', 'tryAmount', or 'iban'" },
      { status: 400 },
    );
  }

  try {
    await submitSignedTransaction(signedXdr);

    const borrowerId = await getOrCreateProfileId(session.publicKey);
    const supabase = getSupabaseServiceClient();

    const { data: loan, error: loanError } = await supabase
      .from("loans")
      .insert({
        borrower_id: borrowerId,
        collateral_asset: collateralAsset,
        collateral_amount: collateralAmount,
        borrowed_usdc_amount: usdcAmount,
        try_amount: tryAmount,
        status: "active",
      })
      .select()
      .single();
    if (loanError) throw loanError;

    const withdraw = await startSep6Withdraw({
      jwt: session.jwt,
      account: session.publicKey,
      assetCode: "USDC",
      // Matches the deposit-side fix: this anchor reads `amount` as the
      // fiat (TRY) amount, not the on-chain USDC amount.
      amount: String(tryAmount),
      dest: iban,
    });

    const { data: withdrawal, error: withdrawError } = await supabase
      .from("withdrawals")
      .insert({
        borrower_id: borrowerId,
        loan_id: loan.id,
        try_amount: tryAmount,
        usdc_amount: usdcAmount,
        iban,
        anchor_ref: withdraw.id,
        status: "pending",
      })
      .select()
      .single();
    if (withdrawError) throw withdrawError;

    return NextResponse.json({
      loan,
      withdrawal,
      anchorDestination: { accountId: withdraw.account_id, memoType: withdraw.memo_type, memo: withdraw.memo },
    });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to finalize loan") },
      { status: 502 },
    );
  }
}
