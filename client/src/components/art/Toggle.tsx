import { cn } from "@/lib/utils";

export interface ToggleProps {
  checked: boolean;
  onCheckedChange?: (next: boolean) => void;
  disabled?: boolean;
  /** Accessible name for the switch. */
  label: string;
  className?: string;
}

/** 52x30 switch: on = ink track with the paper knob right, off = grey with the knob left. */
export function Toggle({ checked, onCheckedChange, disabled, label, className }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      data-on={checked ? "true" : "false"}
      className={cn("art-toggle", className)}
      onClick={() => onCheckedChange?.(!checked)}
    >
      <span className="art-toggle-knob" />
    </button>
  );
}

export default Toggle;
