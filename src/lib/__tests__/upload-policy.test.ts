import { describe, expect, it } from "vitest";
import {
  ALLOWED_TYPES,
  contentMatchesExtension,
  contentTypeFor,
  extensionOf,
  formatBytes,
  isPreviewable,
  MAX_FILE_BYTES,
} from "../upload-policy";

const bytes = (...b: number[]) => new Uint8Array(b);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d);
const JPG = bytes(0xff, 0xd8, 0xff, 0xe0);
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04);
const OLE = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
const EXE = bytes(0x4d, 0x5a, 0x90, 0x00); // "MZ"

describe("file names", () => {
  it("extracts lowercase extensions", () => {
    expect(extensionOf("Homework.PDF")).toBe("pdf");
    expect(extensionOf("a.b.c.docx")).toBe("docx");
    expect(extensionOf("noextension")).toBe("");
    expect(extensionOf("trailing.")).toBe("");
  });
  it("derives the content type from the extension only", () => {
    expect(contentTypeFor("x.PNG")).toBe("image/png");
    expect(contentTypeFor("x.exe")).toBeNull();
    expect(contentTypeFor("x.html")).toBeNull();
    expect(contentTypeFor("x.svg")).toBeNull(); // SVG can carry scripts
    expect(contentTypeFor("x")).toBeNull();
  });
  it("never allows executable or script types", () => {
    for (const ext of ["exe", "sh", "js", "html", "htm", "svg", "php", "bat", "jar", "zip"]) {
      expect(ALLOWED_TYPES[ext]).toBeUndefined();
    }
  });
});

describe("content sniffing", () => {
  it("accepts content that matches its extension", () => {
    expect(contentMatchesExtension("a.pdf", PDF)).toBe(true);
    expect(contentMatchesExtension("a.png", PNG)).toBe(true);
    expect(contentMatchesExtension("a.JPG", JPG)).toBe(true);
    expect(contentMatchesExtension("a.docx", ZIP)).toBe(true);
    expect(contentMatchesExtension("a.xls", OLE)).toBe(true);
    expect(contentMatchesExtension("a.txt", new TextEncoder().encode("hello"))).toBe(true);
  });
  it("rejects a renamed executable", () => {
    for (const name of ["a.pdf", "a.png", "a.jpg", "a.docx", "a.doc", "a.txt"]) {
      expect(contentMatchesExtension(name, name === "a.txt" ? bytes(0x4d, 0x5a, 0, 0) : EXE)).toBe(false);
    }
  });
  it("rejects mismatched types and unknown extensions", () => {
    expect(contentMatchesExtension("a.pdf", PNG)).toBe(false);
    expect(contentMatchesExtension("a.png", PDF)).toBe(false);
    expect(contentMatchesExtension("a.exe", EXE)).toBe(false);
    expect(contentMatchesExtension("noext", PDF)).toBe(false);
  });
  it("rejects a webp that is only a RIFF container", () => {
    const wav = bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45);
    const webp = bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50);
    expect(contentMatchesExtension("a.webp", wav)).toBe(false);
    expect(contentMatchesExtension("a.webp", webp)).toBe(true);
  });
  it("tolerates empty files without throwing", () => {
    expect(contentMatchesExtension("a.pdf", new Uint8Array())).toBe(false);
  });
});

describe("helpers", () => {
  it("only previews safe types inline", () => {
    expect(isPreviewable("application/pdf")).toBe(true);
    expect(isPreviewable("image/png")).toBe(true);
    expect(isPreviewable("image/svg+xml")).toBe(false);
    expect(isPreviewable("text/html")).toBe(false);
  });
  it("formats sizes", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(MAX_FILE_BYTES)).toBe("10.0 MB");
  });
});
