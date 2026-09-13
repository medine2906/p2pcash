// Hand-written types mirroring supabase/schema.sql, following the same shape
// `supabase gen types typescript` produces. If the schema changes,
// regenerate against the real project and keep this file in sync.

export type LoanStatus = "pending" | "active" | "repaid" | "liquidated" | "defaulted";
export type DepositStatus = "pending" | "converting" | "completed" | "failed";
export type WithdrawalStatus = "pending" | "processing" | "completed" | "failed";

export type ProfileRow = {
  id: string;
  stellar_public_key: string;
  created_at: string;
};

export type LoanRow = {
  id: string;
  borrower_id: string;
  collateral_asset: string;
  collateral_amount: number;
  borrowed_usdc_amount: number;
  try_amount: number;
  status: LoanStatus;
  created_at: string;
  due_at: string | null;
};

export type DepositRow = {
  id: string;
  lender_id: string;
  try_amount: number;
  usdc_amount: number | null;
  anchor_ref: string;
  status: DepositStatus;
  created_at: string;
};

export type WithdrawalRow = {
  id: string;
  borrower_id: string;
  loan_id: string | null;
  try_amount: number;
  usdc_amount: number;
  iban: string;
  anchor_ref: string;
  status: WithdrawalStatus;
  created_at: string;
};

export type TransactionsLogRow = {
  id: string;
  profile_id: string;
  kind: string;
  reference_table: string;
  reference_id: string;
  detail: Record<string, unknown> | null;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow> & Pick<ProfileRow, "stellar_public_key">;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      loans: {
        Row: LoanRow;
        Insert: Partial<LoanRow> &
          Pick<LoanRow, "borrower_id" | "collateral_asset" | "collateral_amount" | "borrowed_usdc_amount" | "try_amount">;
        Update: Partial<LoanRow>;
        Relationships: [];
      };
      deposits: {
        Row: DepositRow;
        Insert: Partial<DepositRow> & Pick<DepositRow, "lender_id" | "try_amount" | "anchor_ref">;
        Update: Partial<DepositRow>;
        Relationships: [];
      };
      withdrawals: {
        Row: WithdrawalRow;
        Insert: Partial<WithdrawalRow> &
          Pick<WithdrawalRow, "borrower_id" | "try_amount" | "usdc_amount" | "iban" | "anchor_ref">;
        Update: Partial<WithdrawalRow>;
        Relationships: [];
      };
      transactions_log: {
        Row: TransactionsLogRow;
        Insert: Partial<TransactionsLogRow> &
          Pick<TransactionsLogRow, "profile_id" | "kind" | "reference_table" | "reference_id">;
        Update: Partial<TransactionsLogRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
