import { BorrowFlow } from "@/components/BorrowFlow";
import { CollateralHealth } from "@/components/CollateralHealth";

export default function BorrowDashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Get Cash Advance</h1>
        <p className="mt-1 text-zinc-600">
          Lock crypto as collateral to borrow instant TRY, without selling your position.
        </p>
      </div>
      <BorrowFlow />
      <CollateralHealth />
    </div>
  );
}
