"use client";

import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";

type PdfDocumentFieldProps = {
  label: string;
  filename?: string | null;
  hasFile: boolean;
  uploading?: boolean;
  canUpload?: boolean;
  canDelete?: boolean;
  showDownload?: boolean;
  uploadLabel?: string;
  replaceLabel?: string;
  emptyLabel?: string;
  onUpload: (file: File) => void | Promise<void>;
  onDownload?: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  className?: string;
};

export function PdfDocumentField({
  label,
  filename,
  hasFile,
  uploading = false,
  canUpload = false,
  canDelete = false,
  showDownload = true,
  uploadLabel = "Загрузить PDF",
  replaceLabel = "Заменить PDF",
  emptyLabel = "PDF не загружен",
  onUpload,
  onDownload,
  onDelete,
  className,
}: PdfDocumentFieldProps) {
  const pickLabel = uploading ? "Загрузка..." : hasFile ? replaceLabel : uploadLabel;

  return (
    <div className={cn("rounded-md border border-border bg-surface-muted p-2", className)}>
      {label ? <p className="text-xs font-medium text-foreground">{label}</p> : null}
      <p className={cn("truncate text-[11px] text-muted", label ? "mt-1" : undefined)}>
        {hasFile ? filename || "document.pdf" : emptyLabel}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {hasFile && showDownload && onDownload ? (
          <Button type="button" variant="secondary" onClick={() => void onDownload()}>
            Скачать
          </Button>
        ) : null}
        {canUpload ? (
          <label className="interactive inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-foreground shadow-soft hover:border-border-strong hover:bg-surface-muted">
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void onUpload(file);
                }
                event.target.value = "";
              }}
            />
            {pickLabel}
          </label>
        ) : null}
        {canDelete && hasFile && onDelete ? (
          <Button type="button" variant="ghost" disabled={uploading} onClick={() => void onDelete()}>
            Удалить
          </Button>
        ) : null}
      </div>
    </div>
  );
}
