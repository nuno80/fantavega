export const MAX_EXCEL_UPLOAD_BYTES = 10 * 1024 * 1024;

const ALLOWED_EXCEL_MIME_TYPES = new Set([
  "application/CDFV2",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const ALLOWED_EXCEL_EXTENSIONS = new Set([".xls", ".xlsx"]);

interface ExcelUploadMetadata {
  name: string;
  type: string;
  size: number;
}

interface ExcelUploadError {
  status: 413 | 415;
  error: string;
}

export function validateExcelUpload(file: ExcelUploadMetadata): ExcelUploadError | null {
  if (file.size > MAX_EXCEL_UPLOAD_BYTES) {
    return { status: 413, error: "File too large. Maximum allowed size is 10 MiB." };
  }

  const extensionStart = file.name.lastIndexOf(".");
  const extension = extensionStart >= 0 ? file.name.slice(extensionStart).toLowerCase() : "";
  if (!ALLOWED_EXCEL_EXTENSIONS.has(extension) || !ALLOWED_EXCEL_MIME_TYPES.has(file.type)) {
    return { status: 415, error: "Unsupported file type. Upload an .xls or .xlsx file." };
  }

  return null;
}
