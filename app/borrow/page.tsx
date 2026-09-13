import { WalletConnect } from "@/components/WalletConnect";
import { WithdrawFlow } from "@/components/WithdrawFlow";

export default function BorrowPage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
        <span className="text-lg font-semibold tracking-tight">P2PCash</span>
        <WalletConnect />
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-6 py-16">
        <WithdrawFlow />
      </main>
    </div>
  );
}
