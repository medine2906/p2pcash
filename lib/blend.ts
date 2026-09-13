import "server-only";
import { Account, Asset, Contract, Memo, Operation, TransactionBuilder, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { PoolContractV2, RequestType, type Request } from "@blend-capital/blend-sdk";
import { FixedMath } from "@blend-capital/blend-sdk";
import { requireEnv } from "./env";
import { HORIZON_URL, STELLAR_NETWORK } from "./stellar";

const BASE_FEE = "1000000"; // 0.1 XLM in stroops, generous for a Soroban invoke op
const TX_TIMEOUT_SECONDS = 60;
const USDC_DECIMALS = 7;

function getRpcServer() {
  return new rpc.Server(requireEnv("NEXT_PUBLIC_SOROBAN_RPC_URL"));
}

function getPoolContract() {
  return new PoolContractV2(requireEnv("NEXT_PUBLIC_BLEND_POOL_ID"));
}

function usdcAssetId() {
  return requireEnv("NEXT_PUBLIC_USDC_CONTRACT_ID");
}

/**
 * Thrown when a Soroban simulation reports that some ledger entries the
 * operation touches have expired and been archived (Soroban "state
 * archival"). `restoreXdr` is an unsigned transaction that restores them;
 * once submitted, the original operation can be re-prepared and will
 * simulate cleanly.
 */
export class RestoreRequiredError extends Error {
  constructor(public readonly restoreXdr: string) {
    super("Some ledger entries this transaction needs have expired and must be restored first");
    this.name = "RestoreRequiredError";
  }
}

/**
 * Builds an unsigned, simulation-prepared Soroban transaction for a Blend
 * pool `submit` call. The caller (a connected wallet, via Stellar Wallets
 * Kit) signs the returned XDR client-side; nothing here ever touches a
 * private key.
 *
 * @throws {RestoreRequiredError} if the simulation reports expired ledger
 * entries that must be restored before this operation can run.
 */
async function buildSubmitTransaction(account: string, requests: Request[]): Promise<string> {
  const server = getRpcServer();
  const pool = getPoolContract();

  const opXdr = pool.submit({ from: account, spender: account, to: account, requests });
  const operation = xdr.Operation.fromXDR(opXdr, "base64");

  const sourceAccount = await server.getAccount(account);
  const tx = new TransactionBuilder(sourceAccount as unknown as Account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_NETWORK,
  })
    .addOperation(operation)
    .setTimeout(TX_TIMEOUT_SECONDS)
    .build();

  const sim = await server.simulateTransaction(tx);

  if (rpc.Api.isSimulationRestore(sim)) {
    const restoreTx = new TransactionBuilder(sourceAccount as unknown as Account, {
      fee: BASE_FEE,
      networkPassphrase: STELLAR_NETWORK,
    })
      .setSorobanData(sim.restorePreamble.transactionData.build())
      .addOperation(Operation.restoreFootprint({}))
      .setTimeout(TX_TIMEOUT_SECONDS)
      .build();
    throw new RestoreRequiredError(restoreTx.toXDR());
  }

  if (!rpc.Api.isSimulationSuccess(sim)) {
    throw new Error(`Simulation failed: ${JSON.stringify(sim)}`);
  }

  const prepared = rpc.assembleTransaction(tx, sim).build();
  return prepared.toXDR();
}

/** Submits a wallet-signed transaction (base64 XDR) and waits for confirmation. */
export async function submitSignedTransaction(signedTxXdr: string) {
  const server = getRpcServer();
  const tx = TransactionBuilder.fromXDR(signedTxXdr, STELLAR_NETWORK);
  const sendResult = await server.sendTransaction(tx);

  if (sendResult.status === "ERROR") {
    throw new Error(`Blend transaction submission failed: ${JSON.stringify(sendResult.errorResult)}`);
  }

  let getResult = await server.getTransaction(sendResult.hash);
  const deadline = Date.now() + 30_000;
  while (getResult.status === "NOT_FOUND" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    getResult = await server.getTransaction(sendResult.hash);
  }

  if (getResult.status !== "SUCCESS") {
    throw new Error(`Blend transaction did not succeed: ${getResult.status}`);
  }

  return { hash: sendResult.hash, result: getResult };
}

/** Simulates a read-only contract call and decodes its return value. */
async function simulateContractCall(contractId: string, method: string, sourceAccount: string) {
  const server = getRpcServer();
  const account = await server.getAccount(sourceAccount);
  const tx = new TransactionBuilder(account as unknown as Account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_NETWORK,
  })
    .addOperation(new Contract(contractId).call(method))
    .setTimeout(TX_TIMEOUT_SECONDS)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim)) {
    throw new Error(`Simulation failed for ${contractId}.${method}: ${JSON.stringify(sim)}`);
  }
  return scValToNative(sim.result!.retval);
}

export interface ClassicAsset {
  code: string;
  issuer: string;
}

/**
 * Resolves the classic Stellar asset (code + issuer) wrapped by a Soroban
 * token contract, via its SEP-41 `name()` call (returns "CODE:ISSUER" for a
 * Stellar Asset Contract, or "native" for XLM, which never needs a trustline).
 */
export async function getClassicAsset(contractId: string, sourceAccount: string): Promise<ClassicAsset | null> {
  const name = await simulateContractCall(contractId, "name", sourceAccount);
  if (typeof name !== "string" || name === "native") return null;
  const [code, issuer] = name.split(":");
  if (!code || !issuer) return null;
  return { code, issuer };
}

