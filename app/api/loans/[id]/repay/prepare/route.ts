import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { repayBorrow } from "@/lib/blend";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  await params;

  const body = await req.json().catch(() => null);
  const usdcAmount = body?.usdcAmount as number | undefined;
  if (!usdcAmount || usdcAmount <= 0) {
    return NextResponse.json({ error: "Missing or invalid 'usdcAmount'" }, { status: 400 });
  }

  try {
    const unsignedXdr = await repayBorrow(session.publicKey, usdcAmount);
    return NextResponse.json({ unsignedXdr });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to prepare repay transaction" },
      { status: 502 },
    );
  }
}
