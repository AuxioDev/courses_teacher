import { NextResponse } from "next/server";
import { getTeacherOrNull } from "@/lib/auth";
import { db } from "@/lib/db";
import { readObject } from "@/lib/storage";
import { isPreviewable } from "@/lib/upload-policy";

// Streams a handed-in homework file to the teacher of that group. Files a student has
// uploaded but not handed in yet (attemptId = null) are never served here.
export async function GET(request: Request, { params }: RouteContext<"/api/files/[id]">) {
  const teacher = await getTeacherOrNull();
  if (!teacher) return new NextResponse(null, { status: 401 });

  const { id } = await params;
  const file = await db.submissionFile.findFirst({
    where: { id, attemptId: { not: null }, homework: { group: { teacherId: teacher.id } } },
  });
  if (!file) return new NextResponse(null, { status: 404 });

  const stream = await readObject(file.storageKey);
  if (!stream) return new NextResponse(null, { status: 404 });

  const download = new URL(request.url).searchParams.has("download") || !isPreviewable(file.contentType);
  return new NextResponse(stream, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.size),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
