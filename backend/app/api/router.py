from fastapi import APIRouter, Depends

from app.api import (
    agents,
    analytics,
    audit_logs,
    auth,
    civil_cases,
    clients,
    dashboard,
    document_collection,
    exports,
    funnel,
    installment_plans,
    mandatory_payments,
    operating_expenses,
    organizations,
    payment_schedules,
    payments,
    pricing_tiers,
    questionnaires,
    tasks,
    users,
)
from app.api.deps import forbid_agents

api_router = APIRouter()
# Удалённым менеджерам открыты только auth, лиды и свой кабинет (/agents).
office_router = APIRouter(dependencies=[Depends(forbid_agents)])

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(agents.router, prefix="/agents", tags=["agents"])
api_router.include_router(
    questionnaires.router,
    prefix="/questionnaires",
    tags=["questionnaires"],
)

office_router.include_router(audit_logs.router, prefix="/audit-logs", tags=["audit-logs"])
office_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
office_router.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
office_router.include_router(funnel.router, prefix="/funnel", tags=["funnel"])
office_router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
office_router.include_router(organizations.router, prefix="/organizations", tags=["organizations"])
office_router.include_router(users.router, prefix="/users", tags=["users"])
office_router.include_router(pricing_tiers.router, prefix="/pricing-tiers", tags=["pricing-tiers"])
office_router.include_router(
    operating_expenses.router,
    prefix="/operating-expenses",
    tags=["operating-expenses"],
)
office_router.include_router(exports.router, prefix="/exports", tags=["exports"])
office_router.include_router(clients.router, prefix="/clients", tags=["clients"])
office_router.include_router(
    document_collection.router,
    prefix="/clients",
    tags=["document-collection"],
)
office_router.include_router(
    mandatory_payments.router,
    prefix="/clients",
    tags=["mandatory-payments"],
)
office_router.include_router(
    installment_plans.router,
    prefix="/clients",
    tags=["installment-plans"],
)
office_router.include_router(
    payment_schedules.router,
    prefix="/payment-schedule",
    tags=["payment-schedule"],
)
office_router.include_router(payments.router, prefix="/payments", tags=["payments"])
office_router.include_router(
    civil_cases.router,
    prefix="/civil-cases",
    tags=["civil-cases"],
)

api_router.include_router(office_router)
