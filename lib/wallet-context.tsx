"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { initWalletsKit } from "./wallets-kit";

interface WalletContextValue {
  publicKey: string | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<string | null>;
  disconnect: () => Promise<void>;
  signTransaction: (xdr: string, networkPassphrase?: string) => Promise<string>;
  authenticated: boolean;
  authenticating: boolean;
  signIn: () => Promise<boolean>;
  signOut: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const kit = initWalletsKit();
      const { address } = await kit.authModal();
      setPublicKey(address);
      return address;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect wallet");
      return null;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    const kit = initWalletsKit();
    await kit.disconnect();
    setPublicKey(null);
    setAuthenticated(false);
  }, []);

  const signTransaction = useCallback(async (xdr: string, networkPassphrase?: string) => {
    if (!publicKey) throw new Error("No wallet connected");
    const kit = initWalletsKit();
    const { signedTxXdr } = await kit.signTransaction(xdr, { address: publicKey, networkPassphrase });
    return signedTxXdr;
  }, [publicKey]);

  const signIn = useCallback(async () => {
    const address = publicKey ?? (await connect());
    if (!address) return false;

    setAuthenticating(true);
    setError(null);
    try {
      const challengeRes = await fetch("/api/auth/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: address }),
      });
      if (!challengeRes.ok) throw new Error((await challengeRes.json()).error ?? "Challenge request failed");
      const { transaction, network_passphrase } = await challengeRes.json();

      const signedXdr = await signTransaction(transaction, network_passphrase);

      const tokenRes = await fetch("/api/auth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction: signedXdr, publicKey: address }),
      });
      if (!tokenRes.ok) throw new Error((await tokenRes.json()).error ?? "Token exchange failed");

      setAuthenticated(true);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      return false;
    } finally {
      setAuthenticating(false);
    }
  }, [publicKey, connect, signTransaction]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuthenticated(false);
  }, []);

  const value = useMemo(
    () => ({
      publicKey,
      connecting,
      error,
      connect,
      disconnect,
      signTransaction,
      authenticated,
      authenticating,
      signIn,
      signOut,
    }),
    [publicKey, connecting, error, connect, disconnect, signTransaction, authenticated, authenticating, signIn, signOut],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within a WalletProvider");
  return ctx;
}
