import enum


class OrganizationType(str, enum.Enum):
    BANKRUPTCY = "bankruptcy"
    RETAIL = "retail"


class UserRole(str, enum.Enum):
    OWNER = "owner"
    MANAGER = "manager"
    CALL_CENTER = "call_center"
    INVESTOR = "investor"


class ClientStatus(str, enum.Enum):
    ACTIVE = "active"
    COMPLETED = "completed"
    DEFAULTED = "defaulted"
    CANCELLED = "cancelled"


class EngagementStage(str, enum.Enum):
    DOCUMENT_COLLECTION = "document_collection"
    BANKRUPTCY = "bankruptcy"


class DocumentCollectionStatus(str, enum.Enum):
    PENDING = "pending"
    PAID = "paid"


class ProcedureStage(str, enum.Enum):
    CONTRACT_SIGNED = "contract_signed"
    DEPOSIT = "deposit"
    FINANCIAL_MANAGEMENT = "financial_management"
    COURT = "court"
    COMPLETED = "completed"


class TaskType(str, enum.Enum):
    OVERDUE_PAYMENT = "overdue_payment"
    DEFERRAL_REVIEW = "deferral_review"
    MANUAL = "manual"


class TaskStatus(str, enum.Enum):
    OPEN = "open"
    DONE = "done"
    DISMISSED = "dismissed"


class TaskSource(str, enum.Enum):
    AUTO = "auto"
    MANUAL = "manual"


class PaymentScheduleStatus(str, enum.Enum):
    PENDING = "pending"
    PAID = "paid"
    PARTIAL = "partial"
    OVERDUE = "overdue"


class AuditAction(str, enum.Enum):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"


class ExpenseCategory(str, enum.Enum):
    SALARY = "salary"
    RENT = "rent"
    UTILITIES = "utilities"
    MARKETING = "marketing"
    OTHER = "other"


class ExpenseGroup(str, enum.Enum):
    SALARY_PROJECT = "salary_project"
    PRODUCTION = "production"


class MandatoryPaymentType(str, enum.Enum):
    DEPOSIT = "deposit"
    FINANCIAL_MANAGEMENT = "financial_management"
    COURT_FEE = "court_fee"


class MandatoryPaymentStatus(str, enum.Enum):
    PENDING = "pending"
    PAID = "paid"
    PARTIAL = "partial"
    NOT_APPLICABLE = "not_applicable"


class RetailContractStatus(str, enum.Enum):
    ACTIVE = "active"
    COMPLETED = "completed"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"


class RetailPaymentType(str, enum.Enum):
    DOWN_PAYMENT = "down_payment"
    MONTHLY = "monthly"
    EARLY_REPAYMENT = "early_repayment"


class RetailOverdueStatus(str, enum.Enum):
    IN_PROGRESS = "in_progress"
    PROMISED = "promised"
    NO_CONTACT = "no_contact"
    CLOSED = "closed"
