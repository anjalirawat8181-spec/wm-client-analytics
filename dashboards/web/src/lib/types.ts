export type Segment = "Mass Affluent" | "HNI" | "UHNI";
export const SEGMENTS: Segment[] = ["Mass Affluent", "HNI", "UHNI"];

export interface CubeRow {
  snapshot_date: string;
  segment: Segment;
  branch: string;
  aum: number;
  active_clients: number;
  inflows: number;
  outflows: number;
  nnm: number;
  opening_clients: number;
  churned_clients: number;
  new_clients: number;
  fee_revenue: number;
  revenue_lost: number;
}

export interface MonthAgg {
  snapshot_date: string;
  aum: number;
  active_clients: number;
  inflows: number;
  outflows: number;
  nnm: number;
  opening_clients: number;
  churned_clients: number;
  new_clients: number;
  fee_revenue: number;
  revenue_lost: number;
  attrition_rate: number | null;
  revenue_per_client: number | null;
}

export interface Filters {
  segment: "All" | Segment;
  branch: string; // "All" or a branch name
  from: string; // month-end ISO date
  to: string;
}

export interface Tile {
  key: string;
  value: number | null;
  prior: number | null;
  series: (number | null)[];
}
export interface Summary {
  as_of: string;
  prior_month: string;
  tiles: Tile[];
  attrition_trailing_12m: number | null;
  attrition_trailing_12m_as_of: string | null;
  revenue_lost_last_month: number;
  churned_last_month: number;
  at_risk_clients_listed: number;
}
export interface Meta {
  generated_at: string;
  data_window: { first_month_end: string; last_month_end: string; months: number };
  row_counts: Record<string, number>;
  database_size_mb: number;
  commit: string;
  synthetic_data: boolean;
}
export interface AttritionRow {
  snapshot_date: string;
  segment: string;
  opening_clients: number;
  churned_clients: number;
  new_clients: number;
  closing_clients: number;
  attrition_rate: number | null;
}
export interface Trailing12Row {
  snapshot_date: string;
  segment: string;
  clients_active_12m_ago: number;
  churned_in_last_12m: number;
  attrition_trailing_12m: number | null;
}
export interface GapRow {
  bucket_order: number;
  gap_bucket: string;
  segment: string;
  opening_clients: number;
  churned_clients: number;
  attrition_rate: number | null;
}
export interface AttritionFile {
  monthly: AttritionRow[];
  trailing12: Trailing12Row[];
  contact_gap: GapRow[];
}
export interface CohortRow {
  cohort_month: string;
  months_since_onboarding: number;
  cohort_size: number;
  clients_observed: number;
  retained_clients: number;
  retention_pct: number;
}
export interface CohortFile {
  cohorts: CohortRow[];
  summary: {
    cohort_month: string;
    cohort_size: number;
    retention_3m_pct: number | null;
    retention_6m_pct: number | null;
    retention_12m_pct: number | null;
  }[];
}
export interface RiskRow {
  snapshot_date: string;
  segment: string;
  risk_level: "High" | "Medium" | "Low";
  clients: number;
  aum: number;
}
export interface AtRiskRow {
  priority_rank: number;
  client_id: number;
  segment: Segment;
  branch: string;
  advisor_id: number;
  aum: number;
  days_since_last_contact: number;
  risk_score: number;
  risk_level: "High" | "Medium";
  reasons: string | null;
}
export interface AdvisorRow {
  advisor_id: number;
  branch: string;
  team: string;
  active_clients: number | null;
  aum: number | null;
  nnm_12m: number | null;
  nnm_per_client: number | null;
  connected_contacts_12m: number;
  contacts_per_client_month: number | null;
  aum_rank: number;
  growth_rank: number;
  contact_rank: number;
  nnm_decile: number;
  contact_decile: number;
}
export interface AdvisorFile {
  advisors: AdvisorRow[];
  trend: { advisor_id: number; snapshot_date: string; aum_rank: number; nnm_3m_rank: number; aum_rank_change: number | null }[];
}
export interface AllocationRow {
  snapshot_date: string;
  segment: string;
  asset_class: string;
  value: number;
  share_pct: number;
}
export interface DqRule {
  rule: string;
  category: string;
  checked: number;
  failures: number;
  pass_pct: number;
  planted: number | null;
  caught: number | null;
  note: string;
  strict: boolean;
}
export interface DqFile {
  generated_at: string | null;
  overall: { rules: number; rules_passing: number; strict_failures: number; rows_checked: number } | null;
  reconciliation: { table: string; staging: number; mart: number; rejected_or_duplicate: number; unaccounted: number }[];
  detection: { table: string; defect: string; planted: number; caught: number; missed: number; false_positives: number }[];
  detection_note: string | null;
  mart_vs_clean: { table: string; rows_differing: number; unexpected: boolean }[];
  scorecard: DqRule[];
  exceptions: { source_table: string; rule_name: string; handling: string; rows_affected: number; staging_rows: number; pct_of_staging: number }[];
}
