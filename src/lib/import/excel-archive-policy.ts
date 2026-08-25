const ZIP_LOCAL_FILE_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_END_OF_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_END_OF_DIRECTORY_BYTES = 22;
const ZIP_MAX_COMMENT_BYTES = 65_535;

export const MAX_EXCEL_ARCHIVE_ENTRIES = 256;
export const MAX_EXCEL_UNCOMPRESSED_BYTES = 40 * 1024 * 1024;

export class ExcelArchivePolicyError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ExcelArchivePolicyError";
  }
}

function invalidArchive(): never {
  throw new ExcelArchivePolicyError(
    "INVALID_WORKBOOK",
    "The uploaded Excel workbook has an invalid ZIP structure."
  );
}

function findEndOfDirectory(buffer: Buffer): number {
  const firstCandidate = buffer.length - ZIP_END_OF_DIRECTORY_BYTES;
  const lastCandidate = Math.max(0, firstCandidate - ZIP_MAX_COMMENT_BYTES);

  for (let offset = firstCandidate; offset >= lastCandidate; offset -= 1) {
    if (
      buffer.readUInt32LE(offset) === ZIP_END_OF_DIRECTORY_SIGNATURE &&
      buffer.readUInt16LE(offset + 20) ===
        buffer.length - offset - ZIP_END_OF_DIRECTORY_BYTES
    ) {
      return offset;
    }
  }

  return invalidArchive();
}

export function preflightXlsxArchive(buffer: Buffer): void {
  if (
    buffer.length < ZIP_END_OF_DIRECTORY_BYTES ||
    buffer.readUInt32LE(0) !== ZIP_LOCAL_FILE_SIGNATURE
  ) {
    return;
  }

  const endOffset = findEndOfDirectory(buffer);
  const diskNumber = buffer.readUInt16LE(endOffset + 4);
  const directoryDisk = buffer.readUInt16LE(endOffset + 6);
  const entriesOnDisk = buffer.readUInt16LE(endOffset + 8);
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  const directorySize = buffer.readUInt32LE(endOffset + 12);
  const directoryOffset = buffer.readUInt32LE(endOffset + 16);

  if (diskNumber !== 0 || directoryDisk !== 0 || entriesOnDisk !== entryCount) {
    invalidArchive();
  }
  if (entryCount > MAX_EXCEL_ARCHIVE_ENTRIES) {
    throw new ExcelArchivePolicyError(
      "TOO_MANY_ARCHIVE_ENTRIES",
      `Workbook archive exceeds the ${MAX_EXCEL_ARCHIVE_ENTRIES}-entry limit.`
    );
  }
  if (directoryOffset + directorySize !== endOffset) {
    invalidArchive();
  }

  let cursor = directoryOffset;
  let uncompressedBytes = 0;
  for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
    if (
      cursor + 46 > endOffset ||
      buffer.readUInt32LE(cursor) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE
    ) {
      invalidArchive();
    }

    const entryBytes = buffer.readUInt32LE(cursor + 24);
    if (entryBytes === 0xffff_ffff) {
      invalidArchive();
    }
    uncompressedBytes += entryBytes;
    if (uncompressedBytes > MAX_EXCEL_UNCOMPRESSED_BYTES) {
      throw new ExcelArchivePolicyError(
        "ARCHIVE_TOO_LARGE",
        `Workbook expands beyond the ${MAX_EXCEL_UNCOMPRESSED_BYTES}-byte archive limit.`
      );
    }

    const fileNameBytes = buffer.readUInt16LE(cursor + 28);
    const extraFieldBytes = buffer.readUInt16LE(cursor + 30);
    const commentBytes = buffer.readUInt16LE(cursor + 32);
    cursor += 46 + fileNameBytes + extraFieldBytes + commentBytes;
  }

  if (cursor !== directoryOffset + directorySize) {
    invalidArchive();
  }
}
