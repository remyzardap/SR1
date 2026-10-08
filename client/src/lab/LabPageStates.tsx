import * as React from "react";
import { LabLayout } from "./LabLayout";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import "@/styles/list-pages.css";

/**
 * Loading, empty and error states shared by Skills, Memories, Monitors and the
 * Admin lists. Static markup with the same classes the pages use; no network.
 */
export default function LabPageStates() {
  return (
    <LabLayout title="Page states">
      <div className="lp-page" style={{ maxWidth: 560 }}>
        <p className="lp-mono">Loading</p>
        <ul className="lp-rows" aria-label="Loading">
          {[0, 1].map((i) => (
            <li key={i} className="lp-row">
              <span className="lp-skeleton lp-tile" style={{ width: 56, height: 56, borderRadius: "var(--r-radius-thumb)" }} />
              <div className="lp-row-main">
                <span className="lp-skeleton" style={{ height: 20, width: "58%" }} />
                <span className="lp-skeleton" style={{ height: 14, width: "82%" }} />
                <span className="lp-skeleton" style={{ height: 11, width: "30%" }} />
              </div>
            </li>
          ))}
        </ul>
        <p className="lp-mono" style={{ marginTop: 28 }}>Empty</p>
        <section className="lp-empty">
          <span className="lp-empty-mark"><SutaeruIcon name="schedule" width={44} height={44} /></span>
          <h2 className="lp-empty-title">Nothing watched yet.</h2>
          <p className="lp-empty-text">Add a topic above and Sutaeru will keep an eye on it.</p>
          <button type="button" className="lp-btn">Add monitor</button>
        </section>
        <p className="lp-mono" style={{ marginTop: 28 }}>Error</p>
        <section className="lp-empty">
          <span className="lp-mono" style={{ color: "var(--r-alert)" }}>Error</span>
          <p className="lp-empty-text">Could not reach the server.</p>
          <button type="button" className="lp-btn lp-btn-sm">Try again</button>
        </section>
      </div>
    </LabLayout>
  );
}
