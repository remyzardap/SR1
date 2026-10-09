import { useState, type ReactNode } from "react";

/** Art for a tile, card or mini: an image url, or any drawn node. */
export type Art = string | ReactNode;

/**
 * A picture that fails quietly: when the file is missing (an engine image not shipped yet, a slow
 * network) the slot keeps its panel colour and shows `fallback` instead of a broken-image icon.
 */
export function Pic({ art, fallback = null, eager = false }: { art: Art; fallback?: ReactNode; eager?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (typeof art !== "string") return <>{art ?? fallback}</>;
  if (failed === art) return <>{fallback}</>;
  return (
    <img
      className="pic"
      src={art}
      alt=""
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      onError={() => setFailed(art)}
    />
  );
}
