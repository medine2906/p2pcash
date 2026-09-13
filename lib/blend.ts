import "server-only";
import { Account, TransactionBuilder, rpc, xdr } from "@stellar/stellar-sdk";
import { PoolContractV2, RequestType, type Request } from "@blend-capital/blend-sdk";
import { FixedMath } from "@blend-capital/blend-sdk";
import { requireEnv } from "./env";
import { STELLAR_NETWORK } from "./stellar";

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
 * Builds an unsigned, simulation-prepared Soroban transaction for a Blend
 * pool `submit` call. The caller (a connected wallet, via Stellar Wallets
 * Kit) signs the returned XDR client-side; nothing here ever touches a
 * private key.
 */
async function buildSubmitTransaction(account: string, requests: Request[]): Promise<string> {
  const server = getRpcServer();
  const pool = getPoolContract();

  const opXdr = pool.submit({ from: account, spender: account, to: account, requests });
  const operation = xdr.Operation.fromXDR(opXdr, "base64");

  const sourceAccount = await server.getAccount(account);
  const builder = new TransactionBuilder(sourceAccount as unknown as Account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_NETWORK,
  })
    .addOperation(operation)
    .setTimeout(TX_TIMEOUT_SECONDS);

  const tx = builder.build();
  const prepared = await server.prepareTransaction(tx);
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