/** Checks (via Horizon) whether an account already trusts the given classic asset. */
export async function hasTrustline(account: string, code: string, issuer: string): Promise<boolean> {
  const res = await fetch(`${HORIZON_URL}/accounts/${account}`);
  if (!res.ok) return false;
  const data = await res.json();
  const balances = (data.balances ?? []) as Array<{ asset_code?: string; asset_issuer?: string }>;
  return balances.some((b) => b.asset_code === code && b.asset_issuer === issuer);
}

/** Builds an unsigned classic `changeTrust` transaction for the given asset. */
export async function buildEstablishTrustlineTransaction(account: string, code: string, issuer: string): Promise<string> {
  const server = getRpcServer();
  const sourceAccount = await server.getAccount(account);
  const tx = new TransactionBuilder(sourceAccount as unknown as Account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_NETWORK,
  })
    .addOperation(Operation.changeTrust({ asset: new Asset(code, issuer) }))
    .setTimeout(TX_TIMEOUT_SECONDS)
    .build();
  return tx.toXDR();
}

/**
 * Borrower: if the pool's USDC asset is a classic-backed token the borrower's
 * account doesn't yet trust, returns an unsigned trustline transaction to
 * sign first. Returns null if no trustline is needed (already trusted, or
 * the asset is native XLM).
 */
export async function ensureUsdcTrustline(account: string): Promise<string | null> {
  const classicAsset = await getClassicAsset(usdcAssetId(), account);
  if (!classicAsset) return null;

  const trusted = await hasTrustline(account, classicAsset.code, classicAsset.issuer);
  if (trusted) return null;

  return buildEstablishTrustlineTransaction(account, classicAsset.code, classicAsset.issuer);
}

/**
 * Borrower: build the on-chain USDC payment SEP-6 withdrawal requires —
 * `/sep6/withdraw` only returns *where* to send the asset (account + memo);
 * the anchor won't convert/pay out fiat until it actually observes this
 * payment arrive.
 */
export async function buildUsdcPaymentTransaction(
  from: string,
  to: string,
  amount: number,
  memoType?: "text" | "id" | "hash",
  memo?: string,
): Promise<string> {
  const classicAsset = await getClassicAsset(usdcAssetId(), from);
  if (!classicAsset) {
    throw new Error("Pool USDC asset has no classic representation to pay out with");
  }

  const server = getRpcServer();
  const sourceAccount = await server.getAccount(from);
  const builder = new TransactionBuilder(sourceAccount as unknown as Account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_NETWORK,
  }).addOperation(
    Operation.payment({
      destination: to,
      asset: new Asset(classicAsset.code, classicAsset.issuer),
      amount: amount.toFixed(USDC_DECIMALS),
    }),
  );

  if (memoType && memo) {
    if (memoType === "text") builder.addMemo(Memo.text(memo));
    else if (memoType === "id") builder.addMemo(Memo.id(memo));
    else builder.addMemo(Memo.hash(memo));
  }

  const tx = builder.setTimeout(TX_TIMEOUT_SECONDS).build();
  return tx.toXDR();
}

/** Lender: build a tx supplying USDC as non-collateralized pool liquidity. */
export async function supplyLiquidity(account: string, amount: number): Promise<string> {
  return buildSubmitTransaction(account, [
    { request_type: RequestType.Supply, address: usdcAssetId(), amount: FixedMath.toFixed(amount, USDC_DECIMALS) },
  ]);
}

/** Borrower: build a tx locking `asset` as collateral. */
export async function depositCollateral(account: string, asset: string, amount: number, decimals = 7): Promise<string> {
  return buildSubmitTransaction(account, [
    { request_type: RequestType.SupplyCollateral, address: asset, amount: FixedMath.toFixed(amount, decimals) },
  ]);
}

/** Borrower: build a tx borrowing USDC against posted collateral. */
export async function borrowAsset(account: string, amount: number): Promise<string> {
  return buildSubmitTransaction(account, [
    { request_type: RequestType.Borrow, address: usdcAssetId(), amount: FixedMath.toFixed(amount, USDC_DECIMALS) },
  ]);
}

/** Borrower: build a tx repaying an outstanding USDC borrow position. */
export async function repayBorrow(account: string, amount: number): Promise<string> {
  return buildSubmitTransaction(account, [
    { request_type: RequestType.Repay, address: usdcAssetId(), amount: FixedMath.toFixed(amount, USDC_DECIMALS) },
  ]);
}

export interface PoolPositionHealth {
  totalBorrowed: number;
  totalSupplied: number;
  totalEffectiveLiabilities: number;
  totalEffectiveCollateral: number;
  borrowLimit: number;
}

/** Read-only: current positions + oracle-derived collateral health for a borrower. */
export async function getUserPoolPosition(account: string): Promise<PoolPositionHealth> {
  const { PoolV2, PositionsEstimate } = await import("@blend-capital/blend-sdk");
  const network = { rpc: requireEnv("NEXT_PUBLIC_SOROBAN_RPC_URL"), passphrase: STELLAR_NETWORK };
  const pool = await PoolV2.load(network, requireEnv("NEXT_PUBLIC_BLEND_POOL_ID"));
  const [user, oracle] = await Promise.all([pool.loadUser(account), pool.loadOracle()]);
  const estimate = PositionsEstimate.build(pool, oracle, user.positions);

  return {
    totalBorrowed: estimate.totalBorrowed,
    totalSupplied: estimate.totalSupplied,
    totalEffectiveLiabilities: estimate.totalEffectiveLiabilities,
    totalEffectiveCollateral: estimate.totalEffectiveCollateral,
    borrowLimit: estimate.borrowLimit,
  };
}
