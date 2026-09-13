import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { borrowAsset, RestoreRequiredError } from "@/lib/blend";
import { getErrorMessage } from "@/lib/errors";

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
    if (err instanceof RestoreRequiredError) {
      return NextResponse.json({ needsRestore: true, restoreXdr: err.restoreXdr });
    }
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to prepare borrow transaction") },
      { status: 502 },
    );
  }
}
