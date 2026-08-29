"use client";

import { useMemo, useState } from "react";
import {
  buildSingleStreamStudentClasses,
  hasStudentMultiStreamClasses,
  studentClassroomDisplayLabel,
  type StudentClassroomOption,
} from "@/lib/studentClassroomPresentation";

type Props = {
  classes: StudentClassroomOption[];
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  compact?: boolean;
  emptyLabel?: string;
  showModeHint?: boolean;
};

export default function StudentClassSelect({
  classes,
  name,
  value,
  defaultValue = "",
  onValueChange,
  required = false,
  disabled = false,
  compact = false,
  emptyLabel = "Choose class…",
  showModeHint = false,
}: Props) {
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selectedValue = controlled ? value ?? "" : internalValue;

  const selectedIsStream = useMemo(
    () => Boolean(selectedValue && classes.find((cls) => cls.id === selectedValue)?.arm?.trim()),
    [classes, selectedValue]
  );

  const [showMultiStream, setShowMultiStream] = useState(selectedIsStream);
  const canToggleMultiStream = useMemo(() => hasStudentMultiStreamClasses(classes), [classes]);

  const visibleClasses = useMemo(() => {
    if (!canToggleMultiStream || showMultiStream) return classes;
    return buildSingleStreamStudentClasses(classes, selectedValue || null);
  }, [classes, canToggleMultiStream, selectedValue, showMultiStream]);

  const selectClasses = [
    "w-full border border-white/10 bg-[#07111F] text-sm text-[#F7F4ED] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/25",
    compact ? "rounded-lg px-3 py-2" : "mt-1 rounded-xl px-3 py-2",
  ].join(" ");

  function updateValue(next: string) {
    if (!controlled) setInternalValue(next);
    onValueChange?.(next);
  }

  return (
    <div className="min-w-0 space-y-1.5">
      <select
        name={name}
        value={selectedValue}
        onChange={(event) => updateValue(event.target.value)}
        required={required}
        disabled={disabled}
        className={selectClasses}
      >
        <option value="">{emptyLabel}</option>
        {visibleClasses.map((cls) => (
          <option key={cls.id} value={cls.id}>
            {studentClassroomDisplayLabel(cls)}
          </option>
        ))}
      </select>

      {canToggleMultiStream ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="inline-flex min-h-7 cursor-pointer items-center gap-2 text-[11px] text-[#C9CDD6]">
            <input
              type="checkbox"
              checked={showMultiStream}
              onChange={(event) => {
                const next = event.target.checked;
                setShowMultiStream(next);

                if (!next && selectedValue) {
                  const singleStreamIds = new Set(
                    buildSingleStreamStudentClasses(classes, selectedValue).map((cls) => cls.id)
                  );
                  if (!singleStreamIds.has(selectedValue)) updateValue("");
                }
              }}
              disabled={disabled}
              className="h-4 w-4 rounded border-white/20 bg-[#07111F]"
            />
            Show multistream
          </label>
          {showModeHint ? (
            <span className="text-[10px] text-[#8F98A8]">
              {showMultiStream ? "Arms are visible." : "Single-stream classes shown by default."}
            </span>
          ) : null}
        </div>
      ) : showModeHint ? (
        <p className="text-[10px] text-[#8F98A8]">Single-stream classes.</p>
      ) : null}
    </div>
  );
}
