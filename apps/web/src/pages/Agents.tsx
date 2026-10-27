import { Button, Input, Textarea } from '../components/ui';
import { z } from 'zod';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AudioLines, FlaskConical, Pencil, Play, Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AgentInputSchema,
  AgentVersionSchema,
  type AgentInput,
} from '@outreach/contracts';
import {
  api,
  ApiError,
  command,
  date,
  label,
  message,
  type Agent,
  type Page,
} from '../api';
import {
  Empty,
  ErrorState,
  Field,
  Loading,
  Modal,
  ModeBadge,
  PageHeading,
} from '../components/ui';

function AgentEditor({ agent, close }: { agent?: Agent; close: () => void }) {
  const client = useQueryClient();
  const form = useForm<
    z.input<typeof AgentInputSchema>,
    unknown,
    z.output<typeof AgentInputSchema>
  >({
    resolver: zodResolver(AgentInputSchema),
    defaultValues: {
      name: agent?.name || '',
      description: agent?.description || '',
      prompt: agent?.prompt || '',
      questions: agent?.questions || [],
      language: agent?.language || 'English',
    },
  });
  const [questions, setQuestions] = useState(
    (agent?.questions || []).join('\n'),
  );
  const save = useMutation({
    mutationFn: (input: AgentInput) =>
      command(
        agent ? `/agents/${agent.id}` : '/agents',
        AgentInputSchema.parse(input),
        false,
        agent ? 'PATCH' : 'POST',
      ),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['agents'] });
      close();
    },
  });
  return (
    <Modal
      title={agent ? `Edit ${agent.name}` : 'Create an agent persona'}
      close={close}
    >
      <p className="muted">
        Saving creates an immutable configuration version. Existing campaigns
        keep their reviewed version.
      </p>
      <form onSubmit={form.handleSubmit((input) => save.mutate(input))}>
        <Field label="Persona name" error={form.formState.errors.name?.message}>
          <Input {...form.register('name')} />
        </Field>
        <Field
          label="Description"
          error={form.formState.errors.description?.message}
        >
          <Input {...form.register('description')} />
        </Field>
        <Field
          label="Agent instructions"
          error={form.formState.errors.prompt?.message}
        >
          <Textarea rows={5} {...form.register('prompt')} />
        </Field>
        <Field
          label="Questions, one per line"
          error={form.formState.errors.questions?.message}
        >
          <Textarea
            rows={4}
            value={questions}
            onChange={(e) => {
              setQuestions(e.target.value);
              form.setValue(
                'questions',
                e.target.value
                  .split('\n')
                  .map((q) => q.trim())
                  .filter(Boolean),
              );
            }}
          />
        </Field>
        <Field label="Language">
          <Input {...form.register('language')} />
        </Field>
        {save.error && <ErrorState error={save.error} />}
        <Button className="button primary" disabled={save.isPending}>
          {save.isPending ? 'Saving version…' : 'Save persona version'}
        </Button>
      </form>
    </Modal>
  );
}

