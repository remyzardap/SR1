/**
 * Invite links (T-74 / F-12) — the owner's own screen, built for a thumb.
 *
 * Making a link and sending it have to be one thought each: make it, then share it
 * from the phone in their hand. So the page is two folds: "Make a link", which holds the
 * button and the link it just produced, and "Links you made", whose header already says how
 * many are still open. The row data underneath is counters and timestamps, so it is read
 * out as "Not used yet" / "Used" / "Expired" / "Switched off" plus a sentence about who has
 * used it.
 *
 * Right to sign up is decided by the server, not here. `listCodes` and `generateCode`
 * answer "Access Denied" for anyone who is not an admin, and that answer is what shows.
 */
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
import { ListEmpty, ListFold, ListFolds, ListPage, Row, Rows, RowsSkeleton, useAutoOpen, useListFolds } from "@/components/list";
import { pickArt } from "@/lib/pickArt";


const SHARED_NOTE = "Sent on its way.";
const COPIED_NOTE = "Copied. Paste it wherever you like.";

const FOLD_IDS = ["make", "links"];

/** What the server's "Access Denied" answer looks like on this page. */
export function InvitesDenied({ message }: { message: string }) {
  return (
    <section className="view view-enter lst-page">
      <header className="head-row">
        <div>
          <PageTitle className="lst-title">Invite links</PageTitle>
        </div>
        <div className="lst-actions">
          <Link href="/admin" className="btn">
            Admin
          </Link>
        </div>
      </header>
      <p className="mono" style={{ margin: "26px 0 0" }}>
        Access Denied
      </p>
      <p className="lede" style={{ marginTop: 8 }}>
        {message}
      </p>
    </section>
  );
}

export default function Invites() {
  const utils = trpc.useUtils();
  const { data: codes, isLoading, error } = trpc.admin.betaInvites.listCodes.useQuery();
  const [link, setLink] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const fold = useListFolds("invites", FOLD_IDS, { first: "make" });
  // A fresh link must never be waiting behind a fold.
  useAutoOpen(fold, "make", !!link);

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

  if (error) {
    return <InvitesDenied message={error.message} />;
  }

  const rows = sortCodesNewestFirst(codes ?? []);
  const open = rows.filter((code) => inviteCodeStatus(code).state === "open" || inviteCodeStatus(code).state === "used").length;

  return (
    <ListPage
      title="Invite links"
      lede="Make a link, then send it to someone you trust."
      fold={fold}
      actions={
        <Link href="/admin" className="btn ghost">
          Admin
        </Link>
      }
    >
      <ListFolds fold={fold}>
        <ListFold id="make" index={1} fold={fold} label="Make a link" pick={link ? "Ready to send" : "One person per link"} mini={pickArt("tone-friendly")}>
          <div className="lst-form">
            {!link ? (
              <>
                <p className="lst-note">A link lets one person in. You can switch it off again any time.</p>
                <button
                  type="button"
                  className="btn lp-btn-self"
                  onClick={() => create.mutate({})}
                  disabled={create.isPending}
                  data-testid="button-make-invite"
                >
                  <SutaeruIcon name="plus" className="ico" />
                  {create.isPending ? "Making a link..." : "Make a new link"}
                </button>
                {create.isError ? (
                  <p className="set-alert" role="alert">
                    {create.error.message}
                  </p>
                ) : null}
              </>
            ) : (
              <div aria-live="polite" data-testid="panel-new-link">
                <Rows label="Your new link">
                  <Row
                    title={<span className="mono ink">{link}</span>}
                    meta={note ?? "Send it, or copy it and paste it wherever you like"}
                    art={pickArt("tone-friendly")}
                    actions={
                      <>
                        <button type="button" className="btn" onClick={share} data-testid="button-share-invite">
                          <SutaeruIcon name="share" className="ico" />
                          Share
                        </button>
                        <button type="button" className="btn ghost" onClick={copy} data-testid="button-copy-invite">
                          <SutaeruIcon name="copy" className="ico" />
                          Copy link
                        </button>
                      </>
                    }
                  />
                </Rows>
              </div>
            )}
          </div>
        </ListFold>

        <ListFold
          id="links"
          index={2}
          fold={fold}
          label="Links you made"
          pick={isLoading ? "Checking" : `${open} open · ${rows.length} made`}
          mini={pickArt("src-web")}
        >
          {isLoading ? (
            <RowsSkeleton rows={3} />
          ) : rows.length === 0 ? (
            <ListEmpty title="No links yet." text="Make one above and send it to someone." icon="share" />
          ) : (
            <Rows label="Links you made">
              {rows.map((code) => {
                const status = inviteCodeStatus(code);
                return (
                  <Row
                    key={code.id}
                    title={<span className="mono ink">{code.code}</span>}
                    meta={`${describeInviteUsage(code)} · Made ${formatDate(code.createdAt)}${code.expiresAt ? ` · Runs out ${formatDate(code.expiresAt)}` : ""}`}
                    quiet={status.state === "expired" || status.state === "switchedOff"}
                    status={
                      <span className={status.state === "open" || status.state === "used" ? "tag" : "tag quiet"}>
                        {status.label}
                      </span>
                    }
                    actions={
                      code.isActive !== false ? (
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => switchOff.mutate({ id: code.id })}
                          disabled={switchOff.isPending}
                        >
                          Switch off
                        </button>
                      ) : null
                    }
                  />
                );
              })}
            </Rows>
          )}
        </ListFold>
      </ListFolds>
    </ListPage>
  );
}
