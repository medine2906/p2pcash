import { DepositFlow } from "@/components/DepositFlow";

export default function LendDashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Add Funds</h1>
        <p className="mt-1 text-zinc-600">
          Deposit TRY from your bank. It&apos;s converted and lent out automatically to start earning yield.
        </p>
      </div>
      <DepositFlow />
    </div>
  );
}
