import "server-only";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { get } from "@vercel/blob";

// Read-only access to the files students hand in through the Diary: the shared private
// Vercel Blob store in production, or the Diary's ./.uploads folder in development.

const KEY_PATTERN = /^submissions\/[a-z0-9]+\/[a-z0-9]+\/[A-Za-z0-9_-]+\.[a-z0-9]+$/;

function storageDriver() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  if (process.env.VERCEL) throw new Error("BLOB_READ_WRITE_TOKEN is required on Vercel");
  return "local";
}

export async function readObject(key: string): Promise<ReadableStream<Uint8Array> | null> {
  if (!KEY_PATTERN.test(key)) return null;
  if (storageDriver() === "blob") {
    const result = await get(key, { access: "private" });
    return result?.statusCode === 200 ? result.stream : null;
  }
  const file = path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.UPLOADS_DIR ?? ".uploads", key);
  try {
    await stat(file);
    return Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>;
  } catch {
    return null;
  }
}
