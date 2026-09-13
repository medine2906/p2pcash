import Link from "next/link";
import { WalletConnect } from "@/components/WalletConnect";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
        <nav className="flex items-center gap-6">
          <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
            P2PCash
          </Link>
          <Link href="/dashboard/lend" className="text-sm text-zinc-600 hover:text-zinc-900">
            Add Funds
          </Link>
          <Link href="/dashboard/borrow" className="text-sm text-zinc-600 hover:text-zinc-900">
            Get Cash Advance
          </Link>
        </nav>
        <WalletConnect />
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">{children}</main>
    </div>
  );
}
