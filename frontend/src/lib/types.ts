export type UserRole = "owner" | "manager" | "call_center" | "investor";

export type OrganizationType = "bankruptcy" | "retail";

export type Workspace = "legal" | "retail";

export type ClientStatus = "active" | "completed" | "defaulted" | "cancelled";

export type EngagementStage = "document_collection" | "bankruptcy";

export type DocumentCollectionStatus = "pending" | "paid";

export type ProcedureStage =
  | "contract_signed"
  | "deposit"
  | "financial_management"
  | "court"
  | "completed";

export type TaskStatus = "open" | "done" | "dismissed";

export type PaymentScheduleStatus = "pending" | "paid" | "partial" | "overdue";

export type ExpenseCategory = "salary" | "rent" | "utilities" | "marketing" | "other";

export type ExpenseGroup = "salary_project" | "production";

export type MandatoryPaymentType = "deposit" | "financial_management" | "court_fee";

export type MandatoryPaymentStatus = "pending" | "paid" | "partial" | "not_applicable";

export type AuditAction = "create" | "update" | "delete";

export interface AuditLogEntry {
  id: string;
  organization_id: string;
  entity_type: string;
  entity_id: string;
  action: AuditAction;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_by: string;
  changed_by_name: string | null;
  changed_at: string;
}

