import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { submitSignedTransaction } from "@/lib/blend";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { getErrorMessage } from "@/lib/errors";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const signedXdr = body?.signedXdr as string | undefined;
  const fullyRepaid = Boolean(body?.fullyRepaid);
  if (!signedXdr) {
    return NextResponse.json({ error: "Missing 'signedXdr'" }, { status: 400 });
  }

  try {
    const { hash } = await submitSignedTransaction(signedXdr);

    const supabase = getSupabaseServiceClient();
    const { data: loan, error } = await supabase
      .from("loans")
      .update({ status: fullyRepaid ? "repaid" : "active" })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ hash, loan });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "Failed to submit repayment") },
      { status: 502 },
    );
  }
}