export function Agents() {
  const capabilities = useQuery({
    queryKey: ['provider-capabilities'],
    queryFn: () =>
      api<{
        available: boolean;
        blocker: string | null;
        tools: {
          name: string;
          description: string;
          inputSchema: Record<string, unknown>;
        }[];
      }>('/agents/provider-capabilities'),
  });
  const [providerTool, setProviderTool] = useState('');
  const providerRequestKey = useRef(crypto.randomUUID());
  const [bindingAgent, setBindingAgent] = useState('');
  const [bindingInput, setBindingInput] = useState('{}');
  const binding = useMutation({
    mutationFn: () =>
      command(
        `/agents/${bindingAgent}/provider-binding`,
        JSON.parse(bindingInput),
      ),
    onSuccess: () => {
      void provider.refetch();
    },
  });
  const [providerArgs, setProviderArgs] = useState('{}');
  const providerAction = useMutation({
    mutationFn: () =>
      api<{ result: unknown }>('/agents/provider-action', {
        method: 'POST',
        headers: { 'Idempotency-Key': providerRequestKey.current },
        body: JSON.stringify({
          name: providerTool,
          arguments: JSON.parse(providerArgs),
          confirmed: true,
        }),
      }),
    onSuccess: () => {
      void capabilities.refetch();
    },
  });
  const provider = useQuery({
    queryKey: ['provider-agent-configuration'],
    queryFn: () =>
      api<{
        synchronized: boolean;
        appId: string | null;
        appVersion: number | null;
        callerIdMasked: string | null;
        blockers: string[];
        voiceCatalog: { status: string; reason: string };
        recommendedModel: string;
        liveEnabled: boolean;
        bindings: Binding[];
        documentation: string;
        dashboard: string;
      }>('/agents/provider-configuration'),
  });

  const [editing, setEditing] = useState<Agent | 'new' | null>(null);
  const [sandboxAgent, setSandboxAgent] = useState<Agent | null>(null);
  const [versionsId, setVersionsId] = useState('');
  const agents = useQuery({
    queryKey: ['agents'],
    queryFn: () => api<Page<Agent>>('/agents?limit=100'),
  });
  const versions = useQuery({
    queryKey: ['agent-versions', versionsId],
    queryFn: () =>
      api<Page<z.infer<typeof AgentVersionSchema>>>(
        `/agents/${versionsId}/versions`,
      ),
    enabled: !!versionsId,
  });
  const sandbox = useMutation({
    mutationFn: (id: string) =>
      command<Record<string, unknown>>(`/agents/${id}/sandbox`, {}),
  });
  return (
    <>
      <PageHeading
        eyebrow="VOICE & PURPOSE"
        title="Sarvam Agents & Voices"
        description="Agents, versions, voices and telephony readiness. Edits are versioned; a provider deployment must be synchronized before dialing."
        action={
          <Button className="button primary" onClick={() => setEditing('new')}>
            <Plus size={17} />
            New persona
          </Button>
        }
      />
      {provider.error && <ErrorState error={provider.error} />}
      {provider.data && (
        <section className="provider-readiness">
          <h2>Provider configuration</h2>
          <p>
            Agent: {provider.data.appId ?? 'Missing SARVAM_APP_ID'} · committed
            version: {provider.data.appVersion ?? 'Unverified'} · outbound
            caller ID: {provider.data.callerIdMasked ?? 'Missing'}
          </p>
          {provider.data.blockers.length ? (
            <div
              className="diagnostics"
              role="status"
              aria-label="Telephony blockers"
            >
              {provider.data.blockers.map((b) => (
                <code key={b}>{b}</code>
              ))}
            </div>
          ) : (
            <p className="readiness-ok" role="status">
              Telephony ready
            </p>
          )}
          <h2>Voices</h2>
          <p>{provider.data.voiceCatalog.reason}</p>
          <p>
            Recommended model: {provider.data.recommendedModel}. Open an agent’s
            Voice section to browse, preview and save a voice.
          </p>
          <p>
            <a href={provider.data.dashboard} target="_blank" rel="noreferrer">
              Open provider dashboard
            </a>{' '}
            ·{' '}
            <a
              href={provider.data.documentation}
              target="_blank"
              rel="noreferrer"
            >
              Official MCP setup
            </a>
          </p>
        </section>
      )}
      {capabilities.error && <ErrorState error={capabilities.error} />}
      {capabilities.data && !capabilities.data.available && (
        <p className="muted">
          Provider authoring unavailable: {capabilities.data.blocker}. Configure
          an authorized MCP SSO session on the server to load account-specific
          controls.
        </p>
      )}
      {capabilities.data?.available && (
        <section className="provider-readiness">
          <h2>Connected provider controls</h2>
          <p>
            These operations use the account’s current tool schema and save
            changes to Sarvam. Review the selected operation before submitting.
            A commit changes the provider version; refresh its configuration
            before preparing another live plan.
          </p>
          <Field label="Provider operation">
            <select
              value={providerTool}
              onChange={(e) => {
                setProviderTool(e.target.value);
                providerRequestKey.current = crypto.randomUUID();
                providerAction.reset();
              }}
            >
              <option value="">Select an available operation</option>
              {capabilities.data.tools.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          {providerTool && (
            <>
              <p>
                {
                  capabilities.data.tools.find((t) => t.name === providerTool)
                    ?.description
                }
              </p>
              <details>
                <summary>Current provider input contract</summary>
                <pre>
                  {JSON.stringify(
                    capabilities.data.tools.find((t) => t.name === providerTool)
                      ?.inputSchema,
                    null,
                    2,
                  )}
                </pre>
              </details>
              <Field label="Operation parameters">
                <Textarea
                  value={providerArgs}
                  onChange={(e) => {
                    setProviderArgs(e.target.value);
                    providerRequestKey.current = crypto.randomUUID();
                  }}
                  rows={6}
                />
              </Field>
              <Button
                disabled={providerAction.isPending}
                onClick={() => providerAction.mutate()}
              >
                {providerAction.isPending
                  ? 'Submitting…'
                  : 'Confirm provider operation'}
              </Button>
            </>
          )}
          {providerAction.error && <ErrorState error={providerAction.error} />}
          <details>
            <summary>Bind a committed deployment to a local persona</summary>
            <p>
              Choose a read operation from the current provider contract. Supply
              readArguments and fields with JSON pointers to the returned appId,
              version, prompt, voiceId, voiceModel, language, objectiveVariable
              and objectiveInContext. The last two must identify the objective
              input variable and confirm that its value is sent to the agent
              context. The server reads that configuration again and requires
              the prompt and language to match the local immutable persona.
            </p>
            <Field label="Local persona">
              <select
                value={bindingAgent}
                onChange={(e) => setBindingAgent(e.target.value)}
              >
                <option value="">Select persona</option>
                {agents.data?.items.map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.name} · v{a.currentVersion}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Provider read contract and field mapping">
              <Textarea
                rows={8}
                value={bindingInput}
                onChange={(e) => setBindingInput(e.target.value)}
              />
            </Field>
            <Button
              disabled={!bindingAgent || binding.isPending}
              onClick={() => binding.mutate()}
            >
              Verify and save binding
            </Button>
            {binding.error && <ErrorState error={binding.error} />}{' '}
            {binding.isSuccess && (
              <p role="status">Provider binding verified and saved.</p>
            )}
          </details>
          {providerAction.data && (
            <div role="status">
              <p>Provider operation confirmed. Changes are saved to Sarvam.</p>
              <pre>{JSON.stringify(providerAction.data.result, null, 2)}</pre>
            </div>
          )}
        </section>
      )}
      <div className="info-note">
        <ModeBadge />
        <p>
          Sandbox tests are synthetic and do not call any destination. Live
          voice configuration stays server-side.
        </p>
      </div>
      {agents.isPending ? (
        <Loading />
      ) : agents.error ? (
        <ErrorState error={agents.error} retry={() => void agents.refetch()} />
      ) : !agents.data.items.length ? (
        <Empty
          title="No personas available"
          action={
            <Button
              className="button primary"
              onClick={() => setEditing('new')}
            >
              Create persona
            </Button>
          }
        >
          Run the development seed to install the five editable starters.
        </Empty>
      ) : (
        <div className="agent-list">
          {agents.data.items.map((agent) => (
            <article className="agent-row" key={agent.id}>
              <span className="persona-avatar">
                <AudioLines size={21} />
              </span>
              <div className="agent-summary">
                <div className="agent-name">
                  <h2>{agent.name}</h2>
                  <span className="version-pill">v{agent.currentVersion}</span>
                </div>
                <p>{agent.description}</p>
                <div className="agent-meta">
                  <span>{agent.language || 'English'}</span>
                  <span>
                    {provider.data?.bindings.find(
                      (b) => b.agentVersionId === agent.versionId,
                    )
                      ? 'Provider synchronized'
                      : 'Not synchronized for telephony'}
                  </span>
                  <Button
                    variant="link"
                    size="sm"
                    className="text-link"
                    onClick={() => setVersionsId(agent.id)}
                  >
                    Version history
                  </Button>
                </div>
              </div>
              <details className="agent-voice">
                <summary className="tap">Voice</summary>
                <VoicePanel
                  agent={agent}
                  binding={provider.data?.bindings.find(
                    (b) => b.agentVersionId === agent.versionId,
                  )}
                />
              </details>
              <div className="agent-question-block">
                <p className="eyebrow">Questions to answer</p>
                <ul className="agent-questions">
                  {agent.questions.slice(0, 3).map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ul>
              </div>
              <div className="agent-row-actions">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(agent)}
                >
                  <Pencil size={14} />
                  Edit persona
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSandboxAgent(agent);
                    sandbox.reset();
                  }}
                >
                  <FlaskConical size={15} />
                  Sandbox
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      {editing && (
        <AgentEditor
          agent={editing === 'new' ? undefined : editing}
          close={() => setEditing(null)}
        />
      )}
      {versionsId && (
        <Modal title="Persona version history" close={() => setVersionsId('')}>
          {versions.isPending ? (
            <Loading />
          ) : versions.error ? (
            <ErrorState error={versions.error} />
          ) : (
            <ul className="version-list">
              {versions.data.items.map((v) => (
                <li key={v.id}>
                  <strong>Version {v.version}</strong>
                  <small>{date(v.createdAt)}</small>
                  <p>{v.prompt}</p>
                  <span>{v.questions.length} questions</span>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
      {sandboxAgent && (
        <Modal
          title={`${sandboxAgent.name} · synthetic sandbox`}
          close={() => setSandboxAgent(null)}
        >
          <ModeBadge />
          <p>
            Exercise the mock provider using synthetic inputs. This test never
            performs an external request.
          </p>
          <Button
            className="button primary"
            disabled={sandbox.isPending}
            onClick={() => sandbox.mutate(sandboxAgent.id)}
          >
            <FlaskConical size={16} />
            {sandbox.isPending
              ? 'Running synthetic test…'
              : 'Run synthetic test'}
          </Button>
          {sandbox.error && <ErrorState error={sandbox.error} />}
          {sandbox.data && (
            <div className="sandbox-result">
              <h3>
                {label(
                  String(
                    (sandbox.data.event as Record<string, unknown> | undefined)
                      ?.outcome || 'Synthetic result',
                  ),
                )}
              </h3>
              <p>
                {String(
                  sandbox.data.summary ||
                    'Synthetic response generated by the deterministic mock provider.',
                )}
              </p>
              <pre>{JSON.stringify(sandbox.data, null, 2)}</pre>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

type Binding = {
  agentVersionId: string;
  voiceId: string | null;
  voiceModel: string | null;
  language: string | null;
  synchronizedAt: string | null;
};
type VoiceSelection = {
  model: string;
  speaker: string;
  language: string;
  pace: number;
  volume: number;
};
type Voice = {
  id: string;
  name: string;
  style: string;
  languages: string[];
};
type Catalog = {
  model: string;
  items: Voice[];
  preview: { available: boolean; blocker: string | null };
};
type AgentVoice = {
  voice?: VoiceSelection | null;
  voiceStatus?: 'configured' | 'not_configured' | 'invalid';
};
const failure = (e: unknown) =>
  e instanceof ApiError
    ? `${e.code} (HTTP ${e.status}): ${e.message}`
    : message(e);

/**
 * Bulbul voice catalog served by the API (GET /agents/voices). Preview audio is
 * real Sarvam TTS output; saving creates a new agent version and re-reads it.
 */
function VoicePanel({ agent, binding }: { agent: Agent; binding?: Binding }) {
  const client = useQueryClient();
  const saved = (agent as Agent & AgentVoice).voice ?? null;
  const status = (agent as Agent & AgentVoice).voiceStatus ?? 'not_configured';
  const catalog = useQuery({
    queryKey: ['voice-catalog'],
    queryFn: () => api<Catalog>('/agents/voices'),
    staleTime: Infinity,
    retry: false,
  });
  const [language, setLanguage] = useState(saved?.language ?? 'en-IN');
  const [selected, setSelected] = useState('');
  const [audio, setAudio] = useState<string>();
  const current = selected || saved?.speaker || '';
  const languages = [
    ...new Set(catalog.data?.items.flatMap((v) => v.languages) ?? []),
  ].sort();
  const voices =
    catalog.data?.items.filter((v) => v.languages.includes(language)) ?? [];
  const preview = useMutation({
    mutationFn: (speaker: string) =>
      command<{ contentType: string; audioBase64: string }>(
        '/agents/voices/preview',
        { model: catalog.data!.model, speaker, language },
      ),
    onSuccess: (result) => {
      setAudio(`data:${result.contentType};base64,${result.audioBase64}`);
    },
  });
  const save = useMutation({
    mutationFn: () =>
      command(
        `/agents/${agent.id}/voice`,
        { model: catalog.data!.model, speaker: current, language },
        true,
        'PATCH',
      ),
    onSuccess: async () => {
      setSelected('');
      // Re-read the saved server state rather than trusting the local selection.
      await client.invalidateQueries({ queryKey: ['agents'] });
    },
  });
  return (
    <div className="voice-panel">
      <p className="small-text">
        Saved voice:{' '}
        <strong>
          {saved
            ? `${saved.speaker} · ${saved.language} · ${saved.model}`
            : status === 'invalid'
              ? 'Stored voice is invalid; select and save again'
              : 'Not configured'}
        </strong>
      </p>
      <p className="small-text muted">
        Provider deployment voice:{' '}
        {binding?.voiceId
          ? `${binding.voiceId}${binding.voiceModel ? ` · ${binding.voiceModel}` : ''}`
          : 'not synchronized'}
        . Apply the saved voice on the Sarvam agent before binding.
      </p>
      {catalog.isPending ? (
        <Loading label="Loading voice catalog…" />
      ) : catalog.error ? (
        <p className="muted small-text" role="status">
          Voice catalog unavailable · {failure(catalog.error)}
        </p>
      ) : (
        <>
          <label className="small-text">
            Language{' '}
            <select
              className="tap"
              value={language}
              onChange={(e) => {
                setLanguage(e.target.value);
                setSelected('');
              }}
            >
              {languages.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          {!catalog.data.preview.available && (
            <p className="muted small-text" role="status">
              Preview unavailable · missing {catalog.data.preview.blocker}
            </p>
          )}
          <fieldset className="voices">
            <legend className="small-text muted">
              {voices.length} voices for {catalog.data.model} · {language}
            </legend>
            {voices.map((v) => (
              <div
                className="voice-row"
                key={v.id}
                data-selected={current === v.id}
              >
                <label>
                  <input
                    type="radio"
                    name={`voice-${agent.id}`}
                    value={v.id}
                    checked={current === v.id}
                    onChange={() => setSelected(v.id)}
                  />
                  <span>
                    {v.name}
                    {v.style ? ` · ${v.style}` : ''}
                  </span>
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="tap"
                  aria-label={`Preview voice ${v.name} ${v.style}`}
                  disabled={
                    preview.isPending || !catalog.data.preview.available
                  }
                  onClick={() => preview.mutate(v.id)}
                >
                  <Play size={14} aria-hidden /> Preview
                </Button>
              </div>
            ))}
          </fieldset>
          <Button
            size="sm"
            className="tap"
            disabled={
              !current ||
              (current === saved?.speaker && language === saved?.language) ||
              save.isPending
            }
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : 'Save voice'}
          </Button>
        </>
      )}
      {preview.error && (
        <p className="small-text chat-error" role="alert">
          Preview failed · {failure(preview.error)}
        </p>
      )}
      {audio && (
        <audio controls autoPlay src={audio} aria-label="Voice preview" />
      )}
      {save.error && (
        <p className="small-text chat-error" role="alert">
          Save failed · {failure(save.error)}
        </p>
      )}
    </div>
  );
}
