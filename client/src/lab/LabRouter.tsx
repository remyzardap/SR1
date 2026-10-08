import * as React from "react";
import { Route, Switch } from "wouter";
import LabIndex from "./LabIndex";
import LabShell from "./LabShell";
import LabBrand from "./LabBrand";
import LabArt from "./LabArt";
import LabDitherEdge from "./LabDitherEdge";
import LabHalftoneFade from "./LabHalftoneFade";
import LabPaperGrain from "./LabPaperGrain";
import LabRegistrationMarks from "./LabRegistrationMarks";
import LabSlider from "./LabSlider";
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
      <Route path="/__lab/page-states" component={LabPageStates} />
      <Route path="/__lab/art" component={LabArt} />
    </Switch>
  );
}

export default LabRouter;
