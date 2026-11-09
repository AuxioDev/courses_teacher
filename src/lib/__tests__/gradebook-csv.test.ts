import { describe, expect, it } from "vitest";
import type { GradebookColumn, GradebookRow } from "../data";
import { gradebookCsv } from "../gradebook-csv";

const labels = { student: "Student", average: "Average", final: "Final", left: "Left the group", types: { quiz: "Quiz", homework: "Homework" } };
const col = (key: string, sortAt: string, over: Partial<GradebookColumn> = {}): GradebookColumn => ({
  key, date: "x", sortAt: Date.parse(sortAt), type: "quiz", weight: 2, title: null, href: null, homeworkId: null, ...over,
});
const row = (name: string, cells: GradebookRow["cells"], over: Partial<GradebookRow> = {}): GradebookRow => ({
  id: name, name, enrolled: true, average: null, finalGrade: null, cells, ...over,
});
const lines = (csv: string) => csv.slice(1).trimEnd().split("\r\n");

describe("gradebookCsv", () => {
  it("writes ISO dates, mark types with weight, averages and a BOM", () => {
    const csv = gradebookCsv(
      {
        columns: [col("a", "2026-11-09T10:00:00Z"), col("b", "2026-11-12T10:00:00Z", { type: "homework", weight: 1, title: "Essay" })],
        rows: [row("Ali", { a: { markId: "1", value: 85.46, comment: null }, b: { markId: "2", value: 90, comment: null } }, { average: 88.2 })],
        showFinal: false,
      },
      labels,
      "Asia/Baku",
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(lines(csv)).toEqual(["Student,2026-11-09 · Quiz ×2,2026-11-12 · Homework ×1 · Essay,Average", "Ali,85.5,90,88.2"]);
  });

  it("leaves empty cells empty, and adds the Final column only when grades are published", () => {
    const base = { columns: [col("a", "2026-11-09T10:00:00Z")], rows: [row("Vera", {}, { average: null, finalGrade: 91.25 })] };
    expect(lines(gradebookCsv({ ...base, showFinal: false }, labels, "UTC"))[1]).toBe("Vera,,");
    expect(lines(gradebookCsv({ ...base, showFinal: true }, labels, "UTC"))).toEqual(["Student,2026-11-09 · Quiz ×2,Average,Final", "Vera,,,91.3"]);
  });

  it("uses the teacher's timezone to pick the day", () => {
    const g = { columns: [col("a", "2026-11-09T21:30:00Z")], rows: [], showFinal: false };
    expect(lines(gradebookCsv(g, labels, "Asia/Baku"))[0]).toContain("2026-11-10");
    expect(lines(gradebookCsv(g, labels, "UTC"))[0]).toContain("2026-11-09");
  });

  it("marks students who left and escapes formulas and commas in names", () => {
    const csv = gradebookCsv(
      { columns: [], rows: [row("=cmd|' /C calc'!A0", {}), row("Smith, Jo", {}, { enrolled: false })], showFinal: false },
      labels,
      "UTC",
    );
    const [, first, second] = lines(csv);
    expect(first.startsWith("'=")).toBe(true);
    expect(second).toBe('"Smith, Jo (Left the group)",');
  });
});
