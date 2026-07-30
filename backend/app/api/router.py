from fastapi import APIRouter

from app.api import (
    analytics,
    audit_logs,
    auth,
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
    tasks,
    users,
    retail,
)

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(audit_logs.router, prefix="/audit-logs", tags=["audit-logs"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
api_router.include_router(funnel.router, prefix="/funnel", tags=["funnel"])
api_router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
api_router.include_router(organizations.router, prefix="/organizations", tags=["organizations"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(pricing_tiers.router, prefix="/pricing-tiers", tags=["pricing-tiers"])
api_router.include_router(
    operating_expenses.router,
    prefix="/operating-expenses",
    tags=["operating-expenses"],
)
api_router.include_router(exports.router, prefix="/exports", tags=["exports"])
api_router.include_router(clients.router, prefix="/clients", tags=["clients"])
api_router.include_router(
    document_collection.router,
    prefix="/clients",
    tags=["document-collection"],
)
api_router.include_router(
    mandatory_payments.router,
    prefix="/clients",
    tags=["mandatory-payments"],
)
api_router.include_router(
    installment_plans.router,
    prefix="/clients",
    tags=["installment-plans"],
)
api_router.include_router(
    payment_schedules.router,
    prefix="/payment-schedule",
    tags=["payment-schedule"],
)
api_router.include_router(payments.router, prefix="/payments", tags=["payments"])
api_router.include_router(retail.router, prefix="/retail", tags=["retail"])
