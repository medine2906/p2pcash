import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { submitSignedTransaction } from "@/lib/blend";
import { getErrorMessage } from "@/lib/errors";

/** Submits a signed `restoreFootprint` transaction for expired ledger entries. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const signedXdr = body?.signedXdr as string | undefined;
  if (!signedXdr) {
    return NextResponse.json({ error: "Missing 'signedXdr'" }, { status: 400 });
  }

  try {
    const { hash } = await submitSignedTransaction(signedXdr);
    return NextResponse.json({ hash });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to submit restore transaction") },
      { status: 502 },
    );
  }
}
