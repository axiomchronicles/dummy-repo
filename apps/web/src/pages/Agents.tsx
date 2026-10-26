import { Button, Input, Textarea } from '../components/ui';
import { z } from 'zod';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AudioLines, FlaskConical, Pencil, Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AgentInputSchema,
  AgentVersionSchema,
  type AgentInput,
} from '@outreach/contracts';
import { api, command, date, label, type Agent, type Page } from '../api';
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
        title="Agent personas"
        description="Five starter personas. Editable instructions, versioned configuration, clear questions."
        action={
          <Button className="button primary" onClick={() => setEditing('new')}>
            <Plus size={17} />
            New persona
          </Button>
        }
      />
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
