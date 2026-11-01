import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { LINE, MUTED, SectionLabel, SURFACE } from "@/components/person/satchel";

export interface FilterOption {
  id: string;
  label: string;
  count?: number;
}

export interface FilterGroup {
  key: string;
  label: string;
  options: FilterOption[];
  value: string | string[];
  defaultValue: string;
  onSelect: (id: string) => void;
  multi?: boolean;
  collapsible?: boolean;
  caption?: string;
}

const BTN =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-3 text-sm lg:text-base font-semibold";

const SOLID =
  "border-[#a83818] bg-[#a83818] text-white dark:border-[#e07a52] dark:bg-[#e07a52] dark:text-[#1a1612]";
const QUIET =
  "border-[#f7ddd0] bg-[#f7ddd0] text-[#a83818] dark:border-[#e07a52]/15 dark:bg-[#e07a52]/15 dark:text-[#e07a52]";
const PLAIN = cn(SURFACE, LINE, "text-[#1a1612] dark:text-foreground");

export function FilterChip({
  selected,
  isDefault,
  onClick,
  children,
  testId,
  expanded,
}: {
  selected: boolean;
  isDefault?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId: string;
  expanded?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-expanded={expanded}
      data-testid={testId}
      className={cn(BTN, selected ? (isDefault ? QUIET : SOLID) : PLAIN)}
    >
      {children}
    </button>
  );
}

function optionLabel(o: FilterOption): string {
  return o.count === undefined ? o.label : `${o.label} (${o.count})`;
}

function selectedIds(g: FilterGroup): string[] {
  return Array.isArray(g.value) ? g.value : [g.value];
}

function Group({ group }: { group: FilterGroup }) {
  const selected = selectedIds(group);
  const hasNonDefault = selected.some((id) => id !== group.defaultValue);
  const [open, setOpen] = useState(hasNonDefault);
  const collapsible = group.collapsible === true;
  const showOptions = !collapsible || open;
  const current = group.options.filter((o) => selected.includes(o.id));
  const summary = current.length > 0 ? current.map((o) => o.label).join(", ") : group.label;

  return (
    <div
      role="group"
      aria-label={group.label}
      data-testid={`events-filter-${group.key}`}
      className={cn("rounded-2xl border px-2 py-1", SURFACE, LINE)}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <SectionLabel>{group.label}</SectionLabel>
        {collapsible && (
          <FilterChip
            selected={hasNonDefault}
            isDefault={!hasNonDefault}
            expanded={open}
            onClick={() => setOpen(!open)}
            testId={`events-filter-${group.key}-toggle`}
          >
            {summary}
            {open ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
          </FilterChip>
        )}
        {showOptions &&
          group.options.map((o) => (
            <FilterChip
              key={o.id}
              selected={selected.includes(o.id)}
              isDefault={o.id === group.defaultValue}
              onClick={() => group.onSelect(o.id)}
              testId={`events-filter-${group.key}-${o.id}`}
            >
              {optionLabel(o)}
            </FilterChip>
          ))}
      </div>
      {group.caption && <div className={cn("text-sm", MUTED)}>{group.caption}</div>}
    </div>
  );
}

export function EventsFilterBar({
  groups,
  shown,
  total,
  activeCount,
  onClear,
}: {
  groups: FilterGroup[];
  shown: number;
  total: number;
  activeCount: number;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start gap-2" data-testid="events-filter-bar">
      {groups.map((g) => (
        <Group key={g.key} group={g} />
      ))}
      {activeCount > 0 && (
        <div className="flex min-h-11 flex-wrap items-center gap-2">
          <span className={cn("text-sm lg:text-base", MUTED)} data-testid="events-filter-count">
            {`${shown} of ${total} shown`}
          </span>
          <button
            type="button"
            onClick={onClear}
            data-testid="events-filter-clear"
            className={cn(BTN, PLAIN)}
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
