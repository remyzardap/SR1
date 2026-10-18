import * as React from "react";
import { useLocation } from "wouter";
import LabIndex from "./LabIndex";
import LabAnswer from "./LabAnswer";
import LabFiles from "./LabFiles";
import LabDone from "./LabDone";
import LabAgent from "./LabAgent";
import LabHome from "./LabHome";
import LabSession from "./LabSession";
import LabSettings from "./LabSettings";
import LabDocsStates from "./LabDocsStates";
import LabStudio from "./LabStudio";
import LabImageRun from "./LabImageRun";
import LabPageStates from "./LabPageStates";
import LabBrand from "./LabBrand";
import LabArt from "./LabArt";
import LabDitherEdge from "./LabDitherEdge";
import LabHalftoneFade from "./LabHalftoneFade";
import LabPaperGrain from "./LabPaperGrain";
import LabRegistrationMarks from "./LabRegistrationMarks";
import LabSlider from "./LabSlider";
import LabLanding from "./LabLanding";
import LabLogin from "./LabLogin";
import LabVerifyEmail from "./LabVerifyEmail";
import LabResetPassword from "./LabResetPassword";
import LabOnboarding from "./LabOnboarding";
import LabFirstRun from "./LabFirstRun";
import LabOffline from "./LabOffline";
import LabInstall from "./LabInstall";
import LabSplash from "./LabSplash";
import PolishPreview from "./PolishPreview";

export function LabRouter() {
  const [location] = useLocation();

  if (location === "/__lab" || location === "/__lab/") return <LabIndex />;
  if (location.startsWith("/__lab/polish/")) return <PolishPreview />;
  if (location.startsWith("/__lab/home")) return <LabHome />;
  if (location.startsWith("/__lab/answer")) return <LabAnswer />;
  if (location.startsWith("/__lab/agent")) return <LabAgent />;
  if (location.startsWith("/__lab/done")) return <LabDone />;
  if (location.startsWith("/__lab/files")) return <LabFiles />;
  if (location.startsWith("/__lab/session")) return <LabSession />;
  if (location.startsWith("/__lab/settings")) return <LabSettings />;
  if (location.startsWith("/__lab/docs-states")) return <LabDocsStates />;
  if (location.startsWith("/__lab/studio")) return <LabStudio />;
  if (location.startsWith("/__lab/image-run")) return <LabImageRun />;
  if (location.startsWith("/__lab/page-states")) return <LabPageStates />;
  if (location.startsWith("/__lab/brand")) return <LabBrand />;
  if (location.startsWith("/__lab/art/dither-edge")) return <LabDitherEdge />;
  if (location.startsWith("/__lab/art/halftone-fade")) return <LabHalftoneFade />;
  if (location.startsWith("/__lab/art/paper-grain")) return <LabPaperGrain />;
  if (location.startsWith("/__lab/art/registration-marks")) return <LabRegistrationMarks />;
  if (location.startsWith("/__lab/art/slider")) return <LabSlider />;
  if (location.startsWith("/__lab/art")) return <LabArt />;
  if (location.startsWith("/__lab/landing")) return <LabLanding />;
  if (location.startsWith("/__lab/login")) return <LabLogin />;
  if (location.startsWith("/__lab/verify-email")) return <LabVerifyEmail />;
  if (location.startsWith("/__lab/reset-password")) return <LabResetPassword />;
  if (location.startsWith("/__lab/onboarding")) return <LabOnboarding />;
  if (location.startsWith("/__lab/first-run")) return <LabFirstRun />;
  if (location.startsWith("/__lab/offline")) return <LabOffline />;
  if (location.startsWith("/__lab/install")) return <LabInstall />;
  if (location.startsWith("/__lab/splash")) return <LabSplash />;

  return <LabIndex />;
}

export default LabRouter;
