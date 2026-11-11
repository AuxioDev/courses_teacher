// The Teacher app only reads what students handed in: from the shared Blob store, or the Diary's folder in development.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const blob = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@vercel/blob", () => blob);

import { readObject } from "../storage";

const root = mkdtempSync(path.join(tmpdir(), "teacher-storage-"));
const KEY = "submissions/hw1/stu1/AbC_123-x.pdf";
const text = async (stream: ReadableStream<Uint8Array> | null) => (stream ? await new Response(stream).text() : null);

beforeEach(() => {
  vi.stubEnv("UPLOADS_DIR", root);
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
  vi.stubEnv("VERCEL", "");
  blob.get.mockReset();
  mkdirSync(path.join(root, "submissions/hw1/stu1"), { recursive: true });
  writeFileSync(path.join(root, KEY), "pdf bytes");
});
afterEach(() => vi.unstubAllEnvs());
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("readObject (local folder)", () => {
  it("reads a file the Diary stored, and says nothing was found for one it did not", async () => {
    expect(await text(await readObject(KEY))).toBe("pdf bytes");
    expect(await readObject("submissions/hw1/stu1/missing.pdf")).toBeNull();
  });

  it("refuses any key that is not one of the Diary's, before it touches the disk", async () => {
    writeFileSync(path.join(root, "secret.txt"), "do not serve");
    for (const bad of ["../secret.txt", "submissions/../secret.txt", "submissions/hw1/stu1/../../../secret.txt", "/etc/passwd", "submissions/a/b/c", "submissions/A B/c/d.pdf", ""]) {
      expect(await readObject(bad), bad).toBeNull();
    }
    expect(blob.get).not.toHaveBeenCalled();
  });
});

describe("readObject (Blob store)", () => {
  beforeEach(() => vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_x_y"));

  it("streams the file when the store has it", async () => {
    blob.get.mockResolvedValue({ statusCode: 200, stream: new Blob(["from blob"]).stream() });
    expect(await text(await readObject(KEY))).toBe("from blob");
    expect(blob.get).toHaveBeenCalledWith(KEY, { access: "private" });
  });

  it("answers nothing for a missing file or a not-modified answer", async () => {
    blob.get.mockResolvedValue(null);
    expect(await readObject(KEY)).toBeNull();
    blob.get.mockResolvedValue({ statusCode: 304, stream: null });
    expect(await readObject(KEY)).toBeNull();
  });

  it("does not ask the store for a key that is not one of the Diary's", async () => {
    expect(await readObject("../../x")).toBeNull();
    expect(blob.get).not.toHaveBeenCalled();
  });
});

describe("choosing where to read from", () => {
  it("refuses to quietly read the local disk on Vercel, where nothing would be there", async () => {
    vi.stubEnv("VERCEL", "1");
    await expect(readObject(KEY)).rejects.toThrow(/BLOB_READ_WRITE_TOKEN/);
  });
});
