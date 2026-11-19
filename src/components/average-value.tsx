import { averageBand, formatAverage } from "@/lib/grading";

// ▲ strong, ■ middling, ▼ low: the same three bands as the colour, so an average is readable without the colour.
// The bands themselves come from averageBand() in lib/grading.ts; nothing is calculated here.
const mark = { good: "▲", warn: "■", bad: "▼" } as const;

// The text of an average cell. The colour stays on the cell (it is already coloured by band).
export function AverageValue({ average }: { average: number | null }) {
  if (average === null) return <>—</>;
  return (
    <>
      <span aria-hidden="true" className="mr-1 align-[0.08em] text-[0.625rem]">
        {mark[averageBand(average)]}
      </span>
      {formatAverage(average)}
    </>
  );
}
