import * as React from "react";
import { Slider } from "@/components/art";

const round2 = (value: number) => Math.round(value * 100) / 100;

const captionStyle: React.CSSProperties = {
  fontSize: 11,
  display: "block",
  marginBottom: 4,
  color: "var(--quiet)",
};

type LabSliderRowProps = {
  /** Caption above the track, e.g. "Fine grid". */
  label: string;
  /** Accessible name for the slider itself. */
  ariaLabel: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** Suffix for the readout, e.g. " px". */
  unit?: string;
  decimals?: number;
  width?: number;
};

/**
 * Labelled themed slider row for the lab pages: `.mono` caption with a tabular-figures readout
 * above the shared <Slider>, so every lab control uses the design-system track instead of the
 * browser's default blue range input.
 */
export function LabSliderRow({
  label,
  ariaLabel,
  value,
  min,
  max,
  step,
  onChange,
  unit = "",
  decimals = 2,
  width = 150,
}: LabSliderRowProps) {
  return (
    <div style={{ minWidth: width }}>
      <span className="mono" style={captionStyle}>
        {label}: <span className="tnum">{value.toFixed(decimals) + unit}</span>
      </span>
      <Slider
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(next) => onChange(round2(next))}
        label={ariaLabel}
        style={{ width }}
      />
    </div>
  );
}

export default LabSliderRow;
