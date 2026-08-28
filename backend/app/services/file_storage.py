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


ALLOWED_DOCUMENT_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".webp", ".doc", ".docx"}
INVALID_DOCUMENT_MESSAGE = "Допустимы PDF, JPG, PNG, WEBP, DOC и DOCX"
CONTENT_TYPE_BY_EXTENSION = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
ALLOWED_DOCUMENT_CONTENT_TYPES = {
    "application/pdf",
    "application/x-pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/octet-stream",
}


def file_extension(filename: str) -> str:
    return Path(filename).suffix.lower()


def sanitize_document_filename(filename: str) -> str:
    cleaned = re.sub(r"[^\w.\- ()]", "_", filename.strip()) or "document"
    extension = file_extension(cleaned)
    if extension not in ALLOWED_DOCUMENT_EXTENSIONS:
        cleaned = f"{cleaned}.pdf"
    return cleaned[:200]


def content_type_for_filename(filename: str) -> str:
    return CONTENT_TYPE_BY_EXTENSION.get(file_extension(filename), "application/octet-stream")


def _document_magic_matches(content: bytes, extension: str) -> bool:
    if extension == ".pdf":
        return content.startswith(PDF_MAGIC)
    if extension in {".jpg", ".jpeg"}:
        return content.startswith(b"\xff\xd8\xff")
    if extension == ".png":
        return content.startswith(b"\x89PNG\r\n\x1a\n")
    if extension == ".webp":
        return content.startswith(b"RIFF") and content[8:12] == b"WEBP"
    if extension == ".docx":
        return content.startswith(b"PK")
    if extension == ".doc":
        return content.startswith(b"\xd0\xcf\x11\xe0")
    return False


async def read_and_validate_document(upload: UploadFile) -> tuple[bytes, str, str]:
    raw_name = upload.filename or "document.pdf"
    extension = file_extension(raw_name)
    if extension not in ALLOWED_DOCUMENT_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=INVALID_DOCUMENT_MESSAGE,
        )

    content_type = (upload.content_type or "").lower()
    if content_type and content_type not in ALLOWED_DOCUMENT_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=INVALID_DOCUMENT_MESSAGE,
        )

    content = await upload.read()
    limit = max_upload_bytes()
    if len(content) > limit:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=FILE_TOO_LARGE_MESSAGE.format(limit=settings.MAX_UPLOAD_SIZE_MB),
        )
    if not _document_magic_matches(content, extension):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=INVALID_DOCUMENT_MESSAGE,
        )

    filename = sanitize_document_filename(raw_name)
    return content, filename, content_type_for_filename(filename)


def civil_case_document_key(organization_id: UUID, case_id: UUID, document_id: UUID, filename: str) -> str:
    return f"{organization_id}/civil-cases/{case_id}/{document_id}/{filename}"


def delete_civil_case_files(organization_id: UUID, case_id: UUID) -> None:
    root = uploads_root().resolve()
    folder = (root / str(organization_id) / "civil-cases" / str(case_id)).resolve()
    if root not in folder.parents:
        return
    if folder.exists() and folder.is_dir():
        for child in folder.rglob("*"):
            if child.is_file():
                child.unlink()
        for child in sorted(folder.rglob("*"), reverse=True):
            if child.is_dir():
                child.rmdir()
        folder.rmdir()


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


def retail_client_guarantor_passport_key(organization_id: UUID, client_id: UUID) -> str:
    return f"{organization_id}/retail/clients/{client_id}/guarantor-passport.pdf"


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
