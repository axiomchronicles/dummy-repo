import { Button, Input, NativeSelect } from '../components/ui';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Download, FileBarChart2, Plug, ShieldCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { SettingsSchema } from '@outreach/contracts';
import { z } from 'zod';
import {
  api,
  command,
  date,
  label,
  type Campaign,
  type EventRecord,
  type Page,
  type Report,
  type Workspace,
  type IntegrationStatus,
} from '../api';
import {
  Empty,
  ErrorState,
  Field,
  Loading,
  ModeBadge,
  NextPage,
  PageHeading,
  Section,
  Status,
  Table,
} from '../components/ui';
import { EventTimeline } from './CampaignDetail';

export function Reports() {
  const [campaignId, setCampaignId] = useState('');
  const [format, setFormat] = useState<'csv' | 'xlsx'>('csv');
  const [cursor, setCursor] = useState('');
  const client = useQueryClient();
  const reports = useQuery({
    queryKey: ['reports', cursor],
    queryFn: () =>
      api<Page<Report>>(
        `/reports?limit=30${cursor ? `&cursor=${cursor}` : ''}`,
      ),
    refetchInterval: 1500,
  });
  const campaigns = useQuery({
    queryKey: ['campaigns', 'report-selector'],
    queryFn: () => api<Page<Campaign>>('/campaigns?limit=100'),
  });
  const create = useMutation({
    mutationFn: () =>
      command(`/campaigns/${campaignId}/reports`, { format }, true),
    onSuccess: () => client.invalidateQueries({ queryKey: ['reports'] }),
  });
  return (
    <>
      <PageHeading
        eyebrow="RESULTS YOU CAN USE"
        title="Reports"
        description="Asynchronous exports of persisted campaign contacts, attempts and answers."
      />
      <Section
        title="Generate a report"
        subtitle="The worker builds the file. Your report status is saved even if you leave this page."
      >
        <form
          className="report-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (campaignId) create.mutate();
          }}
        >
          <Field label="Campaign">
            <NativeSelect
              required
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
            >
              <option value="">Choose a campaign…</option>
              {campaigns.data?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.mode}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="File format">
            <NativeSelect
              value={format}
              onChange={(e) => setFormat(e.target.value as 'csv' | 'xlsx')}
            >
              <option value="csv">CSV · spreadsheet-safe text</option>
              <option value="xlsx">XLSX · typed string cells</option>
            </NativeSelect>
          </Field>
          <Button
            className="button primary"
            disabled={!campaignId || create.isPending}
          >
            <FileBarChart2 size={16} />
            {create.isPending ? 'Requesting…' : 'Generate report'}
          </Button>
        </form>
        {create.error && <ErrorState error={create.error} />}
        {create.isSuccess && (
          <p className="success-note" role="status">
            Report request saved. Generation status updates below.
          </p>
        )}
        {campaigns.error && <ErrorState error={campaigns.error} />}
        <p className="small-text muted">
          Exports protect spreadsheet cells while preserving canonical data in
          the database. Only your workspace can download these files.
        </p>
      </Section>
      <Section
        title="Report history"
        subtitle="Generation, failures and downloads in one place."
      >
        {reports.isPending ? (
          <Loading />
        ) : reports.error ? (
          <ErrorState
            error={reports.error}
            retry={() => void reports.refetch()}
          />
        ) : reports.data.items.length ? (
          <Table
            headers={['Report', 'Campaign', 'Status', 'Rows', 'Requested', '']}
          >
            {reports.data.items.map((r) => (
              <tr key={r.id}>
                <td>
                  <span className="file-label">
                    <FileBarChart2 size={18} />
                    <strong>{r.format.toUpperCase()}</strong>
                  </span>
                </td>
                <td>
                  <Link className="text-link" to={`/campaigns/${r.campaignId}`}>
                    {campaigns.data?.items.find((c) => c.id === r.campaignId)
                      ?.name ||
                      r.campaignName ||
                      'Open campaign'}
                  </Link>
                </td>
                <td>
                  <Status value={r.status} />
                  {r.failureCode && <small>{label(r.failureCode)}</small>}
                </td>
                <td>{r.rowCount ?? '—'}</td>
                <td className="muted nowrap">{date(r.createdAt)}</td>
                <td>
                  {r.status === 'completed' ? (
                    <Button asChild variant="outline" size="sm">
                      <a href={`/api/v1/reports/${r.id}/download`} download>
                        <Download size={14} />
                        Download {r.format.toUpperCase()}
                      </a>
                    </Button>
                  ) : (
                    <span className="muted">
                      {r.status === 'failed'
                        ? 'Generate a new report to retry'
                        : 'Waiting for worker'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty title="No reports yet">
            Choose a campaign and request CSV or XLSX. Downloads become
            available when the worker finishes.
          </Empty>
        )}
        <NextPage cursor={reports.data?.nextCursor} onNext={setCursor} />
      </Section>
    </>
  );
}

export function ActivityPage({ audit = false }: { audit?: boolean }) {
  const [cursor, setCursor] = useState('');
  const query = useQuery({
    queryKey: [audit ? 'audit' : 'events', cursor],
    queryFn: () =>
      api<Page<EventRecord>>(
        `/${audit ? 'audit' : 'events'}?limit=50${cursor ? `&${audit ? 'cursor' : 'after'}=${cursor}` : ''}`,
      ),
    refetchInterval: 2000,
  });
  return (
    <>
      <PageHeading
        eyebrow={audit ? 'ACCOUNTABILITY' : 'AS WORK HAPPENS'}
        title={audit ? 'Audit history' : 'Live activity'}
        description={
          audit
            ? 'Persisted actions on campaigns, consent, settings and exports.'
            : 'Persisted workspace events. Open a campaign for the live SSE feed and cursor replay.'
        }
      />
      <Section
        title={audit ? 'Recorded actions' : 'Workspace event timeline'}
        subtitle="Refreshes from the server; no browser-generated activity."
      >
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        ) : (
          <EventTimeline events={query.data.items} />
        )}
        <NextPage
          cursor={
            audit || (query.data?.items.length || 0) === 50
              ? query.data?.nextCursor
              : null
          }
          onNext={setCursor}
        />
      </Section>
    </>
  );
}

export function Integrations() {
  const query = useQuery({
    queryKey: ['integrations'],
    queryFn: () => api<IntegrationStatus>('/integrations'),
  });
  return (
    <>
      <PageHeading
        eyebrow="PROVIDER READINESS"
        title="Integrations"
        description="A sanitized view of configuration and available capabilities. Secrets stay on the server."
      />
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} />
      ) : (
        <>
          <Section
            title="Voice execution"
            subtitle="Mock is the default local provider."
            action={
              <ModeBadge
                mode={query.data.provider === 'sarvam' ? 'live' : 'simulation'}
              />
            }
          >
            <div className="integration-provider">
              <div className="integration-logo">
                <Plug size={27} />
              </div>
              <div>
                <h3>
                  {query.data.provider === 'sarvam'
                    ? 'Sarvam Voice Agents'
                    : 'Deterministic mock provider'}
                </h3>
                <p className="muted">
                  {query.data.provider === 'sarvam'
                    ? 'Verified instant outbound contract, subject to explicit launch prerequisites.'
                    : 'Connected, no answer, busy and failed outcomes. No network calls.'}
                </p>
              </div>
              <Status value={query.data.simulationReady ? 'ready' : 'failed'} />
            </div>
            <dl className="review-grid">
              <div>
                <dt>Simulation</dt>
                <dd>{query.data.simulationReady ? 'Ready' : 'Unavailable'}</dd>
              </div>
              <div>
                <dt>Live calling</dt>
                <dd>
                  {query.data.liveReady
                    ? 'Configured · confirmation required'
                    : 'Disabled / prerequisites missing'}
                </dd>
              </div>
              <div>
                <dt>Active call termination</dt>
                <dd>
                  {query.data.capabilities.termination
                    ? 'Supported'
                    : 'Unavailable'}
                </dd>
              </div>
              <div>
                <dt>Recording delivery</dt>
                <dd>
                  {query.data.capabilities.recordings
                    ? 'Supported'
                    : 'Not promised by verified contract'}
                </dd>
              </div>
            </dl>
            {query.data.missingConfiguration.length > 0 && (
              <div className="info-note">
                <ShieldCheck size={19} />
                <div>
                  <strong>Live mode requires server configuration</strong>
                  <p>{query.data.missingConfiguration.join(' · ')}</p>
                </div>
              </div>
            )}
            <p className="small-text muted">
              Webhook security: {query.data.webhookSecurity}
            </p>
          </Section>
          <Section
            title="Campaign planner"
            subtitle={
              query.data.planner?.provider === 'sarvam'
                ? `Sarvam SDK${query.data.planner.model ? ` · ${query.data.planner.model}` : ''}`
                : 'Deterministic local planner'
            }
          >
            <p>
              Simulation always uses the local planner and requires no model
              key. Configured live plans can use Sarvam SDK. Every plan is
              validated and reviewed; model output never authorizes or initiates
              a call.
            </p>
            {query.data.planner?.provider === 'sarvam' && (
              <p className="small-text muted">
                Configuration:{' '}
                {query.data.planner.configurationReady
                  ? 'Present'
                  : 'Incomplete'}
                . Configuration presence does not verify provider connectivity.
              </p>
            )}
          </Section>
          <Section title="Local infrastructure">
            <div className="infrastructure-list">
              <span>
                PostgreSQL <small>Authoritative domain state</small>
              </span>
              <span>
                Redis / BullMQ{' '}
                <small>Asynchronous execution coordination</small>
              </span>
              <span>
                Private report downloads{' '}
                <small>Workspace authorization required</small>
              </span>
            </div>
          </Section>
        </>
      )}
    </>
  );
}

