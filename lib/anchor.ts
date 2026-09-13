import "server-only";
import { requireEnv } from "./env";

export interface AnchorConfig {
  webAuthEndpoint: string;
  transferServer: string;
  signingKey: string | null;
}

let cachedConfig: AnchorConfig | null = null;

/**
 * The anchor URL's `.well-known/stellar.toml` is the canonical source for its
 * SEP-10/SEP-6 endpoints, but this network sandbox cannot reach
 * tr-mock-anchor.fly.dev to verify its exact layout. We attempt the TOML
 * fetch (works in any real deployment) and fall back to the endpoint paths
 * used by the standard Stellar anchor reference server if it's unreachable.
 */
export async function getAnchorConfig(): Promise<AnchorConfig> {
  if (cachedConfig) return cachedConfig;

  const anchorUrl = requireEnv("NEXT_PUBLIC_ANCHOR_URL");
  const fallback: AnchorConfig = {
    webAuthEndpoint: `${anchorUrl}/auth`,
    transferServer: `${anchorUrl}/sep6`,
    signingKey: null,
  };

  try {
    const res = await fetch(`${anchorUrl}/.well-known/stellar.toml`, {
      cache: "force-cache",
      next: { revalidate: 3600 },
    });
    if (!res.ok) return (cachedConfig = fallback);

    const text = await res.text();
    const pick = (key: string) => text.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, "m"))?.[1] ?? null;

    cachedConfig = {
      webAuthEndpoint: pick("WEB_AUTH_ENDPOINT") ?? fallback.webAuthEndpoint,
      transferServer: pick("TRANSFER_SERVER") ?? fallback.transferServer,
      signingKey: pick("SIGNING_KEY"),
    };
    return cachedConfig;
  } catch {
    return (cachedConfig = fallback);
  }
}

export interface Sep10ChallengeResponse {
  transaction: string;
  network_passphrase: string;
}

/** SEP-10 step 1: request a signed challenge transaction for the given account. */
export async function requestSep10Challenge(account: string): Promise<Sep10ChallengeResponse> {
  const { webAuthEndpoint } = await getAnchorConfig();
  const url = new URL(webAuthEndpoint);
  url.searchParams.set("account", account);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Anchor SEP-10 challenge failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export interface Sep10TokenResponse {
  token: string;
}

/** SEP-10 step 2: exchange the user-signed challenge transaction for a session JWT. */
export async function submitSep10Challenge(signedTransactionXdr: string): Promise<Sep10TokenResponse> {
  const { webAuthEndpoint } = await getAnchorConfig();

  const res = await fetch(webAuthEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transaction: signedTransactionXdr }),
  });
  if (!res.ok) {
    throw new Error(`Anchor SEP-10 token exchange failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}
