// Asset identifiers used across anchor (SEP-6/38) calls.
// USDC issuer is the TR Mock Anchor's own testnet issuing account, discovered
// from its stellar.toml; until that's reachable we reference the asset by
// code only, which the mock anchor's SEP-6 endpoints accept directly.
export const USDC_ASSET_CODE = "USDC";
export const TRY_SEP38_ASSET = "iso4217:TRY";

export function usdcSep38Asset(issuer?: string | null) {
  return issuer ? `stellar:${USDC_ASSET_CODE}:${issuer}` : `stellar:${USDC_ASSET_CODE}`;
}
