import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { MAX_YEAR, MIN_YEAR, isCompleteDay } from "@/lib/date-time-field";

/**
 * Dátumové pole do filtra (len deň, bez času).
 *
 * Rozpísaný dátum si drží samo a von ho pustí, až keď je celý — alebo prázdny.
 * Inak by sa do filtra (a adresy) zapisoval každý medzistav roka a pole by
 * pri písaní preskakovalo. Zmena zvonka (napr. „Tento mesiac", „Vymazať")
 * sa do poľa prenesie hneď.
 */
export function DayFilterInput({
  value,
  onChange,
  className = "",
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (day: string) => void;
  className?: string;
  "aria-label"?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);

  const unfinished = draft !== "" && !isCompleteDay(draft);
  return (
    <Input
      type="date"
      aria-label={ariaLabel}
      min={`${MIN_YEAR}-01-01`}
      max={`${MAX_YEAR}-12-31`}
      className={`${className} ${unfinished ? "border-rose-400" : ""}`}
      title={unfinished ? "Dopíš celý dátum" : undefined}
      value={draft}
      onChange={(e) => {
        const v = e.target.value;
        setDraft(v);
        if (v === "" || isCompleteDay(v)) {
          if (v !== value) onChange(v);
        }
      }}
    />
  );
}
