import { Button, Input, Textarea, NativeSelect } from '../components/ui';
import { z } from 'zod';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CampaignInputSchema, type CampaignInput } from '@outreach/contracts';
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Check,
  ClipboardCheck,
  ContactRound,
  Settings2,
  Target,
} from 'lucide-react';
import {
  api,
  command,
  label,
  type Agent,
  type Campaign,
  type ContactImport,
  type Page,
  type Workspace,
} from '../api';
import {
  Empty,
  ErrorState,
  Field,
  Loading,
  ModeBadge,
  PageHeading,
  Section,
} from '../components/ui';
import { ImportReview, ImportUploader } from './Contacts';

const steps = [
  { title: 'Objective', Icon: Target },
  { title: 'Contacts', Icon: ContactRound },
  { title: 'Agent', Icon: AudioLines },
  { title: 'Policy', Icon: Settings2 },
  { title: 'Review', Icon: ClipboardCheck },
];

export function CampaignWizard({ workspace }: { workspace: Workspace }) {
  const [step, setStep] = useState(0);
  const [showUploader, setShowUploader] = useState(false);
  const navigate = useNavigate();
  const imports = useQuery({
    queryKey: ['imports'],
    queryFn: () => api<Page<ContactImport>>('/imports?limit=100'),
    refetchInterval: 2000,
  });
  const agents = useQuery({
    queryKey: ['agents'],
    queryFn: () => api<Page<Agent>>('/agents?limit=100'),
  });
  const form = useForm<
    z.input<typeof CampaignInputSchema>,
    unknown,
    z.output<typeof CampaignInputSchema>
  >({
    resolver: zodResolver(CampaignInputSchema),
    defaultValues: {
      name: '',
      objective: '',
      importId: '',
      agentId: '',
      mode: 'simulation',
      policy: {
        timezone: workspace.timezone || 'Asia/Kolkata',
        windowStart: '00:00',
        windowEnd: '23:59',
        concurrency: 2,
        budgetMinor: 10000,
        currency: 'INR',
        estimatedCostPerCallMinor: 500,
      },
    },
  });
  const watched = form.watch();
  const values = {
    ...watched,
    mode: watched.mode || 'simulation',
    policy: {
      timezone: watched.policy?.timezone ?? workspace.timezone,
      windowStart: watched.policy?.windowStart ?? '00:00',
      windowEnd: watched.policy?.windowEnd ?? '23:59',
      concurrency: watched.policy?.concurrency ?? 2,
      budgetMinor: watched.policy?.budgetMinor ?? 10000,
      currency: 'INR' as const,
      estimatedCostPerCallMinor:
        watched.policy?.estimatedCostPerCallMinor ?? 500,
    },
  };
  const selectedImport = imports.data?.items.find(
    (i) => i.id === values.importId,
  );
  const selectedAgent = agents.data?.items.find((a) => a.id === values.agentId);
  const save = useMutation({
    mutationFn: async ({
      input,
      plan,
    }: {
      input: CampaignInput;
      plan: boolean;
    }) => {
      const campaign = await command<Campaign>(
        '/campaigns',
        CampaignInputSchema.parse(input),
      );
      if (plan) await command(`/campaigns/${campaign.id}/plan`);
      return campaign;
    },
    onSuccess: (c) => navigate(`/campaigns/${c.id}`),
  });
  const next = async () => {
    const fields =
      step === 0
        ? ['name', 'objective']
        : step === 1
          ? ['importId']
          : step === 2
            ? ['agentId']
            : ['policy'];
    if (
      await form.trigger(
        fields as ('name' | 'objective' | 'importId' | 'agentId' | 'policy')[],
      )
    )
      setStep((previous) => Math.min(previous + 1, 4));
  };
  return (
    <>
      <PageHeading
        eyebrow="BUILD A CAMPAIGN"
        title="A thoughtful plan starts here"
        description="Work through the details. Save and plan without placing a call."
        action={<ModeBadge mode={values.mode} />}
      />
      <div className="wizard-layout">
        <aside className="wizard-steps">
          <ol>
            {steps.map(({ title, Icon }, i) => (
              <li
                className={i === step ? 'current' : i < step ? 'done' : ''}
                key={title}
              >
                <Button
                  onClick={() => i < step && setStep(i)}
                  disabled={i > step}
                >
                  <span>
                    {i < step ? <Check size={16} /> : <Icon size={16} />}
                  </span>
                  <div>
                    <small>STEP {i + 1}</small>
                    <strong>{title}</strong>
                  </div>
                </Button>
              </li>
            ))}
          </ol>
          <div className="wizard-note">
            <strong>Review before execution</strong>
            <p>
              A plan describes work. Starting a simulation or live campaign is a
              separate, explicit action.
            </p>
          </div>
        </aside>
        <div>
          <Section
            title={steps[step]?.title}
            subtitle={`Step ${step + 1} of ${steps.length}`}
          >
            <div className="wizard-form">
              {step === 0 && (
                <>
                  <Field
                    label="Campaign name"
                    error={form.formState.errors.name?.message}
                  >
                    <Input
                      placeholder="e.g. Customer research · October"
                      autoFocus
                      {...form.register('name')}
                    />
                  </Field>
                  <Field
                    label="What should this campaign achieve?"
                    hint="Describe the purpose and the answers you need. This becomes the reviewed agent objective."
                    error={form.formState.errors.objective?.message}
                  >
                    <Textarea
                      rows={5}
                      placeholder="Understand how customers use our product and whether they want a follow-up conversation."
                      {...form.register('objective')}
                    />
                  </Field>
                  <Field label="Execution mode">
                    <NativeSelect {...form.register('mode')}>
                      <option value="simulation">
                        Simulation — deterministic mock, no real calls
                      </option>
                      <option value="live">
                        Live — requires configuration and separate confirmation
                      </option>
                    </NativeSelect>
                  </Field>
                  <div className="info-note">
                    <ModeBadge mode={values.mode} />
                    <p>
                      {values.mode === 'simulation'
                        ? 'The mock provider will create synthetic outcomes. No external voice service is contacted.'
                        : 'Selecting Live saves the intended mode only. The server will check all prerequisites when you deliberately launch.'}
                    </p>
                  </div>
                </>
              )}
              {step === 1 && (
                <>
                  {imports.isPending ? (
                    <Loading />
                  ) : imports.error ? (
                    <ErrorState error={imports.error} />
                  ) : (
                    <Field
                      label="Validated contact import"
                      error={form.formState.errors.importId?.message}
                    >
                      <NativeSelect {...form.register('importId')}>
                        <option value="">Choose a contact import…</option>
                        {imports.data.items.map((i) => (
                          <option
                            key={i.id}
                            value={i.id}
                            disabled={
                              !['ready', 'needs_correction'].includes(i.status)
                            }
                          >
                            {i.filename} · {i.validCount} eligible ·{' '}
                            {label(i.status)}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                  )}
                  <Button
                    type="button"
                    className="button secondary"
                    onClick={() => setShowUploader(!showUploader)}
                  >
                    {showUploader ? 'Hide upload' : 'Import a new contact list'}
                  </Button>
                  {showUploader && (
                    <ImportUploader
                      onCreated={(id) => {
                        form.setValue('importId', id);
                      }}
                    />
                  )}
                  {values.importId && <ImportReview id={values.importId} />}
                  {!imports.data?.items.length && !showUploader && (
                    <Empty
                      title="Start with synthetic contacts"
                      action={
                        <Button
                          type="button"
                          className="button primary"
                          onClick={() => setShowUploader(true)}
                        >
                          Import contacts
                        </Button>
                      }
                    >
                      The sample includes every deterministic call outcome and
                      row validation issues.
                    </Empty>
                  )}
                </>
              )}
              {step === 2 && (
                <>
                  {agents.isPending ? (
                    <Loading />
                  ) : agents.error ? (
                    <ErrorState error={agents.error} />
                  ) : (
                    <div className="persona-choices">
                      {agents.data.items.map((a, i) => (
                        <label
                          className={`persona-choice ${values.agentId === a.id ? 'selected' : ''}`}
                          key={a.id}
                        >
                          <input
                            type="radio"
                            value={a.id}
                            {...form.register('agentId')}
                          />
                          <span className={`persona-avatar avatar-${i % 5}`}>
                            <AudioLines size={21} />
                          </span>
                          <div>
                            <strong>{a.name}</strong>
                            <p>{a.description}</p>
                            <small>
                              Version {a.currentVersion} ·{' '}
                              {a.language || 'English'}
                            </small>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                  {form.formState.errors.agentId && (
                    <p className="field-error">Select an agent persona.</p>
                  )}
                  <p className="muted small-text">
                    The campaign pins an immutable persona version. Later edits
                    do not silently change this plan.
                  </p>
                </>
              )}
              {step === 3 && (
                <>
                  <div className="form-grid">
                    <Field
                      label="Calling timezone"
                      error={form.formState.errors.policy?.timezone?.message}
                    >
                      <Input
                        {...form.register('policy.timezone')}
                        list="timezone-options"
                      />
                    </Field>
                    <Field
                      label="Concurrency"
                      hint="Maximum attempts dispatched in parallel."
                      error={form.formState.errors.policy?.concurrency?.message}
                    >
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        {...form.register('policy.concurrency', {
                          valueAsNumber: true,
                        })}
                      />
                    </Field>
                    <Field label="Window starts">
                      <Input
                        type="time"
                        {...form.register('policy.windowStart')}
                      />
                    </Field>
                    <Field label="Window ends">
                      <Input
                        type="time"
                        {...form.register('policy.windowEnd')}
                      />
                    </Field>
                    <Field
                      label="Budget cap (₹)"
                      hint="Simulation incurs no provider charge."
                      error={form.formState.errors.policy?.budgetMinor?.message}
                    >
                      <Controller
                        control={form.control}
                        name="policy.budgetMinor"
                        render={({ field }) => (
                          <Input
                            {...field}
                            type="number"
                            min={0}
                            step="0.01"
                            value={field.value == null ? '' : field.value / 100}
                            onChange={(event) =>
                              field.onChange(
                                event.target.value === ''
                                  ? null
                                  : Math.round(
                                      event.target.valueAsNumber * 100,
                                    ),
                              )
                            }
                          />
                        )}
                      />
                    </Field>
                    <Field
                      label="Estimated reserve per call (₹)"
                      hint="Conservative estimate; actual pricing depends on your provider contract."
                      error={
                        form.formState.errors.policy?.estimatedCostPerCallMinor
                          ?.message
                      }
                    >
                      <Controller
                        control={form.control}
                        name="policy.estimatedCostPerCallMinor"
                        render={({ field }) => (
                          <Input
                            {...field}
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={field.value == null ? '' : field.value / 100}
                            onChange={(event) =>
                              field.onChange(
                                event.target.value === ''
                                  ? null
                                  : Math.round(
                                      event.target.valueAsNumber * 100,
                                    ),
                              )
                            }
                          />
                        )}
                      />
                    </Field>
                  </div>
                  <datalist id="timezone-options">
                    <option value="Asia/Kolkata" />
                    <option value="UTC" />
                    <option value="America/New_York" />
                    <option value="Europe/London" />
                  </datalist>
                  <div className="info-note">
                    <Settings2 size={21} />
                    <p>
                      Consent, suppression, calling window, budget and campaign
                      state are checked again immediately before dispatch.
                    </p>
                  </div>
                </>
              )}
              {step === 4 && (
                <>
                  <div className="review-title">
                    <ModeBadge mode={values.mode} />
                    <h3>{values.name}</h3>
                    <p>{values.objective}</p>
                  </div>
                  <dl className="review-grid">
                    <div>
                      <dt>Contact source</dt>
                      <dd>{selectedImport?.filename || 'Not selected'}</dd>
                    </div>
                    <div>
                      <dt>Eligible rows in import</dt>
                      <dd>{selectedImport?.validCount ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Persona</dt>
                      <dd>{selectedAgent?.name || 'Not selected'}</dd>
                    </div>
                    <div>
                      <dt>Timezone / window</dt>
                      <dd>
                        {values.policy.timezone}
                        <small>
                          {values.policy.windowStart}–{values.policy.windowEnd}
                        </small>
                      </dd>
                    </div>
                    <div>
                      <dt>Concurrency</dt>
                      <dd>{values.policy.concurrency} attempts</dd>
                    </div>
                    <div>
                      <dt>Budget cap</dt>
                      <dd>₹{(values.policy.budgetMinor / 100).toFixed(2)}</dd>
                    </div>
                  </dl>
                  <div className="info-note">
                    <ClipboardCheck size={23} />
                    <p>
                      <strong>Reviewed campaign plan.</strong> Save and build a
                      strictly validated plan. You’ll review final eligibility
                      and cost assumptions before any separate launch
                      confirmation.
                    </p>
                  </div>
                  {save.error && <ErrorState error={save.error} />}
                  <div className="button-row">
                    <Button
                      type="button"
                      className="button secondary"
                      disabled={save.isPending}
                      onClick={() =>
                        void form.handleSubmit((input) =>
                          save.mutate({ input, plan: false }),
                        )()
                      }
                    >
                      Save draft
                    </Button>
                    <Button
                      type="button"
                      className="button primary"
                      disabled={save.isPending}
                      onClick={() =>
                        void form.handleSubmit((input) =>
                          save.mutate({ input, plan: true }),
                        )()
                      }
                    >
                      {save.isPending
                        ? 'Saving campaign…'
                        : 'Save and build plan'}
                      <ArrowRight size={16} />
                    </Button>
                  </div>
                </>
              )}
              {step < 4 && (
                <div className="wizard-actions">
                  <Button
                    type="button"
                    className="button secondary"
                    disabled={step === 0}
                    onClick={() => setStep((previous) => previous - 1)}
                  >
                    <ArrowLeft size={15} />
                    Back
                  </Button>
                  <Button
                    type="button"
                    className="button primary"
                    onClick={() => void next()}
                  >
                    Continue
                    <ArrowRight size={15} />
                  </Button>
                </div>
              )}
              {step === 4 && (
                <Button
                  className="text-link"
                  type="button"
                  onClick={() => setStep(3)}
                >
                  <ArrowLeft size={14} />
                  Back to policy
                </Button>
              )}
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