export interface User {
  id: string;
  organization_id: string;
  organization_name: string;
  organization_type: OrganizationType;
  full_name: string;
  phone: string | null;
  email: string | null;
  role: UserRole;
  is_active: boolean;
  investment_amount?: string | null;
  created_at?: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface Client {
  id: string;
  organization_id: string;
  assigned_manager_id: string | null;
  full_name: string;
  phone: string;
  contract_date: string;
  debt_amount: string;
  status: ClientStatus;
  engagement_stage: EngagementStage;
  procedure_stage: ProcedureStage;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  has_overdue?: boolean;
}

export interface ClientBrief {
  id: string;
  full_name: string;
  phone: string;
  contract_date: string;
  status: ClientStatus;
  engagement_stage: EngagementStage;
  procedure_stage: ProcedureStage;
  assigned_manager_id: string | null;
}

export interface PricingTier {
  id: string;
  organization_id: string;
  min_amount: string;
  max_amount: string;
  total_cost: string;
  first_month_payment: string;
  second_month_payment: string;
  remaining_months_count: number;
  remaining_month_payment: string;
  total_months: number;
  is_active: boolean;
  effective_from: string;
}

export interface InstallmentPlan {
  id: string;
  client_id: string;
  pricing_tier_id: string | null;
  total_amount: string;
  start_date: string;
  total_months: number;
  created_at: string;
}

export interface PaymentScheduleItem {
  id: string;
  installment_plan_id: string;
  month_number: number;
  due_date: string;
  planned_amount: string;
  paid_amount: string;
  paid_date: string | null;
  status: PaymentScheduleStatus;
  deferred_until: string | null;
  deferral_comment: string | null;
  overdue_waived: boolean;
}

export interface Payment {
  id: string;
  client_id: string;
  payment_schedule_id: string | null;
  amount: string;
  payment_date: string;
  comment: string | null;
  created_by: string;
  is_deleted: boolean;
  is_refund: boolean;
  created_at: string;
}

export interface PricingTierSummary {
  id: string;
  min_amount: string;
  max_amount: string;
  total_cost: string;
  total_months: number;
}

export interface MandatoryPayment {
  id: string;
  client_id: string;
  payment_type: MandatoryPaymentType;
  planned_amount: string;
  paid_amount: string;
  paid_date: string | null;
  status: MandatoryPaymentStatus;
  is_applicable: boolean;
  comment: string | null;
}

export interface DocumentCollection {
  id: string;
  client_id: string;
  total_amount: string;
  collection_fee: string;
  notary_fee: string;
  manager_commission: string;
  status: DocumentCollectionStatus;
  paid_date: string | null;
}

export interface ClientDetail extends Client {
  installment_plan: InstallmentPlan | null;
  payment_schedule: PaymentScheduleItem[];
  matched_tier: PricingTierSummary | null;
  payments: Payment[];
  mandatory_payments: MandatoryPayment[];
  document_collection: DocumentCollection | null;
}

export interface ApiError {
  detail: string;
}

export interface MandatoryPaymentBreakdown {
  deposit: string;
  financial_management: string;
  court_fee: string;
  total: string;
}

export interface DashboardSummary {
  clients_total: number;
  clients_active: number;
  clients_overdue: number;
  expected_this_month: string;
  collected_this_month: string;
  overdue_amount: string;
  total_remainder: string;
  total_collected: string;
  active_debt_total: string;
  monthly_expenses: string;
  mandatory_paid_total: MandatoryPaymentBreakdown;
  mandatory_paid_this_month: MandatoryPaymentBreakdown;
  org_profit_total: string;
  net_profit_this_month: string;
}

export interface ClientProfitItem {
  client_id: string;
  full_name: string;
  contract_date: string;
  status: ClientStatus;
  debt_amount: string;
  installment_total: string | null;
  collected_total: string;
  mandatory_paid_total: string;
  profit: string;
  schedule_remainder: string;
  mandatory_remainder: string;
  has_overdue: boolean;
}

export interface MonthlyTrendPoint {
  month: string;
  collected: string;
  expected: string;
  expenses: string;
  mandatory_paid: string;
  net_profit: string;
  payments_count: number;
}

export interface AnalyticsSummary {
  clients_count: number;
  collected_total: string;
  profit_total: string;
  schedule_remainder_total: string;
  monthly_expenses: string;
  mandatory_paid_total: MandatoryPaymentBreakdown;
}

export interface AnalyticsOverview {
  summary: AnalyticsSummary;
  trends: MonthlyTrendPoint[];
  client_profits: ClientProfitItem[];
}

export interface ManagerCommissionItem {
  manager_id: string | null;
  manager_name: string;
  client_id: string;
  client_name: string;
  commission_amount: string;
  paid_date: string;
  document_collection_id: string;
}

export interface ManagerCommissionsOverview {
  total_commission: string;
  paid_count: number;
  items: ManagerCommissionItem[];
}

export interface FunnelStageItem {
  stage: ProcedureStage;
  count: number;
}

export interface FunnelOverview {
  stages: FunnelStageItem[];
  total_clients: number;
}

export interface ManagerTask {
  id: string;
  organization_id: string;
  client_id: string;
  assigned_manager_id: string | null;
  payment_schedule_id: string | null;
  task_type: string;
  status: TaskStatus;
  title: string;
  note: string | null;
  overdue_days: number | null;
  due_date: string | null;
  completed_at: string | null;
  completed_by: string | null;
  client_name: string | null;
  client_phone: string | null;
  manager_name: string | null;
  schedule_due_date: string | null;
  remainder_amount: string | null;
  payment_window_label: string | null;
}

export interface OperatingExpense {
  id: string;
  organization_id: string;
  name: string;
  category: ExpenseCategory;
  expense_group: ExpenseGroup;
  amount: string;
  pay_day: number | null;
  is_active: boolean;
  sort_order: number;
}

export interface ExpensePayment {
  id: string;
  expense_id: string;
  amount: string;
  payment_date: string;
  period_month: string;
  comment: string | null;
  created_by: string;
  created_at: string;
}

export type RetailContractStatus = "active" | "completed" | "overdue" | "cancelled";

export type RetailPaymentType = "down_payment" | "monthly" | "early_repayment";

export type RetailOverdueStatus = "in_progress" | "promised" | "no_contact" | "closed";

export interface RetailClient {
  id: string;
  organization_id: string;
  full_name: string;
  phone: string;
  passport: string;
  address: string;
  guarantor_full_name: string;
  guarantor_phone: string;
  guarantor_passport: string;
  contracts_count: number;
}

export interface RetailTermRate {
  id: string;
  term_months: number;
  markup_percent: string;
}

export interface RetailPaymentScheduleItem {
  id: string;
  month_number: number;
  due_date: string;
  planned_amount: string;
  paid_amount: string;
  paid_date: string | null;
  status: PaymentScheduleStatus;
}

export interface RetailPayment {
  id: string;
  payment_type: RetailPaymentType;
  amount: string;
  payment_date: string;
  comment: string | null;
  payment_schedule_id: string | null;
  created_by_id: string;
}

export interface RetailOverdueLog {
  id: string;
  action_date: string;
  comment: string;
  promised_date: string | null;
  status: RetailOverdueStatus;
  created_by_id: string;
}

export interface RetailContractBrief {
  id: string;
  retail_client_id: string;
  investor_id: string;
  investor_name: string;
  client_name: string;
  product_name: string;
  product_price: string;
  term_months: number;
  markup_percent: string;
  total_amount: string;
  down_payment: string;
  financed_amount: string;
  monthly_payment: string;
  contract_date: string;
  status: RetailContractStatus;
  collected_total: string;
  remainder_total: string;
  has_overdue: boolean;
}

export interface RetailContractDetail extends RetailContractBrief {
  payment_schedule: RetailPaymentScheduleItem[];
  payments: RetailPayment[];
  overdue_logs: RetailOverdueLog[];
}

export interface InvestorSummaryItem {
  investor_id: string;
  investor_name: string;
  investment_amount: string;
  contracts_count: number;
  total_amount: string;
  collected_total: string;
  remainder_total: string;
  overdue_count: number;
}

export interface RetailDashboardSummary {
  contracts_count: number;
  active_count: number;
  overdue_count: number;
  total_amount: string;
  collected_total: string;
  remainder_total: string;
  down_payment_total: string;
  investors: InvestorSummaryItem[];
}
