/** The three model choices the sheet shows. People never see a vendor or model name. */
export type ModelChoice = "auto" | "fast" | "best";

export const MODEL_CHOICES: ModelChoice[] = ["auto", "fast", "best"];

export interface SelectableModelLike {
  id: string;
  hasKey: boolean;
  /** "venice" marks the admin-only unrestricted models, which are not part of Fast and Best. */
  tier?: string;
}

/**
 * The model id a choice stands for, or undefined to let the router pick. The server lists its
 * chat model first and its pro model last, so Fast is the first one with a key and Best the last.
 */
export function modelIdFor(choice: string, models: SelectableModelLike[]): string | undefined {
  if (choice !== "fast" && choice !== "best") return undefined;
  const usable = models.filter((m) => m.hasKey && m.id !== "auto" && m.tier !== "venice");
  if (usable.length === 0) return undefined;
  return choice === "fast" ? usable[0].id : usable[usable.length - 1].id;
}
