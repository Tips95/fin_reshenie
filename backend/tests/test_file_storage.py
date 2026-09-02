from io import BytesIO
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import HTTPException, UploadFile

from app.core.config import settings
from app.services import file_storage


@pytest.fixture(autouse=True)
def temp_upload_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path / "uploads"))
    yield


@pytest.mark.asyncio
async def test_read_and_validate_pdf_accepts_valid_file() -> None:
    upload = UploadFile(
        filename="passport.pdf",
        file=BytesIO(b"%PDF-1.4 test content"),
        headers={"content-type": "application/pdf"},
    )
    content, filename = await file_storage.read_and_validate_pdf(upload)
    assert content.startswith(b"%PDF")
    assert filename == "passport.pdf"


@pytest.mark.asyncio
async def test_read_and_validate_pdf_rejects_non_pdf() -> None:
    upload = UploadFile(
        filename="passport.pdf",
        file=BytesIO(b"not-a-pdf"),
        headers={"content-type": "application/pdf"},
    )
    with pytest.raises(HTTPException) as exc:
        await file_storage.read_and_validate_pdf(upload)
    assert exc.value.status_code == 422


def test_attachment_content_disposition_includes_ascii_and_utf8_filename() -> None:
    from urllib.parse import unquote

    header = file_storage.attachment_content_disposition("Иск (копия).pdf")
    assert 'filename="document.pdf"' in header
    assert header.isascii()
    encoded = header.split("filename*=UTF-8''", 1)[1]
    assert unquote(encoded) == "Иск (копия).pdf"


def test_attachment_content_disposition_keeps_ascii_name() -> None:
    header = file_storage.attachment_content_disposition("claim.pdf")
    assert 'filename="claim.pdf"' in header
    assert "filename*=UTF-8''claim.pdf" in header


def test_save_and_delete_roundtrip() -> None:
    org_id = uuid4()
    client_id = uuid4()
    key = file_storage.retail_client_passport_key(org_id, client_id)
    file_storage.save_bytes(key, b"%PDF-1.4")
    path = file_storage.resolve_storage_path(key)
    assert path.exists()
    file_storage.delete_storage_key(key)
    assert not path.exists()


@pytest.mark.asyncio
async def test_read_and_validate_document_accepts_pdf() -> None:
    upload = UploadFile(
        filename="isk.pdf",
        file=BytesIO(b"%PDF-1.4 civil case"),
        headers={"content-type": "application/pdf"},
    )
    content, filename, content_type = await file_storage.read_and_validate_document(upload)
    assert filename == "isk.pdf"
    assert content_type == "application/pdf"
    assert content.startswith(b"%PDF")