export function SettingsPage({ workspace }: { workspace: Workspace }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<Workspace & { defaultRegion?: string }>('/settings'),
  });
  const form = useForm<z.infer<typeof SettingsSchema>>({
    resolver: zodResolver(SettingsSchema),
    defaultValues: {
      name: workspace.name,
      timezone: workspace.timezone,
      defaultRegion: null,
    },
  });
  useEffect(() => {
    if (query.data)
      form.reset({
        name: query.data.name,
        timezone: query.data.timezone,
        defaultRegion:
          typeof query.data.settings.defaultRegion === 'string'
            ? query.data.settings.defaultRegion
            : null,
      });
  }, [query.data, form.reset]);
  const save = useMutation({
    mutationFn: (input: z.infer<typeof SettingsSchema>) =>
      command('/settings', input, false, 'PATCH'),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['settings'] });
      await client.invalidateQueries({ queryKey: ['me'] });
    },
  });
  return (
    <>
      <PageHeading
        eyebrow="WORKSPACE POLICY"
        title="Settings"
        description="Shared defaults and identity. Campaign policy is reviewed separately before launch."
      />
      <Section
        title="Workspace profile"
        subtitle="Changes are saved to the workspace and recorded in audit history."
      >
        <form
          className="settings-form"
          onSubmit={form.handleSubmit((input) => save.mutate(input))}
        >
          <Field
            label="Workspace name"
            error={form.formState.errors.name?.message}
          >
            <Input {...form.register('name')} />
          </Field>
          <Field
            label="Default timezone"
            error={form.formState.errors.timezone?.message}
          >
            <Input {...form.register('timezone')} />
          </Field>
          <Field label="Source region default">
            <NativeSelect
              {...form.register('defaultRegion', {
                setValueAs: (value) => value || null,
              })}
            >
              <option value="">No region — require E.164</option>
              <option value="IN">India</option>
              <option value="US">United States</option>
              <option value="GB">United Kingdom</option>
            </NativeSelect>
          </Field>
          {save.error && <ErrorState error={save.error} />}
          <Button className="button primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save workspace settings'}
          </Button>
          {save.isSuccess && (
            <p className="success-note" role="status">
              Workspace settings saved.
            </p>
          )}
        </form>
      </Section>
      <Section title="Data and safe execution">
        <dl className="policy-list">
          <div>
            <dt>Current timezone</dt>
            <dd>{query.data?.timezone || workspace.timezone}</dd>
          </div>
          <div>
            <dt>Identity mode</dt>
            <dd>Development-only demo session</dd>
          </div>
          <div>
            <dt>Retention</dt>
            <dd>Configured on the server; see the developer runbook</dd>
          </div>
          <div>
            <dt>Suppression</dt>
            <dd>Durable across imports</dd>
          </div>
        </dl>
        <p className="small-text muted">
          Provider credentials and live destination allowlists are environment
          configuration and are never returned to this page.
        </p>
      </Section>
    </>
  );
}
