import { DateInput } from "@/components/date-input";
import { isCompleteDay } from "@/lib/date-time-field";

/**
 * Dátumové pole do filtra (len deň, bez času) so slovenským kalendárom.
 *
 * Do filtra (a adresy) ide len celý dátum s rozumným rokom (2000–2100) alebo
 * prázdna hodnota — rozpísaný dátum si pole drží samo, takže nepreskakuje.
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
  return (
    <DateInput
      className={className}
      aria-label={ariaLabel}
      value={value}
      invalid={value !== "" && !isCompleteDay(value)}
      onChange={(d) => {
        if (d === "" || isCompleteDay(d)) onChange(d);
      }}
    />
  );
}
