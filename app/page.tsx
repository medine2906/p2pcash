import Link from "next/link";
import { WalletConnect } from "@/components/WalletConnect";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
        <span className="text-lg font-semibold tracking-tight">P2PCash</span>
        <WalletConnect />
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-900">
          Instant cash, without selling your crypto.
        </h1>
        <p className="max-w-xl text-lg text-zinc-600">
          Connect your Stellar wallet to get a cash advance in Turkish Lira against your crypto, or
          add funds to earn yield lending to others.
        </p>
        <Link
          href="/dashboard"
          className="rounded-full bg-neutral-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-neutral-700"
        >
          Go to Dashboard
        </Link>
      </main>
    </div>
  );
}
