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
  onUpload: (file: File) => void | Promise<void>;
  onDownload: () => void | Promise<void>;
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
  onUpload,
  onDownload,
  onDelete,
  className,
}: PdfDocumentFieldProps) {
  return (
    <div className={cn("rounded-md border border-border bg-surface-muted p-2", className)}>
      {label ? <p className="text-xs font-medium text-foreground">{label}</p> : null}
      <p className={cn("truncate text-[11px] text-muted", label ? "mt-1" : undefined)}>
        {hasFile ? filename || "document.pdf" : "PDF не загружен"}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {hasFile ? (
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
            {uploading ? "Загрузка..." : hasFile ? "Заменить PDF" : "Загрузить PDF"}
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
