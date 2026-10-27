import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Check, LoaderCircle, PhoneCall, FlaskConical } from 'lucide-react';
import { ChatDraftSchema, type ChatDraft } from '@outreach/contracts';
import {
  api,
  ApiError,
  label,
  message,
  type Agent,
  type Attempt,
  type Campaign,
  type Page,
} from '../api';
import { Button, ErrorState } from '../components/ui';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '../components/shadcn/sheet';
import { useEvents } from '../hooks/useEvents';

const terminal = ['completed', 'failed', 'cancelled'];

export const reviewKey = (id: string) => ['campaign-review', id];
export function useReview(id: string, initial?: ChatDraft) {
  return useQuery({
    queryKey: reviewKey(id),
    queryFn: async () =>
      ChatDraftSchema.parse(await api(`/campaigns/${id}/review`)),
    placeholderData: initial,
  });
}
export function useOperation(id: string) {
  const campaign = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => api<Campaign>(`/campaigns/${id}`),
    refetchInterval: (q) =>
      terminal.includes(q.state.data?.status ?? '') ||
      (q.state.data && !q.state.data.launchKey)
        ? false
        : 1500,
  });
  const live =
    campaign.data?.launchKey && !terminal.includes(campaign.data.status);
  // SSE invalidates ['campaign', id]; polling above is the fallback.
  const feed = useEvents(live ? id : undefined);
  return { campaign, feed };
}

/** Persisted campaign status → operator-facing operation state. */
export function operationState(c?: Campaign, error?: unknown) {
  if (error instanceof ApiError && error.status === 409) return 'blocked';
  if (!c || !c.launchKey) return error ? 'failed' : 'pending';
  if (c.status === 'planned') return 'pending';
  return c.status;
}

export function ModePill({ mode }: { mode: 'live' | 'simulation' }) {
  return (
    <span className={`mode-pill ${mode}`}>
      {mode === 'live' ? (
        <PhoneCall size={12} aria-hidden />
      ) : (
        <FlaskConical size={12} aria-hidden />
      )}
      {mode === 'live' ? 'REAL CALL' : 'SIMULATION'}
    </span>
  );
}

export function OpState({ state }: { state: string }) {
  return (
    <span className="op-state" data-state={state}>
      {['pending', 'running'].includes(state) ? (
        <LoaderCircle size={12} className="spin" aria-hidden />
      ) : (
        <span className="op-dot" aria-hidden />
      )}
      {label(state)}
    </span>
  );
}

export function Operation({ id }: { id: string }) {
  const { campaign, feed } = useOperation(id);
  const calls = useQuery({
    queryKey: ['operation-calls', id],
    queryFn: () => api<Page<Attempt>>(`/campaigns/${id}/attempts`),
    enabled: !!campaign.data?.launchKey,
    refetchInterval: (q) =>
      terminal.includes(campaign.data?.status ?? '') &&
      q.state.data?.items.length
        ? false
        : 1500,
  });
  if (campaign.error) return <ErrorState error={campaign.error} />;
  if (!campaign.data?.launchKey) return null;
  const state = operationState(campaign.data);
  return (
    <div className="operation" role="status" aria-live="polite">
      <div className="operation-head">
        <ModePill mode={campaign.data.mode} />
        <OpState state={state} />
        {feed.state === 'reconnecting' && (
          <span className="muted small-text">Reconnecting…</span>
        )}
      </div>
      <p className="muted small-text">
        Operation <code>{id}</code>
      </p>
      {calls.data?.items.map((call) => (
        <CallResult key={call.id} call={call} />
      ))}
      <Link className="text-link" to={`/campaigns/${id}`}>
        Open live monitor
      </Link>
    </div>
  );
}

