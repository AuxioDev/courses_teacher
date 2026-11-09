import type { GradebookColumn, GradebookRow } from "./data";
import { formatAverage } from "./grading";
import { csvFile } from "./csv";
import { dayKey } from "./dates";

type Labels = {
  student: string;
  average: string;
  final: string;
  left: string;
  types: Record<string, string>;
};

type Gradebook = { columns: GradebookColumn[]; rows: GradebookRow[]; showFinal: boolean };

const one = (n: number) => String(Math.round(n * 10) / 10);

// Dates are ISO (2026-11-16) rather than "16 Nov", so a spreadsheet can sort and filter them
// whatever language the teacher uses. Numbers use a dot so they stay numbers in the file.
export function gradebookCsv(gradebook: Gradebook, labels: Labels, timeZone: string) {
  const heading = (c: GradebookColumn) => {
    const day = dayKey(new Date(c.sortAt), timeZone);
    const kind = `${labels.types[c.type] ?? c.type} ×${one(c.weight)}`;
    return [day, kind, c.title].filter(Boolean).join(" · ");
  };
  const header = [labels.student, ...gradebook.columns.map(heading), labels.average, ...(gradebook.showFinal ? [labels.final] : [])];
  const rows = gradebook.rows.map((row) => [
    row.enrolled ? row.name : `${row.name} (${labels.left})`,
    ...gradebook.columns.map((c) => (row.cells[c.key] ? one(row.cells[c.key].value) : "")),
    row.average === null ? "" : formatAverage(row.average),
    ...(gradebook.showFinal ? [row.finalGrade === null ? "" : one(row.finalGrade)] : []),
  ]);
  return csvFile([header, ...rows]);
}
