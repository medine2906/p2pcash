"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/lib/wallet-context";

interface Health {
  totalBorrowed: number;
  totalSupplied: number;
  totalEffectiveLiabilities: number;
  totalEffectiveCollateral: number;
  borrowLimit: number;
}

export function CollateralHealth() {
  const { authenticated } = useWallet();
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authenticated) return;
    fetch("/api/loans/self/health")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setHealth(data.health);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load collateral health"));
  }, [authenticated]);

  if (!authenticated) return null;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!health) return <p className="text-sm text-zinc-500">Loading collateral health...</p>;

  const safetyPercent = Math.max(0, Math.min(100, Math.round((1 - health.borrowLimit) * 100)));
  const barColor = safetyPercent > 50 ? "bg-emerald-500" : safetyPercent > 20 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-6">
      <h3 className="text-sm font-medium text-zinc-600">Collateral Health</h3>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
        <div className={`h-full ${barColor}`} style={{ width: `${safetyPercent}%` }} />
      </div>
      <p className="text-2xl font-semibold text-zinc-900">{safetyPercent}%</p>
      <p className="text-xs text-zinc-500">
        {health.totalEffectiveCollateral.toFixed(2)} collateral vs {health.totalEffectiveLiabilities.toFixed(2)} owed
      </p>
    </div>
  );
}
