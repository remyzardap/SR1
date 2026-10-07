import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { formatDate } from "@/lib/utils";
import { PageTitle } from "@/components/chrome/PageTitle";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import { inviteLinkFor } from "@/lib/inviteCapture";
import { describeInviteUsage, inviteCodeStatus, sortCodesNewestFirst } from "@/lib/inviteCodes";
import { copyInviteLinkFromWindow, shareInviteLinkFromWindow } from "@/lib/inviteShare";
import "@/styles/invites.css";

const SHARED_NOTE = "Sent on its way.";
const COPIED_NOTE = "Copied. Paste it wherever you like.";

/**
 * Invite links (T-74 / F-12) — the owner's own screen, built for a thumb.
 *
 * Making a link and sending it have to be one thought each: make it, then share it
 * from the phone in their hand. The row data underneath is counters and timestamps,
 * so it is read out as "Not used yet" / "Used" / "Expired" / "Switched off" plus a
 * sentence about who has used it.
 *
 * Right to sign up is decided by the server, not here. `listCodes` and `generateCode`
 * answer "Access Denied" for anyone who is not an admin, and that answer is what shows.
 */
export default function Invites() {
  const utils = trpc.useUtils();
  const { data: codes, isLoading, error } = trpc.admin.betaInvites.listCodes.useQuery();
  const [link, setLink] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const create = trpc.admin.betaInvites.generateCode.useMutation({
    onSuccess: (data) => {
      setLink(inviteLinkFor(data.code, window.location.origin));
      setNote(null);
      utils.admin.betaInvites.listCodes.invalidate();
    },
  });

  const switchOff = trpc.admin.betaInvites.deactivateCode.useMutation({
    onSuccess: () => {
      toast.success("That link is off now.");
      utils.admin.betaInvites.listCodes.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  async function share() {
    if (!link) return;
    const outcome = await shareInviteLinkFromWindow(link);
    // A closed share sheet is not news, so it leaves the note alone.
    if (outcome.status === "shared") setNote(SHARED_NOTE);
    else if (outcome.status === "copied") setNote(COPIED_NOTE);
    else if (outcome.status === "unavailable") setNote(outcome.message);
  }

  async function copy() {
    if (!link) return;
    const outcome = await copyInviteLinkFromWindow(link);
    setNote(outcome.status === "copied" ? COPIED_NOTE : outcome.status === "unavailable" ? outcome.message : null);
  }

  const header = (
    <header className="sk-header">
      <div>
        <PageTitle className="skx-title-flush">Invite links</PageTitle>
        <p className="sk-sub">Make a link, then send it to someone you trust.</p>
      </div>
      <div className="sk-actions">
        <Link href="/admin" className="sk-btn sk-btn-ghost">Admin</Link>
      </div>
    </header>
  );

  if (error) {
    return (
      <div className="sk-page sk-invites">
        {header}
        <div className="sk-card sk-empty">
          <span className="sk-label">Access Denied</span>
          <p className="sk-empty-text">{error.message}</p>
        </div>
      </div>
    );
  }

  const rows = sortCodesNewestFirst(codes ?? []);

  return (
    <div className="sk-page sk-invites">
      {header}

      <div className="sk-stack">
        <section className="sk-card skx-inv-make">
          <span className="sk-label">Make a link</span>
          <p className="skx-inv-plain">A link lets one person in. You can switch it off again any time.</p>
          <button
            type="button"
            className="sk-btn skx-inv-make-btn"
            onClick={() => create.mutate({})}
            disabled={create.isPending}
            data-testid="button-make-invite"
          >
            <SutaeruIcon name="plus" className="skx-inv-btn-icon" />
            {create.isPending ? "Making a link..." : "Make a new link"}
          </button>
          {create.isError ? (
            <p className="skx-inv-error" role="alert">{create.error.message}</p>
          ) : null}
        </section>

        {link ? (
          <section className="sk-card skx-inv-link" aria-live="polite">
            <span className="sk-label">Your new link</span>
            <p className="skx-inv-link-url">{link}</p>
            <div className="skx-inv-send">
              <button
                type="button"
                className="sk-btn skx-inv-share"
                onClick={share}
                data-testid="button-share-invite"
              >
                <SutaeruIcon name="share" className="skx-inv-btn-icon" />
                Share
              </button>
              <button
                type="button"
                className="sk-btn sk-btn-ghost skx-inv-copy"
                onClick={copy}
                data-testid="button-copy-invite"
              >
                <SutaeruIcon name="copy" className="skx-inv-btn-icon" />
                Copy link
              </button>
            </div>
            {note ? <p className="skx-inv-note">{note}</p> : null}
          </section>
        ) : null}

        <section>
          <p className="sk-label skx-inv-list-label">Links you made</p>
          <div className="sk-card skx-inv-list">
            {isLoading ? (
              <p className="sk-empty-text">Loading links...</p>
            ) : rows.length === 0 ? (
              <p className="sk-empty-text">No links yet. Make one above and send it to someone.</p>
            ) : (
              rows.map((code, i) => {
                const status = inviteCodeStatus(code);
                return (
                  <div key={code.id} className={`skx-inv-row${i === 0 ? " is-first" : ""}`}>
                    <div className="skx-inv-row-main">
                      <p className="skx-inv-row-code">{code.code}</p>
                      <p className="skx-inv-row-meta">{describeInviteUsage(code)}</p>
                      <p className="skx-inv-row-when">
                        Made {formatDate(code.createdAt)}
                        {code.expiresAt ? ` · Runs out ${formatDate(code.expiresAt)}` : ""}
                      </p>
                    </div>
                    <div className="skx-inv-row-side">
                      <span className="skx-inv-status" data-state={status.state}>{status.label}</span>
                      {code.isActive !== false ? (
                        <button
                          type="button"
                          className="sk-btn sk-btn-ghost sk-btn-sm skx-inv-off"
                          onClick={() => switchOff.mutate({ id: code.id })}
                          disabled={switchOff.isPending}
                        >
                          Switch off
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
