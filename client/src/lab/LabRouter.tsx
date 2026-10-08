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

import LabFiles from "./LabFiles";

import LabSession from "./LabSession";
import LabDone from "./LabDone";

import LabAgent from "./LabAgent";

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
      <Route path="/__lab/art" component={LabArt} />
      <Route path="/__lab/settings" component={LabSettings} />
      <Route path="/__lab/files" component={LabFiles} />
      <Route path="/__lab/session" component={LabSession} />
      <Route path="/__lab/done" component={LabDone} />
      <Route path="/__lab/agent" component={LabAgent} />
    </Switch>
  );
}

export default LabRouter;
