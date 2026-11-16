import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  SK_MONTHS,
  dateToDay,
  dayToDate,
  formatSkDate,
  parseSkDate,
  splitLocalDateTime,
} from "@/lib/sk-date";

/**
 * Vlastné dátumové polia namiesto `<input type="date">`.
 *
 * Kalendár prehliadača má jazyk prehliadača/systému, nie stránky — mnohým sa
 * ukazoval po česky. Tieto polia majú slovenský kalendár (pondelok prvý)
 * na každom zariadení a dátum sa dá aj napísať: `16. 11. 2026`, `16.11.26` …
 *
 * Do okolia sa posiela vždy len celý platný dátum (`RRRR-MM-DD`) alebo `""`.
 * Rozpísaný text si pole drží samo, takže pri písaní nič nepreskakuje.
 */

const FROM_YEAR = 2000;
const TO_YEAR = 2100;

export interface DateInputProps {
  /** `RRRR-MM-DD` alebo `""`. */
  value: string;
  onChange: (day: string) => void;
  /** Volá sa, keď človek výber dokončí (klik v kalendári, opustenie poľa). */
  onCommit?: (day: string) => void;
  disabled?: boolean;
  className?: string;
  /** Zvýrazní pole ako chybné (napr. nezmyselný rok zvonka). */
  invalid?: boolean;
  placeholder?: string;
  id?: string;
  "aria-label"?: string;
  title?: string;
}

export function DateInput({
  value,
  onChange,
  onCommit,
  disabled,
  className,
  invalid,
  placeholder = "d. m. rrrr",
  id,
  "aria-label": ariaLabel,
  title,
}: DateInputProps) {
  const [draft, setDraft] = useState(formatSkDate(value));
  const [open, setOpen] = useState(false);

  // Zmena zvonka (iné tlačidlo, načítanie dát) sa prenesie do poľa.
  useEffect(() => {
    setDraft(formatSkDate(value));
  }, [value]);

  const bad = invalid || (draft.trim() !== "" && parseSkDate(draft) === null);

  const commitText = () => {
    const t = draft.trim();
    if (t === "") {
      if (value !== "") onChange("");
      onCommit?.("");
      return;
    }
    const day = parseSkDate(t);
    if (!day) return; // ostane červené, nič sa nepošle
    setDraft(formatSkDate(day));
    if (day !== value) onChange(day);
    onCommit?.(day);
  };

  const selected = dayToDate(value);

  return (
    <div className={cn("relative flex items-center", className)}>
      <Input
        id={id}
        aria-label={ariaLabel}
        title={bad ? "Zadaj dátum v tvare 16. 11. 2026" : title}
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        disabled={disabled}
        value={draft}
        className={cn("h-full w-full pr-9", bad && "border-rose-400")}
        onChange={(e) => {
          const t = e.target.value;
          setDraft(t);
          // Celý dátum sa použije hneď (filter reaguje bez opustenia poľa);
          // rozpísaný čaká.
          const day = parseSkDate(t);
          if (day && /\d{4}\s*$/.test(t) && day !== value) onChange(day);
          if (t.trim() === "" && value !== "") onChange("");
        }}
        onBlur={commitText}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitText();
          }
        }}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label="Vybrať dátum z kalendára"
            className="absolute right-0.5 top-1/2 size-8 -translate-y-1/2 text-muted-foreground"
          >
            <CalendarDays className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            captionLayout="dropdown"
            startMonth={new Date(FROM_YEAR, 0)}
            endMonth={new Date(TO_YEAR, 11)}
            selected={selected}
            defaultMonth={selected}
            onSelect={(d) => {
              const day = d ? dateToDay(d) : "";
              setDraft(formatSkDate(day));
              if (day !== value) onChange(day);
              onCommit?.(day);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export interface DateTimeInputProps {
  /** `RRRR-MM-DDTHH:MM` (ako bývalý `datetime-local`) alebo `""`. */
  value: string;
  onChange: (value: string) => void;
  /** Volá sa po dokončení výberu dátumu alebo opustení poľa s časom. */
  onCommit?: (value: string) => void;
  /** Čas, ktorý sa doplní, keď sa vyberie len dátum. */
  defaultTime?: string;
  disabled?: boolean;
  className?: string;
  dateClassName?: string;
  timeClassName?: string;
}

/** Dátum + čas. Bez času sa doplní `defaultTime`, takže dátum sa nestratí. */
export function DateTimeInput({
  value,
  onChange,
  onCommit,
  defaultTime = "08:00",
  disabled,
  className,
  dateClassName,
  timeClassName,
}: DateTimeInputProps) {
  const [day, time] = splitLocalDateTime(value);
  const join = (d: string, t: string) => (d ? `${d}T${t || defaultTime}` : "");
  return (
    <div className={cn("flex gap-2", className)}>
      <DateInput
        className={cn("h-9 min-w-0 flex-1", dateClassName)}
        value={day}
        disabled={disabled}
        onChange={(d) => onChange(join(d, time))}
        onCommit={(d) => onCommit?.(join(d, time))}
      />
      <Input
        type="time"
        className={cn("w-24 shrink-0", timeClassName)}
        value={time}
        disabled={disabled || !day}
        title={day ? "Čas" : "Najprv vyber dátum"}
        onChange={(e) => onChange(join(day, e.target.value))}
        onBlur={(e) => onCommit?.(join(day, e.target.value))}
      />
    </div>
  );
}

/** Mesiac a rok (`RRRR-MM`) — dva výbery so slovenskými názvami mesiacov. */
export function MonthInput({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (month: string) => void;
  className?: string;
}) {
  const m = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  const now = new Date();
  const year = m ? Number(m[1]) : now.getFullYear();
  const month = m ? Number(m[2]) : now.getMonth() + 1;
  const years: number[] = [];
  for (let y = Math.min(year, now.getFullYear() - 5); y <= Math.max(year, now.getFullYear() + 2); y++) years.push(y);
  const emit = (y: number, mo: number) => onChange(`${y}-${String(mo).padStart(2, "0")}`);
  return (
    <div className={cn("flex gap-2", className)}>
      <Select value={String(month)} onValueChange={(v) => emit(year, Number(v))}>
        <SelectTrigger className="w-36" aria-label="Mesiac"><SelectValue /></SelectTrigger>
        <SelectContent>
          {SK_MONTHS.map((name, i) => (
            <SelectItem key={name} value={String(i + 1)}>{name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={String(year)} onValueChange={(v) => emit(Number(v), month)}>
        <SelectTrigger className="w-24" aria-label="Rok"><SelectValue /></SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>{y}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
