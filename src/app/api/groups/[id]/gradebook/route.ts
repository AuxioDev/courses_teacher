import { NextResponse } from "next/server";
import { getTeacherOrNull } from "@/lib/auth";
import { loadGradebook } from "@/lib/data";
import { gradebookCsv } from "@/lib/gradebook-csv";
import { getDictionary } from "@/i18n";
import { defaultLocale, hasLocale } from "@/i18n/config";

// The gradebook the page shows, as a file that opens in Excel. Only for the group's own teacher.
export async function GET(request: Request, { params }: RouteContext<"/api/groups/[id]/gradebook">) {
  const teacher = await getTeacherOrNull();
  if (!teacher) return new NextResponse(null, { status: 401 });

  const { id } = await params;
  const gradebook = await loadGradebook(teacher, id);
  if (!gradebook) return new NextResponse(null, { status: 404 });

  const lang = new URL(request.url).searchParams.get("lang");
  const t = getDictionary(hasLocale(lang) ? lang : defaultLocale);
  const body = gradebookCsv(gradebook, { ...t.gradebook, types: t.marks.type }, teacher.timezone);
  const filename = `gradebook-${gradebook.name}`.replace(/[^\p{L}\p{N}_-]+/gu, "-");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}.csv`,
      "Cache-Control": "no-store",
    },
  });
}
