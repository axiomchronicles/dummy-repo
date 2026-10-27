import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/shadcn/tabs';
import { Button } from '../components/ui';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCheck,
  FileBarChart2,
  Pause,
  Play,
  Radio,
  RefreshCw,
  ShieldCheck,
  StopCircle,
} from 'lucide-react';
import {
  api,
  command,
  date,
  label,
  type Attempt,
  type Campaign,
  type CampaignContact,
  type EventRecord,
  type Page,
} from '../api';
import {
  CallLink,
  Empty,
  ErrorState,
  Loading,
  Modal,
  ModeBadge,
  NextPage,
  PageHeading,
  Section,
  Status,
  Table,
} from '../components/ui';
import { useEvents } from '../hooks/useEvents';

export function EventTimeline({ events }: { events: EventRecord[] }) {
  return events.length ? (
    <ul className="timeline">
      {events.map((e) => (
        <li key={e.id}>
          <span className="timeline-dot" />
          <div>
            <strong>
              {label((e.type || e.action || 'Event').replaceAll('.', ' · '))}
            </strong>
            <small>
              {date(e.createdAt)} · event {e.id}
            </small>
            {typeof e.payload?.message === 'string' && (
              <p>{String(e.payload.message)}</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  ) : (
    <Empty title="Execution history starts here">
      Planning, launch and attempt events are recorded durably and replayed on
      reconnect.
    </Empty>
  );
}

export function CampaignDetail() {
  const id = useParams().id!;
  const [confirmation, setConfirmation] = useState<'start' | 'cancel' | null>(
    null,
  );
  const [cursor, setCursor] = useState('');
  const [eventCursor, setEventCursor] = useState('0');
  const client = useQueryClient();
  const campaign = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => api<Campaign>(`/campaigns/${id}`),
    refetchInterval: 2000,
  });
  const contacts = useQuery({
    queryKey: ['campaign-contacts', id, cursor],
    queryFn: () =>
      api<Page<CampaignContact>>(
        `/campaigns/${id}/contacts?limit=30${cursor ? `&cursor=${cursor}` : ''}`,
      ),
    refetchInterval: 2000,
  });
  const history = useQuery({
    queryKey: ['campaign-events', id, eventCursor],
    queryFn: () =>
      api<Page<EventRecord>>(
        `/campaigns/${id}/events?limit=100&after=${eventCursor}`,
      ),
    refetchInterval: 2000,
  });
  const feed = useEvents(id);
  const action = useMutation({
    mutationFn: (name: string) =>
      command(
        `/campaigns/${id}/${name}`,
        ['simulate', 'launch'].includes(name) ? { confirmed: true } : {},
        ['simulate', 'launch'].includes(name),
      ),
    onSuccess: async () => {
      setConfirmation(null);
      await client.invalidateQueries({ queryKey: ['campaign', id] });
      await client.invalidateQueries({ queryKey: ['campaign-events', id] });
    },
  });
  const report = useMutation({
    mutationFn: (format: 'csv' | 'xlsx') =>
      command(`/campaigns/${id}/reports`, { format }, true),
    onSuccess: () => client.invalidateQueries({ queryKey: ['reports'] }),
  });
  if (campaign.isPending) return <Loading label="Loading campaign…" />;
  if (!campaign.data)
    return (
      <ErrorState
        error={campaign.error}
        retry={() => void campaign.refetch()}
      />
    );
  const c = campaign.data;
  const counts = c.progress || {};
  const total = counts.total || 0;
  const finished =
    (counts.completed || 0) +
    (counts.excluded || 0) +
    (counts.cancelled || 0) +
    (counts.unknown || 0);
  const merged = [...(history.data?.items || []), ...feed.events]
    .filter((e, i, all) => all.findIndex((item) => item.id === e.id) === i)
    .sort((a, b) => Number(a.id) - Number(b.id));
  return (
    <>
      <Link className="text-link back-link" to="/campaigns">
        <ArrowLeft size={14} />
        All campaigns
      </Link>
      <PageHeading
        eyebrow="CAMPAIGN WORKSPACE"
        title={c.name}
        description={c.objective}
        action={
          <div className="button-row">
            <ModeBadge mode={c.mode} />
            <Status value={c.status} />
          </div>
        }
      />
      <div className="campaign-controls">
        <div className="button-row">
          {c.status === 'draft' && (
            <Button
              className="button primary"
              disabled={action.isPending}
              onClick={() => action.mutate('plan')}
            >
              <CheckCheck size={16} />
              {c.mode === 'simulation' ? 'Build local plan' : 'Build plan'}
            </Button>
          )}
          {c.status === 'planned' && (
            <>
              <Button
                className="button secondary"
                disabled={action.isPending}
                onClick={() => action.mutate('plan')}
              >
                <RefreshCw size={15} />
                Refresh plan
              </Button>
              <Button
                className="button primary"
                disabled={action.isPending}
                onClick={() => setConfirmation('start')}
              >
                <Play size={16} />
                {c.mode === 'simulation'
                  ? 'Run simulation'
                  : 'Review live launch'}
              </Button>
            </>
          )}
          {c.status === 'running' && (
            <Button
              className="button secondary"
              disabled={action.isPending}
              onClick={() => action.mutate('pause')}
            >
              <Pause size={16} />
              Pause new dispatches
            </Button>
          )}
          {c.status === 'paused' && (
            <Button
              className="button primary"
              disabled={action.isPending}
              onClick={() => action.mutate('resume')}
            >
              <Play size={16} />
              Resume
            </Button>
          )}
          {!['completed', 'cancelled', 'failed'].includes(c.status) && (
            <Button
              className="button ghost danger-text"
              disabled={action.isPending}
              onClick={() => setConfirmation('cancel')}
            >
              <StopCircle size={16} />
              Cancel campaign
            </Button>
          )}
        </div>
        <span
          className={`stream-status ${feed.state} monitor-state`}
          data-state={campaign.isRefetchError ? 'stale' : feed.state}
          role="status"
        >
          <Radio size={14} aria-hidden />
          {campaign.isRefetchError
            ? `Stale · last updated ${date(new Date(campaign.dataUpdatedAt).toISOString())}`
            : feed.state === 'connected'
              ? 'Live feed connected'
              : feed.state === 'reconnecting'
                ? 'Reconnecting · replay enabled'
                : 'Connecting to persisted feed'}
        </span>
      </div>
      {action.error && !confirmation && <ErrorState error={action.error} />}
      {c.status === 'paused' && (
        <div className="info-note">
          <Pause size={18} />
          <p>
            New dispatches are paused. Attempts already in progress may finish;
            their outcomes remain recorded.
          </p>
        </div>
      )}
      {c.status === 'cancelled' && (
        <div className="info-note">
          <StopCircle size={18} />
          <p>
            Pending work is invalidated. The current provider does not support
            active-call termination; any active attempt may finish.
          </p>
        </div>
      )}
      <div className="campaign-columns">
        <div>
          <Section
            title="Execution progress"
            subtitle={`${finished} of ${total} contacts resolved · from persisted records`}
          >
            <progress
              className="large-progress"
              max={Math.max(total, 1)}
              value={finished}
              aria-label={`${finished} of ${total} contacts resolved`}
            />
            <div className="stat-row" aria-label="Campaign counts">
              {(
                [
                  ['Eligible', c.plan?.eligibleCount ?? '—'],
                  ['Excluded', counts.excluded ?? 0],
                  ['Queued', (counts.pending || 0) + (counts.queued || 0)],
                  [
                    'Attempted',
                    (counts.calling || 0) +
                      (counts.completed || 0) +
                      (counts.unknown || 0),
                  ],
                  ['Connected', c.outcomes?.connected ?? 0],
                  ['Completed', counts.completed ?? 0],
                  ['Failed', c.outcomes?.failed ?? 0],
                  ['Busy', c.outcomes?.busy ?? 0],
                  ['No answer', c.outcomes?.no_answer ?? 0],
                ] as const
              ).map(([text, value]) => (
                <div key={text}>
                  <strong>{value}</strong>
                  <span>{text}</span>
                </div>
              ))}
            </div>
            <p className="stat-definitions">
              Attempted = contacts dispatched to the provider. Connected =
              attempts whose recorded outcome is connected. Failed, busy and no
              answer are recorded attempt outcomes.
            </p>
          </Section>
          <Tabs defaultValue="contacts" className="campaign-tabs">
            <TabsList variant="line" aria-label="Campaign workspace views">
              <TabsTrigger value="contacts">Contact outcomes</TabsTrigger>
              <TabsTrigger value="activity">Execution activity</TabsTrigger>
            </TabsList>
            <TabsContent value="contacts">
              <Section
                title="Contact outcomes"
                subtitle="Open a recorded attempt to inspect the answers and timeline."
              >
                {contacts.isPending ? (
                  <Loading />
                ) : contacts.error ? (
                  <ErrorState error={contacts.error} />
                ) : contacts.data.items.length ? (
                  <Table
                    headers={['Contact', 'Status', 'Outcome', 'Duration', '']}
                  >
                    {contacts.data.items.map((contact) => (
                      <tr key={contact.id}>
                        <td>
                          <strong>{contact.name || 'Unnamed contact'}</strong>
                          <small className="table-sub mono">
                            {contact.phone || '—'}
                          </small>
                        </td>
                        <td>
                          <Status value={contact.status} />
                        </td>
                        <td>{label(contact.outcome)}</td>
                        <td>
                          {typeof contact.durationSeconds === 'number'
                            ? `${contact.durationSeconds}s`
                            : '—'}
                        </td>
                        <td>
                          <CallLink id={contact.attemptId} />
                        </td>
                      </tr>
                    ))}
                  </Table>
                ) : (
                  <Empty title="No attempt has been dispatched">
                    Review the plan, then explicitly start this campaign.
                  </Empty>
                )}
                <NextPage
                  cursor={contacts.data?.nextCursor}
                  onNext={setCursor}
                />
              </Section>
            </TabsContent>
            <TabsContent value="activity">
              <Section
                title="Execution timeline"
                subtitle="Durable events, replayed after refresh and reconnect."
              >
                {history.error ? (
                  <ErrorState error={history.error} />
                ) : (
                  <>
                    <EventTimeline events={merged} />
                    <NextPage
                      cursor={
                        history.data?.items.length === 100
                          ? history.data.nextCursor
                          : null
                      }
                      onNext={setEventCursor}
                    />
                  </>
                )}
              </Section>
            </TabsContent>
          </Tabs>
        </div>
        <div>
          <Section
            title="Reviewed plan"
            subtitle={
              c.plan?.planner === 'deterministic-local'
                ? 'Deterministic local planner · no model API was called.'
                : c.plan
                  ? `Sarvam SDK planner${c.plan.model ? ` · ${c.plan.model}` : ''}`
                  : 'Review the campaign plan before execution.'
            }
          >
            {c.plan ? (
              <>
                <div className="plan-eligibility">
                  <div>
                    <strong>{c.plan.eligibleCount}</strong>
                    <span>Eligible contacts</span>
                  </div>
                  <div>
                    <strong>{c.plan.excludedCount}</strong>
                    <span>Excluded import rows</span>
                  </div>
                </div>
                <p className="plan-source-note small-text muted">
                  Duplicates and invalid import rows are excluded before unique
                  contacts are queued.
                </p>
                {c.plan.exclusions.length > 0 && (
                  <ul className="reason-list">
                    {c.plan.exclusions.map((item) => (
                      <li key={item.reason}>
                        <span>{label(item.reason)}</span>
                        <strong>{item.count}</strong>
                      </li>
                    ))}
                  </ul>
                )}
                <ol className="plan-steps">
                  {c.plan.steps.map((step) => (
                    <li key={step.name}>
                      <strong>{step.name}</strong>
                      <p>{step.description}</p>
                    </li>
                  ))}
                </ol>
                <dl className="policy-list">
                  <div>
                    <dt>Agent</dt>
                    <dd>{String(c.agentName || 'Version snapshot')}</dd>
                  </div>
                  <div>
                    <dt>Calling window</dt>
                    <dd>
                      {c.policy.windowStart}–{c.policy.windowEnd}
                      <small>{c.policy.timezone}</small>
                    </dd>
                  </div>
                  <div>
                    <dt>Concurrency</dt>
                    <dd>{c.policy.concurrency}</dd>
                  </div>
                  <div>
                    <dt>Budget cap</dt>
                    <dd>₹{(c.policy.budgetMinor / 100).toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt>Estimated reserve</dt>
                    <dd>
                      ₹{(c.plan.cost.estimatedTotalMinor / 100).toFixed(2)}
                    </dd>
                  </div>
                </dl>
                <p className="small-text muted">
                  {c.plan.cost.assumptions.join(' ')}
                </p>
              </>
            ) : (
              <Empty title="Build a local plan">
                Planning resolves eligibility and policy without calling a
                provider.
              </Empty>
            )}
          </Section>
          <Section
            title="Campaign reports"
            subtitle="Available once campaign outcomes are terminal; generated asynchronously."
          >
            <div className="button-row">
              <Button
                className="button secondary small"
                disabled={
                  report.isPending ||
                  !['completed', 'cancelled', 'failed'].includes(c.status)
                }
                onClick={() => report.mutate('csv')}
              >
                <FileBarChart2 size={15} />
                Generate CSV
              </Button>
              <Button
                className="button secondary small"
                disabled={
                  report.isPending ||
                  !['completed', 'cancelled', 'failed'].includes(c.status)
                }
                onClick={() => report.mutate('xlsx')}
              >
                Generate XLSX
              </Button>
            </div>
            {report.isSuccess && (
              <p className="success-note" role="status">
                Report request saved.{' '}
                <Link to="/reports">Follow generation and download →</Link>
              </p>
            )}
            {report.error && <ErrorState error={report.error} />}
            <Link className="text-link" to="/reports">
              View reports <ArrowLeft className="rotate" size={14} />
            </Link>
          </Section>
        </div>
      </div>
      {confirmation && (
        <Modal
          title={
            confirmation === 'cancel'
              ? 'Cancel pending campaign work?'
              : c.mode === 'live'
                ? 'Confirm live calling'
                : 'Confirm simulation'
          }
          close={() => setConfirmation(null)}
        >
          <ModeBadge mode={c.mode} />
          {confirmation === 'cancel' ? (
            <p>
              Pending dispatches will be invalidated. Active attempts may finish
              because provider termination is unavailable.
            </p>
          ) : (
            <>
              <p>
                {c.mode === 'simulation'
                  ? 'The deterministic mock provider will process real queued jobs and persist synthetic results. No phone is called.'
                  : 'This action requests real phone calls. Server configuration, authorized destinations, consent, calling window and budget must all pass.'}
              </p>
              <dl className="review-grid">
                <div>
                  <dt>Eligible contacts</dt>
                  <dd>{c.plan?.eligibleCount ?? 'Unknown'}</dd>
                </div>
                <div>
                  <dt>Excluded import rows</dt>
                  <dd>{c.plan?.excludedCount ?? 'Unknown'}</dd>
                </div>
                <div>
                  <dt>Policy</dt>
                  <dd>
                    {c.policy.timezone}
                    <small>
                      {c.policy.windowStart}–{c.policy.windowEnd}
                    </small>
                  </dd>
                </div>
                <div>
                  <dt>Budget cap</dt>
                  <dd>₹{(c.policy.budgetMinor / 100).toFixed(2)}</dd>
                </div>
              </dl>
              <p className="small-text muted">
                {c.plan?.cost.assumptions.join(' ')}
              </p>
              {c.mode === 'live' && (
                <div className="info-note">
                  <ShieldCheck size={19} />
                  <p>
                    Allowlisted destinations and webhook safeguards are enforced
                    on the server. Provider costs follow your configured
                    contract.
                  </p>
                </div>
              )}
            </>
          )}
          {action.error && <ErrorState error={action.error} />}
          <div className="button-row">
            <Button
              className="button secondary"
              onClick={() => setConfirmation(null)}
            >
              Back to review
            </Button>
            <Button
              className={`button ${confirmation === 'cancel' || c.mode === 'live' ? 'danger' : 'primary'}`}
              disabled={action.isPending}
              onClick={() =>
                action.mutate(
                  confirmation === 'cancel'
                    ? 'cancel'
                    : c.mode === 'live'
                      ? 'launch'
                      : 'simulate',
                )
              }
            >
              {action.isPending
                ? 'Submitting…'
                : confirmation === 'cancel'
                  ? 'Confirm cancellation'
                  : c.mode === 'live'
                    ? 'Confirm live launch'
                    : 'Confirm simulation'}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function CallInspector() {
  const id = useParams().id!;
  const query = useQuery({
    queryKey: ['call', id],
    queryFn: () => api<Attempt>(`/calls/${id}`),
    refetchInterval: (query) =>
      !query.state.data?.analysis ||
      ['pending', 'processing'].includes(query.state.data.analysis.status) ||
      query.state.data?.artifacts?.recordingStatus === 'processing' ||
      query.state.data?.artifacts?.transcriptStatus === 'processing'
        ? 1000
        : false,
  });
  if (query.isPending)
    return <Loading label="Loading authorized call detail…" />;
  if (query.error) return <ErrorState error={query.error} />;
  const call = query.data;
  const answers = call.analysis?.extractedFields || {};
  const transcript = call.analysis?.transcript;
  return (
    <>
      <Link
        className="text-link back-link"
        to={`/campaigns/${call.campaignId}`}
      >
        <ArrowLeft size={14} />
        Back to campaign
      </Link>
      <PageHeading
        eyebrow="CALL INSPECTOR"
        title={label(call.outcome) + ' attempt'}
        description="Connection status and business answers are separate. Missing answers remain unknown."
        action={
          <div className="button-row">
            <ModeBadge mode={call.mode === 'live' ? 'live' : 'simulation'} />
            <Status value={call.status} />
          </div>
        }
      />
      <div className="campaign-columns">
        <div>
          <Section
            title="Structured analysis"
            subtitle={
              call.analysis?.synthetic
                ? 'Synthetic mock analysis — development only.'
                : 'Actual recorded analysis for this attempt.'
            }
          >
            {call.analysis ? (
              <>
                <Status value={call.analysis.status} />
                <p className="small-text muted">
                  Summary source:{' '}
                  {call.analysis.summarySource === 'openai'
                    ? `OpenAI${call.analysis.summaryModel ? ` · ${call.analysis.summaryModel}` : ''}`
                    : call.analysis.summarySource === 'sarvam-sdk'
                      ? `Sarvam SDK${call.analysis.summaryModel ? ` · ${call.analysis.summaryModel}` : ''}`
                      : 'Local'}
                  {call.analysis.summaryFailureCode
                    ? ' · local fallback after model failure'
                    : ''}
                </p>
                <p className="analysis-summary">
                  {call.analysis.summary || 'No summary is available.'}
                </p>
                {Object.keys(answers).length ? (
                  <dl className="answers-list">
                    {Object.entries(answers).map(([key, value]) => (
                      <div key={key}>
                        <dt>{label(key)}</dt>
                        <dd>
                          {value == null ? (
                            <span className="muted">Unknown</span>
                          ) : typeof value === 'object' ? (
                            JSON.stringify(value)
                          ) : (
                            String(value)
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <Empty title="No extracted answers">
                    No answer has been recorded. Connection alone does not
                    establish a successful business outcome.
                  </Empty>
                )}
              </>
            ) : (
              <Empty title="Analysis is not available">
                The worker may still be processing, or this attempt produced no
                conversation.
              </Empty>
            )}
          </Section>
          <Section
            title="Call recording"
            subtitle="Provider audio linked to this interaction."
          >
            {call.artifacts?.recordingStatus === 'available' ? (
              <audio
                controls
                preload="none"
                src={`/api/v1/calls/${call.id}/recording`}
                aria-label="Call recording"
              />
            ) : (
              <p>
                {call.mode === 'simulation'
                  ? 'Simulation: no telephone recording.'
                  : `Recording ${call.artifacts?.recordingStatus ?? 'unavailable'}`}
              </p>
            )}
            {call.artifacts?.failureCode && (
              <p className="muted">{call.artifacts.failureCode}</p>
            )}
          </Section>
          <Section
            title="Conversation transcript"
            subtitle="Visible only when stored and authorized."
          >
            {transcript ? (
              Array.isArray(transcript) ? (
                <div className="transcript">
                  {transcript.map((turn, i) => (
                    <div className={`transcript-turn ${turn.role}`} key={i}>
                      <span>{label(turn.role)}</span>
                      <p>{turn.text}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="transcript-text">{transcript}</p>
              )
            ) : (
              <Empty title="No transcript was delivered">
                Transcript availability depends on the actual attempt and
                provider response.
              </Empty>
            )}
          </Section>
        </div>
        <div>
          <Section title="Attempt facts">
            <dl className="policy-list">
              <div>
                <dt>Outcome</dt>
                <dd>{label(call.outcome)}</dd>
              </div>
              <div>
                <dt>Provider</dt>
                <dd>{label(call.provider)}</dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>
                  {call.durationSeconds == null
                    ? 'Unknown'
                    : `${call.durationSeconds}s`}
                </dd>
              </div>
              <div>
                <dt>Started</dt>
                <dd>{date(call.startedAt)}</dd>
              </div>
              <div>
                <dt>Completed</dt>
                <dd>{date(call.completedAt)}</dd>
              </div>
              {call.failureCode && (
                <div>
                  <dt>Failure</dt>
                  <dd>{label(call.failureCode)}</dd>
                </div>
              )}
            </dl>
          </Section>
          <Section title="Attempt timeline">
            <EventTimeline events={call.events || []} />
          </Section>
        </div>
      </div>
    </>
  );
}
