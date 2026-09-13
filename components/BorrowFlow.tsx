"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@/lib/wallet-context";
import { StatusTimeline, type TimelineStep } from "./StatusTimeline";

const STEPS: TimelineStep[] = [
  { key: "trustline", label: "Prepare to receive USDC" },
  { key: "collateral", label: "Lock crypto collateral" },
  { key: "borrow", label: "Borrow against it" },
  { key: "transfer", label: "Send TRY to your bank" },
  { key: "done", label: "Cash in your account" },
];

const TERMINAL_STATUSES = new Set(["completed", "failed"]);

interface StepState {
  index: number;
  failed: boolean;
  message: string | null;
}

export function BorrowFlow() {
  const { publicKey, authenticated, signTransaction } = useWallet();
  const [collateralAsset, setCollateralAsset] = useState("");
  const [collateralAmount, setCollateralAmount] = useState("100");
  const [tryAmount, setTryAmount] = useState("500");
  const [iban, setIban] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<StepState>({ index: -1, failed: false, message: null });
  const [withdrawalId, setWithdrawalId] = useState<string | null>(null);
  const [withdrawalStatus, setWithdrawalStatus] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function postJson<T>(url: string, body: unknown): Promise<T> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `Request to ${url} failed`);
    return data;
  }

  /**
   * Calls a Soroban-invoke `prepare` endpoint; if the simulation reports
   * expired ledger entries, signs and submits the restore transaction first,
   * then retries — transparent to the caller.
   */
  async function prepareWithRestore<T>(url: string, body: unknown): Promise<T> {
    const res = await postJson<T & { needsRestore?: boolean; restoreXdr?: string }>(url, body);
    if (res.needsRestore && res.restoreXdr) {
      const signedRestoreXdr = await signTransaction(res.restoreXdr);
      await postJson("/api/loans/restore/submit", { signedXdr: signedRestoreXdr });
      return postJson<T>(url, body);
    }
    return res;
  }

  async function startBorrow() {
    if (!publicKey) return;
    setBusy(true);
    setStep({ index: 0, failed: false, message: null });

    try {
      // 1. Establish a USDC trustline first, if this account doesn't have one yet
      const trustline = await postJson<{ needed: boolean; unsignedXdr?: string }>(
        "/api/loans/trustline/prepare",
        {},
      );
      if (trustline.needed && trustline.unsignedXdr) {
        const signedTrustlineXdr = await signTransaction(trustline.unsignedXdr);
        await postJson("/api/loans/trustline/submit", { signedXdr: signedTrustlineXdr });
      }

      // 2. Lock collateral
      setStep({ index: 1, failed: false, message: null });
      const { unsignedXdr: collateralXdr } = await prepareWithRestore<{ unsignedXdr: string }>(
        "/api/loans/collateral/prepare",
        { asset: collateralAsset, amount: Number(collateralAmount) },
      );
      const signedCollateralXdr = await signTransaction(collateralXdr);
      await postJson("/api/loans/collateral/submit", { signedXdr: signedCollateralXdr });

      // 3. Quote + borrow USDC
      setStep({ index: 2, failed: false, message: null });
      const { usdcAmount } = await postJson<{ usdcAmount: number }>("/api/loans/quote", {
        tryAmount: Number(tryAmount),
      });
      const { unsignedXdr: borrowXdr } = await prepareWithRestore<{ unsignedXdr: string }>("/api/loans/borrow/prepare", {
        usdcAmount,
      });
      const signedBorrowXdr = await signTransaction(borrowXdr);

      // 4. Finalize: submit borrow tx + trigger SEP-6 withdrawal
      setStep({ index: 3, failed: false, message: null });
      const { withdrawal, anchorDestination } = await postJson<{
        withdrawal: { id: string; status: string };
        anchorDestination: { accountId: string; memoType?: "text" | "id" | "hash"; memo?: string };
      }>("/api/loans/borrow/submit", {
        signedXdr: signedBorrowXdr,
        collateralAsset,
        collateralAmount: Number(collateralAmount),
        usdcAmount,
        tryAmount: Number(tryAmount),
        iban,
      });

      // 5. Actually send the borrowed USDC to the anchor's account — the
      // anchor won't convert/pay out TRY until it observes this arrive.
      const { unsignedXdr: payoutXdr } = await postJson<{ unsignedXdr: string }>(
        "/api/loans/borrow/payout/prepare",
        {
          toAccount: anchorDestination.accountId,
          memoType: anchorDestination.memoType,
          memo: anchorDestination.memo,
          amount: usdcAmount,
        },
      );
      const signedPayoutXdr = await signTransaction(payoutXdr);
      await postJson("/api/loans/borrow/payout/submit", { signedXdr: signedPayoutXdr });

      setWithdrawalId(withdrawal.id);
      setWithdrawalStatus(withdrawal.status);
      pollRef.current = setInterval(async () => {
        const res = await fetch(`/api/withdraw/${withdrawal.id}/status`);
        const data = await res.json();
        if (res.ok) {
          setWithdrawalStatus(data.withdrawal.status);
          if (TERMINAL_STATUSES.has(data.withdrawal.status)) {
            setStep({ index: data.withdrawal.status === "completed" ? 4 : 3, failed: data.withdrawal.status === "failed", message: null });
            if (pollRef.current) clearInterval(pollRef.current);
          }
        }
      }, 4000);
    } catch (err) {
      setStep((prev) => ({ ...prev, failed: true, message: err instanceof Error ? err.message : "Cash advance failed" }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-semibold">Get Cash Advance</h2>

      {!authenticated && <p className="text-sm text-zinc-500">Sign in with your wallet to get started.</p>}

      <label className="flex flex-col gap-1 text-sm text-zinc-600">
        Which crypto are you using?
        <input
          type="text"
          value={collateralAsset}
          onChange={(e) => setCollateralAsset(e.target.value)}
          placeholder="Asset contract address"
          className="rounded-lg border border-zinc-300 px-3 py-2 text-base"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-zinc-600">
        How much of it?
        <input
          type="number"
          min={0}
          value={collateralAmount}
          onChange={(e) => setCollateralAmount(e.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-base"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-zinc-600">
        Cash advance amount (TRY)
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
        onClick={() => void startBorrow()}
        disabled={busy || !authenticated || !collateralAsset || !iban}
        className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "Processing..." : "Get Cash Advance"}
      </button>

      {step.index >= 0 && (
        <div className="rounded-xl bg-zinc-50 p-4">
          <StatusTimeline steps={STEPS} currentIndex={step.index} failed={step.failed} />
          {step.message && <p className="mt-3 text-sm text-red-600">{step.message}</p>}
          {withdrawalId && <p className="mt-3 text-xs text-zinc-500">Transfer status: {withdrawalStatus}</p>}
        </div>
      )}
    </div>
  );
}
