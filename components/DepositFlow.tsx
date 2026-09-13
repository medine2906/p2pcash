"use client";

import { useEffect, useRef, useState } from "react";

interface InstructionField {
  value: string;
  description: string;
}

interface DepositResult {
  deposit: { id: string; status: string; try_amount: number; usdc_amount: number | null };
  instructions?: Record<string, InstructionField>;
}

const TERMINAL_STATUSES = new Set(["completed", "failed"]);

export function DepositFlow() {
  const [tryAmount, setTryAmount] = useState("500");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DepositResult | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function startDeposit() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tryAmount: Number(tryAmount) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Deposit failed");

      setResult(data);
      setStatus(data.deposit.status);

      pollRef.current = setInterval(async () => {
        const pollRes = await fetch(`/api/deposit/${data.deposit.id}/status`);
        const pollData = await pollRes.json();
        if (pollRes.ok) {
          setStatus(pollData.deposit.status);
          if (TERMINAL_STATUSES.has(pollData.deposit.status) && pollRef.current) {
            clearInterval(pollRef.current);
          }
        }
      }, 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deposit failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-semibold">Add Funds</h2>
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
      <button
        onClick={() => void startDeposit()}
        disabled={loading}
        className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {loading ? "Starting..." : "Add Funds"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && (
        <div className="flex flex-col gap-2 rounded-xl bg-zinc-50 p-4 text-sm">
          <p className="font-medium">Status: {status}</p>
          {result.instructions &&
            Object.entries(result.instructions).map(([key, field]) => (
              <p key={key}>
                <span className="text-zinc-500">{field.description}: </span>
                <span className="font-mono">{field.value}</span>
              </p>
            ))}
        </div>
      )}
    </div>
  );
}