function CallResult({ call }: { call: Attempt }) {
  const result = useQuery({
    queryKey: ['chat-call-result', call.id],
    queryFn: () => api<Attempt>(`/calls/${call.id}`),
    refetchInterval: (q) =>
      !q.state.data?.analysis ||
      ['pending', 'processing'].includes(q.state.data.analysis.status) ||
      q.state.data.artifacts?.transcriptStatus === 'processing'
        ? 2000
        : false,
  });
  if (result.error) return <ErrorState error={result.error} />;
  return (
    <div className="operation-call">
      <p>
        {label(call.outcome ?? call.status)} ·{' '}
        <Link to={`/calls/${call.id}`}>Transcript and result</Link>
      </p>
      <p>
        {result.data?.analysis?.summary ?? 'Processing the saved call result…'}
      </p>
      {call.mode === 'simulation' && (
        <p className="muted small-text">
          Simulation fixture. No telephone was dialed; this is not the
          recipient’s answer.
        </p>
      )}
    </div>
  );
}

/** Plan review drawer. All facts are re-read from the server on open, so closing never changes target or mode. */
export function CallReviewDrawer({
  campaignId,
  initial,
  close,
}: {
  campaignId: string;
  initial?: ChatDraft;
  close: () => void;
}) {
  const client = useQueryClient();
  const review = useReview(campaignId, initial);
  const { campaign } = useOperation(campaignId);
  const agents = useQuery({
    queryKey: ['agents'],
    queryFn: () => api<Page<Agent>>('/agents'),
  });
  const [editing, setEditing] = useState(false);
  const [objective, setObjective] = useState('');
  const [mode, setMode] = useState<'live' | 'simulation'>('simulation');
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const draft = review.data;
  const target = draft?.target;
  const launched = !!campaign.data?.launchKey;
  const state = launched || error ? operationState(campaign.data, error) : null;
  const version = agents.data?.items.find(
    (a) => a.versionId === draft?.agentVersionId,
  );
  async function save() {
    setPending(true);
    setError(undefined);
    try {
      // PATCH re-prepares the single-recipient plan server-side (new snapshot hash).
      await api(`/campaigns/${campaignId}`, {
        method: 'PATCH',
        body: JSON.stringify({ objective, mode }),
      });
      await client.invalidateQueries({ queryKey: reviewKey(campaignId) });
      await client.invalidateQueries({ queryKey: ['campaign', campaignId] });
      setConfirmed(false);
      setEditing(false);
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }
  async function launch() {
    if (!draft || pending || launched) return;
    setPending(true);
    setError(undefined);
    try {
      await api(
        `/campaigns/${campaignId}/${draft.mode === 'simulation' ? 'simulate' : 'launch'}`,
        {
          method: 'POST',
          // Deterministic per campaign+mode: a retried click replays, never re-dials.
          headers: { 'Idempotency-Key': `call-${campaignId}-${draft.mode}` },
          body: JSON.stringify({
            confirmed: true,
            planSnapshotHash: draft.planSnapshotHash,
          }),
        },
      );
      await client.invalidateQueries({ queryKey: ['campaign', campaignId] });
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }
  const live = draft?.mode === 'live';
  const blockers = target?.blockers ?? [];
  const canLaunch =
    !!draft &&
    !pending &&
    !launched &&
    !editing &&
    draft.eligibleCount === 1 &&
    (!live || (confirmed && !blockers.length));
  return (
    <Sheet open onOpenChange={(open) => !open && close()}>
      <SheetContent
        side="right"
        className="review-drawer"
        data-mode={draft?.mode}
      >
        <header className="review-head">
          <SheetTitle>
            {live ? 'Confirm a real phone call' : 'Review simulation'}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Recipient, caller ID, agent and mode for this call plan. Nothing is
            dialed until you confirm.
          </SheetDescription>
          {draft && <ModePill mode={draft.mode} />}
        </header>
        <div className="review-body">
          {review.error && <ErrorState error={review.error} />}
          {draft && (
            <>
              <p className={`mode-banner ${draft.mode}`}>
                {live
                  ? 'This places a real telephone call to the recipient below.'
                  : 'Simulation only. No telephone will be dialed.'}
              </p>
              <dl className="review-facts">
                <div data-recipient>
                  <dt>Recipient</dt>
                  <dd>
                    <strong>{target?.name ?? 'No recipient'}</strong>
                    <span className="mono">{target?.destinationMasked}</span>
                  </dd>
                </div>
                <div>
                  <dt>Caller ID (outbound)</dt>
                  <dd className="mono">
                    {target?.callerIdMasked ?? 'Not configured'}
                  </dd>
                </div>
                <div>
                  <dt>Agent / version</dt>
                  <dd>
                    {draft.agentName}
                    {version ? ` · v${version.currentVersion}` : ''}
                  </dd>
                </div>
                <div>
                  <dt>Voice</dt>
                  <dd>
                    {target?.voiceId
                      ? `${target.voiceId}${target.voiceModel ? ` · ${target.voiceModel}` : ''}`
                      : 'Not synchronized'}{' '}
                    · {draft.agentLanguage}
                  </dd>
                </div>
                <div>
                  <dt>Mode</dt>
                  <dd>{live ? 'Real call' : 'Simulation'}</dd>
                </div>
                <div>
                  <dt>Target date</dt>
                  <dd>{target?.eventDate ?? 'Not specified'}</dd>
                </div>
                <div>
                  <dt>Call time</dt>
                  <dd>
                    {target?.scheduledAt ?? 'After confirmation'} ·{' '}
                    {target?.timezone}
                  </dd>
                </div>
                <div>
                  <dt>Objective</dt>
                  <dd>{draft.objective}</dd>
                </div>
                <div>
                  <dt>Eligibility</dt>
                  <dd>
                    {draft.eligibleCount} eligible · {draft.excludedCount}{' '}
                    excluded
                  </dd>
                </div>
              </dl>
              {!!blockers.length && (
                <div className="review-blockers" role="status">
                  <strong>Blockers</strong>
                  <ul>
                    {blockers.map((b) => (
                      <li key={b}>
                        <code>{b}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {target?.recordingNotice && (
                <p className="muted small-text">{target.recordingNotice}</p>
              )}
              {editing ? (
                <div className="review-edit">
                  <label htmlFor="review-mode">Execution mode</label>
                  <select
                    id="review-mode"
                    value={mode}
                    onChange={(e) =>
                      setMode(e.target.value === 'live' ? 'live' : 'simulation')
                    }
                  >
                    <option value="simulation">SIMULATION</option>
                    <option value="live">REAL CALL</option>
                  </select>
                  <label htmlFor="review-objective">Call objective</label>
                  <textarea
                    id="review-objective"
                    rows={4}
                    value={objective}
                    onChange={(e) => setObjective(e.target.value)}
                  />
                  <div className="button-row">
                    <Button onClick={() => void save()} disabled={pending}>
                      Save plan
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setEditing(false)}
                      disabled={pending}
                    >
                      Cancel edit
                    </Button>
                  </div>
                </div>
              ) : (
                !launched && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      setObjective(draft.objective);
                      setMode(draft.mode);
                      setEditing(true);
                    }}
                  >
                    Edit plan
                  </Button>
                )
              )}
              {live && !launched && !editing && (
                <label className="real-confirm">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  <span>
                    I confirm a real call to {target?.name} at{' '}
                    {target?.destinationMasked}.
                  </span>
                </label>
              )}
              {state && (
                <div
                  className="review-operation"
                  role="status"
                  aria-live="polite"
                >
                  <OpState state={state} />
                  {launched && (
                    <span className="small-text muted">
                      Operation <code>{campaignId}</code>
                    </span>
                  )}
                  {error != null && <p role="alert">{message(error)}</p>}
                  {launched && (
                    <Link className="text-link" to={`/campaigns/${campaignId}`}>
                      Open live monitor
                    </Link>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        <footer className="review-foot">
          <Button variant="ghost" onClick={close}>
            Back to conversation
          </Button>
          <Button
            variant={live ? 'destructive' : 'default'}
            onClick={() => void launch()}
            disabled={!canLaunch}
          >
            {launched ? (
              <>
                <Check size={15} aria-hidden /> Launched
              </>
            ) : pending ? (
              'Submitting…'
            ) : live ? (
              'Confirm real call'
            ) : (
              'Launch simulation'
            )}
          </Button>
        </footer>
      </SheetContent>
    </Sheet>
  );
}
