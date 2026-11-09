// What students may upload. Shared by the browser (early checks, file picker)
// and the server (the checks that count).

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_HOMEWORK = 5;

// The content type is always derived from the extension, never taken from the browser.
export const ALLOWED_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
};

export const ACCEPT_ATTRIBUTE = Object.keys(ALLOWED_TYPES)
  .map((ext) => `.${ext}`)
  .join(",");

export function extensionOf(name: string) {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return match ? match[1].toLowerCase() : "";
}

export function contentTypeFor(name: string): string | null {
  return ALLOWED_TYPES[extensionOf(name)] ?? null;
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((b, i) => bytes[offset + i] === b);
}

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const FTYP = [0x66, 0x74, 0x79, 0x70];
const SIGNATURES: Record<string, (b: Uint8Array) => boolean> = {
  jpg: (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  jpeg: (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  png: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47]),
  webp: (b) => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8),
  heic: (b) => startsWith(b, FTYP, 4),
  heif: (b) => startsWith(b, FTYP, 4),
  pdf: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46]),
  doc: (b) => startsWith(b, OLE),
  xls: (b) => startsWith(b, OLE),
  ppt: (b) => startsWith(b, OLE),
  docx: (b) => startsWith(b, ZIP),
  xlsx: (b) => startsWith(b, ZIP),
  pptx: (b) => startsWith(b, ZIP),
  txt: (b) => !b.includes(0),
};

// Not virus scanning: it only proves the content is the type its name claims.
export function contentMatchesExtension(name: string, firstBytes: Uint8Array) {
  return SIGNATURES[extensionOf(name)]?.(firstBytes) ?? false;
}

// Browsers can show these inline; everything else downloads.
export function isPreviewable(contentType: string) {
  return ["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain"].includes(contentType);
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export type UploadErrorCode = "fileTooBig" | "fileType" | "tooManyFiles" | "uploadFailed" | "alreadyGraded" | "termLocked" | "homeworkNotFound";
