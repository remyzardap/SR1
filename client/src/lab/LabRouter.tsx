import * as React from "react";
import { Route, Switch } from "wouter";
import LabIndex from "./LabIndex";
import LabShell from "./LabShell";
import LabBrand from "./LabBrand";
import LabArt from "./LabArt";
import LabSettings from "./LabSettings";
import LabDitherEdge from "./LabDitherEdge";
import LabHalftoneFade from "./LabHalftoneFade";
import LabPaperGrain from "./LabPaperGrain";
import LabRegistrationMarks from "./LabRegistrationMarks";
import LabSlider from "./LabSlider";
import LabAnswer from "./LabAnswer";

import LabFiles from "./LabFiles";

import LabSession from "./LabSession";
import LabDone from "./LabDone";

import LabAgent from "./LabAgent";

import LabLanding from "./LabLanding";
import LabLogin from "./LabLogin";
import LabVerifyEmail from "./LabVerifyEmail";
import LabResetPassword from "./LabResetPassword";
import LabOnboarding from "./LabOnboarding";
import LabFirstRun from "./LabFirstRun";
import LabOffline from "./LabOffline";
import LabInstall from "./LabInstall";
import LabSplash from "./LabSplash";

import LabHome from "./LabHome";

import LabStudio from "./LabStudio";
import LabImageRun from "./LabImageRun";

import LabPageStates from "./LabPageStates";

export function LabRouter() {
  return (
    <Switch>
      <Route path="/__lab" component={LabIndex} />
      <Route path="/__lab/shell" component={LabShell} />
      <Route path="/__lab/brand" component={LabBrand} />
      <Route path="/__lab/art/dither-edge" component={LabDitherEdge} />
      <Route path="/__lab/art/halftone-fade" component={LabHalftoneFade} />
      <Route path="/__lab/art/paper-grain" component={LabPaperGrain} />
      <Route path="/__lab/art/registration-marks" component={LabRegistrationMarks} />
      <Route path="/__lab/art/slider" component={LabSlider} />
      <Route path="/__lab/answer" component={LabAnswer} />
      <Route path="/__lab/art" component={LabArt} />
      <Route path="/__lab/settings" component={LabSettings} />
      <Route path="/__lab/files" component={LabFiles} />
      <Route path="/__lab/session" component={LabSession} />
      <Route path="/__lab/done" component={LabDone} />
      <Route path="/__lab/agent" component={LabAgent} />
      <Route path="/__lab/landing" component={LabLanding} />
      <Route path="/__lab/login" component={LabLogin} />
      <Route path="/__lab/verify-email" component={LabVerifyEmail} />
      <Route path="/__lab/reset-password" component={LabResetPassword} />
      <Route path="/__lab/onboarding" component={LabOnboarding} />
      <Route path="/__lab/first-run" component={LabFirstRun} />
      <Route path="/__lab/offline" component={LabOffline} />
      <Route path="/__lab/install" component={LabInstall} />
      <Route path="/__lab/splash" component={LabSplash} />
      <Route path="/__lab/home" component={LabHome} />
      <Route path="/__lab/studio" component={LabStudio} />
      <Route path="/__lab/image-run" component={LabImageRun} />
      <Route path="/__lab/page-states" component={LabPageStates} />
    </Switch>
  );
}

export default LabRouter;
