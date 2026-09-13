"use client";

import { useWallet } from "@/lib/wallet-context";

function shortenKey(key: string) {
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export function WalletConnect() {
  const { publicKey, connecting, authenticated, authenticating, error, connect, disconnect, signIn, signOut } =
    useWallet();

  if (publicKey && authenticated) {
    return (
      <div className="flex items-center gap-3">
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800">
          {shortenKey(publicKey)}
        </span>
        <button onClick={() => void signOut()} className="text-sm text-neutral-500 hover:text-neutral-800">
          Sign out
        </button>
      </div>
    );
  }

  if (publicKey) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          onClick={() => void signIn()}
          disabled={authenticating}
          className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50"
        >
          {authenticating ? "Signing in..." : "Sign in with wallet"}
        </button>
        <button onClick={() => void disconnect()} className="text-xs text-neutral-500 hover:text-neutral-800">
          Disconnect
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() => void connect()}
        disabled={connecting}
        className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50"
      >
        {connecting ? "Connecting..." : "Connect Wallet"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
