import * as React from "react";
import { Route, Switch } from "wouter";
import LabIndex from "./LabIndex";
import LabShell from "./LabShell";
import LabBrand from "./LabBrand";
import LabArt from "./LabArt";
import LabSession from "./LabSession";
import LabDone from "./LabDone";

export function LabRouter() {
  return (
    <Switch>
      <Route path="/__lab" component={LabIndex} />
      <Route path="/__lab/shell" component={LabShell} />
      <Route path="/__lab/brand" component={LabBrand} />
      <Route path="/__lab/art" component={LabArt} />
      <Route path="/__lab/session" component={LabSession} />
      <Route path="/__lab/done" component={LabDone} />
    </Switch>
  );
}

export default LabRouter;
