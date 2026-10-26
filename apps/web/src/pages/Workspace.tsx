import { Button, Input } from '../components/ui';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  AudioLines,
  CheckCheck,
  Plus,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { DemoSignInSchema } from '@outreach/contracts';
import { z } from 'zod';
import {
  api,
  command,
  date,
  type Campaign,
  type Page,
  type OverviewData,
} from '../api';
import {
  Empty,
  FilterSelect,
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

export function SignIn() {
  const client = useQueryClient();
  const form = useForm<z.infer<typeof DemoSignInSchema>>({
    resolver: zodResolver(DemoSignInSchema),
    defaultValues: { email: 'demo@outreach.local', name: 'Demo operator' },
  });
  const signIn = useMutation({
    mutationFn: (values: z.infer<typeof DemoSignInSchema>) =>
      command('/auth/demo', values),
    onSuccess: () => client.invalidateQueries({ queryKey: ['me'] }),
  });
  return (
    <div className="signin-page">
      <section className="signin-story">
        <div className="brand">
          <span className="brand-icon">
            <AudioLines size={25} />
          </span>
          <span>Outreach Intern</span>
        </div>
        <div>
          <p className="eyebrow">A MORE THOUGHTFUL OUTREACH WORKFLOW</p>
          <h1>
            Plan with care.
            <br />
            Call with clarity.
          </h1>
          <p>
            Turn a contact list into a reviewed campaign, follow every attempt,
            and leave with answers you can act on.
          </p>
          <div className="signin-points">
            <span>
              <CheckCheck size={18} />
              Five editable agent personas
            </span>
            <span>
              <CheckCheck size={18} />
              Validated contacts and calling policies
            </span>
            <span>
              <CheckCheck size={18} />
              Recorded outcomes and downloadable reports
            </span>
          </div>
        </div>
        <small>YOUR CAMPAIGN. YOUR POLICY. EVERY ATTEMPT ACCOUNTED FOR.</small>
      </section>
      <section className="signin-form">
        <div className="signin-card">
          <ModeBadge />
          <p className="eyebrow">DEVELOPMENT ACCESS</p>
          <h2>Enter your workspace</h2>
          <p className="muted">
            This demo identity runs locally. No paid credentials or real phone
            calls are needed.
          </p>
          <form onSubmit={form.handleSubmit((values) => signIn.mutate(values))}>
            <Field
              label="Your name"
              error={form.formState.errors.name?.message}
            >
              <Input autoComplete="name" {...form.register('name')} />
            </Field>
            <Field
              label="Demo email"
              error={form.formState.errors.email?.message}
            >
              <Input
                type="email"
                autoComplete="email"
                {...form.register('email')}
              />
            </Field>
            {signIn.error && <ErrorState error={signIn.error} />}
            <Button className="button primary full" disabled={signIn.isPending}>
              {signIn.isPending ? 'Opening workspace…' : 'Enter demo workspace'}
              <ArrowRight size={17} />
            </Button>
          </form>
          <p className="signin-safety">
            <ShieldCheck size={16} />
            Demo access is disabled in production configuration.
          </p>
        </div>
      </section>
    </div>
  );
}

export function CampaignTable({ items }: { items: Campaign[] }) {
  return (
    <Table headers={['Campaign', 'Mode', 'Status', 'Progress', 'Created', '']}>
      {items.map((c) => {
        const counts = c.progress || {};
        const total =
          c.totalContacts ?? counts.total ?? c.plan?.eligibleCount ?? 0;
        const completed = c.completedContacts ?? counts.completed ?? 0;
        return (
          <tr key={c.id}>
            <td>
              <Link className="row-title" to={`/campaigns/${c.id}`}>
                {c.name}
              </Link>
              <small className="table-sub">{c.objective}</small>
            </td>
            <td>
              <ModeBadge mode={c.mode} />
            </td>
            <td>
              <Status value={c.status} />
            </td>
            <td>
              <div className="mini-progress">
                <span>
                  {completed} / {total}
                </span>
                <progress max={Math.max(total, 1)} value={completed} />
              </div>
            </td>
            <td className="muted nowrap">{date(c.createdAt)}</td>
            <td>
              <Link
                className="icon-link"
                aria-label={`Open ${c.name}`}
                to={`/campaigns/${c.id}`}
              >
                <ArrowRight size={17} />
              </Link>
            </td>
          </tr>
        );
      })}
    </Table>
  );
}

export function Overview() {
  const campaigns = useQuery({
    queryKey: ['campaigns', 'recent'],
    queryFn: () => api<Page<Campaign>>('/campaigns?limit=6'),
  });
  const overview = useQuery({
    queryKey: ['overview'],
    queryFn: () => api<OverviewData>('/overview'),
  });
  const events = {
    isPending: overview.isPending,
    error: overview.error,
    data: { items: overview.data?.recentEvents || [] },
  };
  const counts = overview.data;
  return (
    <>
      <PageHeading
        eyebrow="YOUR OUTREACH, IN VIEW"
        title="Operations overview"
        description="A clear view of what’s planned, what’s running, and what happened."
        action={
          <Button asChild className="button primary">
            <Link to="/campaigns/new">
              <Plus size={17} />
              New campaign
            </Link>
          </Button>
        }
      />
      <div className="welcome-strip">
        <div className="welcome-icon">
          <Sparkles size={22} />
        </div>
        <div>
          <strong>Your next conversation starts with a plan</strong>
          <p>
            Import contacts, review a plan, and run a simulation with real
            persisted results.
          </p>
        </div>
        <ModeBadge />
      </div>
      {overview.isPending ? (
        <Loading />
      ) : overview.error ? (
        <ErrorState
          error={overview.error}
          retry={() => void overview.refetch()}
        />
      ) : (
        <div className="metrics-row">
          {[
            [
              'Campaigns',
              counts?.campaignCounts.reduce(
                (sum, item) => sum + item.count,
                0,
              ) ?? 0,
            ],
            ['Contacts', counts?.contacts.total ?? 0],
            [
              'Simulation attempts',
              counts?.attemptCounts
                .filter((item) => item.mode === 'simulation')
                .reduce((sum, item) => sum + item.count, 0) ?? 0,
            ],
            [
              'Live attempts',
              counts?.attemptCounts
                .filter((item) => item.mode === 'live')
                .reduce((sum, item) => sum + item.count, 0) ?? 0,
            ],
          ].map(([text, value]) => (
            <div className="metric" key={String(text)}>
              <span>{String(text)}</span>
              <strong>{typeof value === 'number' ? value : '—'}</strong>
              <small>Workspace total</small>
            </div>
          ))}
        </div>
      )}
      <div className="overview-columns open-overview">
        <Section
          title="Recent campaigns"
          subtitle="Each campaign has its own plan and execution history."
          action={
            <Link className="text-link" to="/campaigns">
              View all <ArrowRight size={14} />
            </Link>
          }
        >
          {campaigns.isPending ? (
            <Loading />
          ) : campaigns.error ? (
            <ErrorState
              error={campaigns.error}
              retry={() => void campaigns.refetch()}
            />
          ) : campaigns.data.items.length ? (
            <CampaignTable items={campaigns.data.items} />
          ) : (
            <Empty
              title="Start with a reviewed campaign"
              action={
                <Button asChild className="button primary">
                  <Link to="/campaigns/new">
                    Create a campaign <ArrowRight size={15} />
                  </Link>
                </Button>
              }
            >
              Choose a persona, validate synthetic contacts, and see the
              complete workflow in simulation.
            </Empty>
          )}
        </Section>
        <Section
          title="Recent activity"
          subtitle="Recorded by the application, as work happens."
        >
          {events.isPending ? (
            <Loading />
          ) : events.error ? (
            <ErrorState error={events.error} />
          ) : events.data.items.length ? (
            <ul className="timeline compact">
              {events.data.items.map((e) => (
                <li key={e.id}>
                  <span className="timeline-dot" />
                  <div>
                    <strong>
                      {(e.type || '')
                        .replaceAll('.', ' · ')
                        .replaceAll('_', ' ')}
                    </strong>
                    <small>{date(e.createdAt)}</small>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="A quiet workspace">
              Campaign activity will appear here after you create your first
              campaign.
            </Empty>
          )}
        </Section>
      </div>
      <div className="workflow-guide">
        <p className="eyebrow">FROM CONTACTS TO CLARITY</p>
        <ol>
          <li>
            <span>01</span>
            <strong>Validate your contacts</strong>
            <p>Map columns and resolve row-level issues.</p>
          </li>
          <li>
            <span>02</span>
            <strong>Review the campaign plan</strong>
            <p>Check eligibility, persona and policy.</p>
          </li>
          <li>
            <span>03</span>
            <strong>Run, inspect and export</strong>
            <p>Follow actual attempts and their outcomes.</p>
          </li>
        </ol>
      </div>
    </>
  );
}

export function Campaigns() {
  const [status, setStatus] = useState('');
  const [mode, setMode] = useState('');
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState('');
  const query = useQuery({
    queryKey: ['campaigns', status, mode, cursor],
    queryFn: () =>
      api<Page<Campaign>>(
        `/campaigns?limit=30${status ? `&status=${status}` : ''}${mode ? `&mode=${mode}` : ''}${cursor ? `&cursor=${cursor}` : ''}`,
      ),
  });
  const items =
    query.data?.items.filter((c) =>
      c.name.toLowerCase().includes(search.toLowerCase()),
    ) || [];
  return (
    <>
      <PageHeading
        eyebrow="CAMPAIGN OPERATIONS"
        title="Campaigns"
        description="Plans, progress and outcomes in one place."
        action={
          <Button asChild className="button primary">
            <Link to="/campaigns/new">
              <Plus size={17} />
              New campaign
            </Link>
          </Button>
        }
      />
      <Section>
        <div className="toolbar">
          <Input
            className="search-input"
            aria-label="Search campaigns"
            placeholder="Search campaigns on this page…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <FilterSelect
            label="Filter campaign status"
            value={status}
            onChange={(value) => {
              setStatus(value);
              setCursor('');
            }}
            options={[
              { value: '', label: 'All statuses' },
              ...[
                'draft',
                'planned',
                'running',
                'paused',
                'completed',
                'cancelled',
                'failed',
              ].map((value) => ({ value, label: value })),
            ]}
          />
          <FilterSelect
            label="Filter campaign mode"
            value={mode}
            onChange={(value) => {
              setMode(value);
              setCursor('');
            }}
            options={[
              { value: '', label: 'All modes' },
              { value: 'simulation', label: 'Simulation' },
              { value: 'live', label: 'Live' },
            ]}
          />
        </div>
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        ) : items.length ? (
          <CampaignTable items={items} />
        ) : (
          <Empty
            title="No campaigns here yet"
            action={
              <Button asChild className="button primary">
                <Link to="/campaigns/new">Create campaign</Link>
              </Button>
            }
          >
            Create a draft and review its plan before starting any work.
          </Empty>
        )}
        <NextPage cursor={query.data?.nextCursor} onNext={setCursor} />
      </Section>
    </>
  );
}
