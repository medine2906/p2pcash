import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { borrowAsset } from "@/lib/blend";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const usdcAmount = body?.usdcAmount as number | undefined;
  if (!usdcAmount || usdcAmount <= 0) {
    return NextResponse.json({ error: "Missing or invalid 'usdcAmount'" }, { status: 400 });
  }

  try {
    const unsignedXdr = await borrowAsset(session.publicKey, usdcAmount);
    return NextResponse.json({ unsignedXdr });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to prepare borrow transaction" },
      { status: 502 },
    );
  }
}
