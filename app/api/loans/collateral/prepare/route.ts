import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { depositCollateral } from "@/lib/blend";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const asset = body?.asset as string | undefined;
  const amount = body?.amount as number | undefined;
  if (!asset || !amount || amount <= 0) {
    return NextResponse.json({ error: "Missing or invalid 'asset' or 'amount'" }, { status: 400 });
  }

  try {
    const unsignedXdr = await depositCollateral(session.publicKey, asset, amount, body?.decimals ?? 7);
    return NextResponse.json({ unsignedXdr });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to prepare collateral transaction" },
      { status: 502 },
    );
  }
}
