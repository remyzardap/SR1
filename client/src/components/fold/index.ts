/* Shared Studio-standard parts. Every page folds its option groups with these. */
export { FoldSection, type FoldSectionProps } from "./FoldSection";
export { FoldGroup, FoldAllButton, useFoldGroup } from "./FoldGroup";
export {
  useFoldState,
  layoutFor,
  initialOpen,
  setSection,
  readFold,
  writeFold,
  foldKey,
  PHONE_MAX,
  DESKTOP_MIN,
  type FoldLayout,
  type FoldState,
  type FoldDefaults,
} from "./useFoldState";
export { PickTiles, Tick, tileWidth, tileHeight, type PickItem, type PickTilesProps } from "./PickTiles";
export { Showcase, TwoUp, type ShowcaseItem, type ShowcaseProps } from "./Showcase";
export { GoBar, type GoBarProps } from "./GoBar";
export { PromptField, type PromptFieldProps, type PromptRef } from "./PromptField";
export { LiveTag } from "./LiveTag";
export { Pic, type Art } from "./Pic";
