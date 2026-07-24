"""Local filesystem storage for uploaded PDF documents."""

import re
from pathlib import Path
from uuid import UUID

from fastapi import HTTPException, UploadFile, status

from app.core.config import settings

PDF_MAGIC = b"%PDF"
INVALID_PDF_MESSAGE = "Допустим только файл PDF"
FILE_TOO_LARGE_MESSAGE = "Файл слишком большой (максимум {limit} МБ)"


def max_upload_bytes() -> int:
    return settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024


def uploads_root() -> Path:
    root = Path(settings.UPLOAD_DIR)
    root.mkdir(parents=True, exist_ok=True)
    return root


def sanitize_filename(filename: str) -> str:
    cleaned = re.sub(r"[^\w.\- ()]", "_", filename.strip())
    if not cleaned.lower().endswith(".pdf"):
        cleaned = f"{cleaned}.pdf" if cleaned else "document.pdf"
    return cleaned[:200]


async def read_and_validate_pdf(upload: UploadFile) -> tuple[bytes, str]:
    raw_name = upload.filename or "document.pdf"
    if not raw_name.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=INVALID_PDF_MESSAGE,
        )

    content_type = (upload.content_type or "").lower()
    if content_type and content_type not in {"application/pdf", "application/x-pdf"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=INVALID_PDF_MESSAGE,
        )

    content = await upload.read()
    limit = max_upload_bytes()
    if len(content) > limit:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=FILE_TOO_LARGE_MESSAGE.format(limit=settings.MAX_UPLOAD_SIZE_MB),
        )
    if not content.startswith(PDF_MAGIC):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=INVALID_PDF_MESSAGE,
        )

    return content, sanitize_filename(raw_name)


def retail_client_passport_key(organization_id: UUID, client_id: UUID) -> str:
    return f"{organization_id}/retail/clients/{client_id}/passport.pdf"


def retail_contract_signed_key(organization_id: UUID, contract_id: UUID) -> str:
    return f"{organization_id}/retail/contracts/{contract_id}/signed.pdf"


def save_bytes(storage_key: str, content: bytes) -> None:
    path = uploads_root() / storage_key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def resolve_storage_path(storage_key: str) -> Path:
    root = uploads_root().resolve()
    path = (root / storage_key).resolve()
    if root not in path.parents and path != root:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Файл не найден")
    return path


def delete_storage_key(storage_key: str | None) -> None:
    if not storage_key:
        return
    path = resolve_storage_path(storage_key)
    if path.exists():
        path.unlink()
