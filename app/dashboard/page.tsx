import Link from "next/link";
import { CollateralHealth } from "@/components/CollateralHealth";

export default function DashboardOverviewPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Welcome back</h1>
        <p className="mt-1 text-zinc-600">
          Add funds to earn yield, or get a cash advance against your crypto without selling it.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/dashboard/lend"
          className="rounded-2xl border border-zinc-200 bg-white p-6 transition hover:border-zinc-300"
        >
          <h2 className="text-lg font-semibold">Add Funds</h2>
          <p className="mt-1 text-sm text-zinc-600">Deposit TRY and earn yield while it&apos;s lent out.</p>
        </Link>
        <Link
          href="/dashboard/borrow"
          className="rounded-2xl border border-zinc-200 bg-white p-6 transition hover:border-zinc-300"
        >
          <h2 className="text-lg font-semibold">Get Cash Advance</h2>
          <p className="mt-1 text-sm text-zinc-600">Lock crypto as collateral and get instant TRY.</p>
        </Link>
      </div>

      <CollateralHealth />
    </div>
  );
}
