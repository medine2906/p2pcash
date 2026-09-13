import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { buildUsdcPaymentTransaction } from "@/lib/blend";
import { getErrorMessage } from "@/lib/errors";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const toAccount = body?.toAccount as string | undefined;
  const amount = body?.amount as number | undefined;
  const memoType = body?.memoType as "text" | "id" | "hash" | undefined;
  const memo = body?.memo as string | undefined;

  if (!toAccount || !amount || amount <= 0) {
    return NextResponse.json({ error: "Missing or invalid 'toAccount' or 'amount'" }, { status: 400 });
  }

  try {
    const unsignedXdr = await buildUsdcPaymentTransaction(session.publicKey, toAccount, amount, memoType, memo);
    return NextResponse.json({ unsignedXdr });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to prepare payout transaction") },
      { status: 502 },
    );
  }
}
