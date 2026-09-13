"use client";

import { useEffect, useRef, useState } from "react";

interface WithdrawResult {
  withdrawal: { id: string; status: string; try_amount: number; usdc_amount: number };
  anchorDestination: { accountId: string; memoType?: string; memo?: string };
}

const TERMINAL_STATUSES = new Set(["completed", "failed"]);

export function WithdrawFlow() {
  const [tryAmount, setTryAmount] = useState("500");
  const [iban, setIban] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WithdrawResult | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function startWithdraw() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tryAmount: Number(tryAmount), iban }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Withdrawal failed");

      setResult(data);
      setStatus(data.withdrawal.status);

      pollRef.current = setInterval(async () => {
        const pollRes = await fetch(`/api/withdraw/${data.withdrawal.id}/status`);
        const pollData = await pollRes.json();
        if (pollRes.ok) {
          setStatus(pollData.withdrawal.status);
          if (TERMINAL_STATUSES.has(pollData.withdrawal.status) && pollRef.current) {
            clearInterval(pollRef.current);
          }
        }
      }, 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Withdrawal failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-semibold">Get Cash Advance</h2>
      <label className="flex flex-col gap-1 text-sm text-zinc-600">
        Amount (TRY)
        <input
          type="number"
          min={1}
          value={tryAmount}
          onChange={(e) => setTryAmount(e.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-base"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-zinc-600">
        Bank IBAN
        <input
          type="text"
          value={iban}
          onChange={(e) => setIban(e.target.value)}
          placeholder="TR..."
          className="rounded-lg border border-zinc-300 px-3 py-2 text-base"
        />
      </label>
      <button
        onClick={() => void startWithdraw()}
        disabled={loading || !iban}
        className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {loading ? "Starting..." : "Get Cash Advance"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && (
        <div className="flex flex-col gap-2 rounded-xl bg-zinc-50 p-4 text-sm">
          <p className="font-medium">Status: {status}</p>
          <p className="text-zinc-500">
            USDC sent to {result.anchorDestination.accountId}
            {result.anchorDestination.memo ? ` (memo: ${result.anchorDestination.memo})` : ""}
          </p>
        </div>
      )}
    </div>
  );
}
