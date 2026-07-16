from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import ClientStatus, EngagementStage, ProcedureStage
from app.services.default_pricing_tiers import MIN_DEBT_AMOUNT


class ClientCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    phone: str = Field(min_length=1, max_length=32)
    contract_date: date
    debt_amount: Decimal = Field(default=Decimal("0.00"), ge=0, decimal_places=2)
    assigned_manager_id: UUID | None = None
    status: ClientStatus = ClientStatus.ACTIVE
    engagement_stage: EngagementStage = EngagementStage.DOCUMENT_COLLECTION
    procedure_stage: ProcedureStage = ProcedureStage.CONTRACT_SIGNED
    create_installment_plan: bool = False


class ClientUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = Field(default=None, min_length=1, max_length=32)
    contract_date: date | None = None
    debt_amount: Decimal | None = Field(default=None, ge=MIN_DEBT_AMOUNT, decimal_places=2)
    assigned_manager_id: UUID | None = None
    status: ClientStatus | None = None
    engagement_stage: EngagementStage | None = None
    procedure_stage: ProcedureStage | None = None


class ClientResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    assigned_manager_id: UUID | None
    full_name: str
    phone: str
    contract_date: date
    debt_amount: Decimal
    status: ClientStatus
    engagement_stage: EngagementStage
    procedure_stage: ProcedureStage
    is_deleted: bool
    created_at: datetime
    updated_at: datetime
    has_overdue: bool | None = None


class ClientBriefResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    full_name: str
    phone: str
    contract_date: date
    status: ClientStatus
    engagement_stage: EngagementStage
    procedure_stage: ProcedureStage
    assigned_manager_id: UUID | None


class PricingTierSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    min_amount: Decimal
    max_amount: Decimal
    total_cost: Decimal
    total_months: int


class ClientDetailResponse(ClientResponse):
    installment_plan: "InstallmentPlanResponse | None" = None
    payment_schedule: list["PaymentScheduleResponse"] = []
    matched_tier: PricingTierSummary | None = None
    payments: list["PaymentResponse"] = []
    mandatory_payments: list["MandatoryPaymentResponse"] = []
    document_collection: "DocumentCollectionResponse | None" = None


from app.schemas.installment_plan import InstallmentPlanResponse  # noqa: E402
from app.schemas.mandatory_payment import MandatoryPaymentResponse  # noqa: E402
from app.schemas.payment import PaymentResponse  # noqa: E402
from app.schemas.payment_schedule import PaymentScheduleResponse  # noqa: E402

from app.schemas.document_collection import DocumentCollectionResponse  # noqa: E402

ClientDetailResponse.model_rebuild()
