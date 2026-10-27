import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUp,
  Square,
  SquarePen,
  RotateCcw,
  PanelLeftClose,
  Menu,
  Check,
  X,
  LoaderCircle,
} from 'lucide-react';
import { ChatDraftSchema, readSse, type ChatDraft } from '@outreach/contracts';
import { api, message, type Agent, type Page } from '../api';
import { Button } from '../components/ui';
import { CallReviewDrawer, ModePill, Operation } from './CallReview';

type Thread = { id: string; title: string };
type ToolLine = {
  id: string;
  name: string;
  state: 'run' | 'ok' | 'fail';
  error?: string;
};
type ChatMessage = {
  id: string;
  role: string;
  content: string;
  metadata?: { draft?: ChatDraft; error?: { message: string } };
};

// Real tool names emitted by the API (apps/api/src/call-tools.ts).
const toolText: Record<string, [string, string]> = {
  resolve_contact: ['Resolving contact…', 'Contact resolved'],
  get_eligibility: ['Checking eligibility…', 'Eligibility checked'],
  get_telephony_configuration: ['Checking telephony…', 'Telephony checked'],
  prepare_call_plan: ['Preparing call…', 'Call plan prepared'],
};
const toolLabel = (t: ToolLine) =>
  toolText[t.name]?.[t.state === 'run' ? 0 : 1] ?? t.name.replaceAll('_', ' ');

const examples = [
  'Call Pawan Kumar to confirm tomorrow’s interview. Simulate without dialing.',
  'Simulate a reminder call to a saved contact about their appointment.',
];

export function Chat() {
  const threads = useQuery({
    queryKey: ['chat-threads'],
    queryFn: () => api<Page<Thread>>('/chat/threads'),
  });
  const agents = useQuery({
    queryKey: ['agents'],
    queryFn: () => api<Page<Agent>>('/agents'),
  });
  const [thread, setThread] = useState<string>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [tools, setTools] = useState<ToolLine[]>([]);
  const [stopped, setStopped] = useState(false);
  const [lastPrompt, setLastPrompt] = useState('');
  const [agentId, setAgentId] = useState('');
  const [review, setReview] = useState<ChatDraft>();
  const [historyOpen, setHistoryOpen] = useState(
    () => typeof window !== 'undefined' && window.innerWidth > 900,
  );
  const controller = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages, tools]);

  function reset() {
    controller.current?.abort();
    setError(undefined);
    setStopped(false);
    setTools([]);
  }
  async function openThread(id: string) {
    reset();
    setThread(id);
    if (window.innerWidth <= 900) setHistoryOpen(false);
    try {
      setMessages(await api<ChatMessage[]>(`/chat/threads/${id}/messages`));
    } catch (e) {
      setError(e);
    }
  }
  async function send(text = input) {
    if (!text.trim() || busy) return;
    const content = text.trim();
    setInput('');
    setLastPrompt(content);
    setBusy(true);
    setError(undefined);
    setStopped(false);
    setTools([]);
    const abort = new AbortController();
    controller.current = abort;
    const temporary = crypto.randomUUID();
    try {
      let id = thread;
      if (!id) {
        const created = await api<Thread>('/chat/threads', {
          method: 'POST',
          body: JSON.stringify({ title: content.slice(0, 70) }),
          signal: abort.signal,
        });
        id = created.id;
        setThread(id);
        void threads.refetch();
      }
      setMessages((previous) => [
        ...previous,
        { id: crypto.randomUUID(), role: 'user', content },
        { id: temporary, role: 'assistant', content: '' },
      ]);
      const response = await fetch(`/api/v1/chat/threads/${id}/stream`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({ content, ...(agentId ? { agentId } : {}) }),
        signal: abort.signal,
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error?.message ?? 'Chat stream unavailable.');
      }
      const patch = (fn: (m: ChatMessage) => ChatMessage) =>
        setMessages((previous) =>
          previous.map((m) => (m.id === temporary ? fn(m) : m)),
        );
      let done = false;
      for await (const event of readSse(response.body, abort.signal)) {
        const data = JSON.parse(event.data);
        if (event.event === 'delta')
          patch((m) => ({ ...m, content: m.content + data.text }));
        if (event.event === 'tool.started')
          setTools((t) => [
            ...t,
            { id: data.executionId, name: String(data.name), state: 'run' },
          ]);
        if (event.event === 'tool.result')
          setTools((t) =>
            t.map((l) =>
              l.id === data.executionId
                ? {
                    ...l,
                    state: data.ok ? 'ok' : 'fail',
                    error: data.error?.message,
                  }
                : l,
            ),
          );
        if (event.event === 'draft') {
          const draft = ChatDraftSchema.parse(data);
          patch((m) => ({ ...m, metadata: { draft } }));
        }
        if (event.event === 'done') {
          done = true;
          patch(() => data);
        }
        if (event.event === 'error')
          throw new Error(`${data.code}: ${data.message}`);
      }
      if (!done && !abort.signal.aborted)
        throw new Error(
          'The connection ended before completion. Retry to load saved progress.',
        );
    } catch (e) {
      if (abort.signal.aborted) setStopped(true);
      else setError(e);
    } finally {
      if (controller.current === abort) {
        controller.current = null;
        setBusy(false);
        composer.current?.focus();
      }
    }
  }
  // Retry reloads what the server saved first. If a plan was already persisted
  // it is shown instead of re-sending, so no second plan or call is created.
  async function retry() {
    setError(undefined);
    setStopped(false);
    if (thread) {
      try {
        const saved = await api<ChatMessage[]>(
          `/chat/threads/${thread}/messages`,
        );
        const last = saved.at(-1);
        if (
          last?.role === 'assistant' &&
          (last.metadata?.draft || (last.content && !last.metadata?.error))
        ) {
          setMessages(saved);
          setTools([]);
          return;
        }
        setMessages(saved);
      } catch (e) {
        setError(e);
        return;
      }
    }
    await send(lastPrompt);
  }
  const lastTool = tools.at(-1);
  const failedTool = tools.find((t) => t.state === 'fail');
  const activeTool = failedTool ?? lastTool;
  return (
    <div className="chat" data-history={historyOpen ? 'open' : 'closed'}>
      <aside
        className="chat-threads"
        aria-label="Conversation history"
        hidden={!historyOpen}
      >
        <div className="chat-threads-head">
          <Button
            variant="ghost"
            className="tap"
            onClick={() => {
              reset();
              setThread(undefined);
              setMessages([]);
              composer.current?.focus();
            }}
          >
            <SquarePen size={16} aria-hidden />
            New chat
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="tap"
            aria-label="Hide conversation history"
            onClick={() => setHistoryOpen(false)}
          >
            <PanelLeftClose size={16} />
          </Button>
        </div>
        <p className="chat-threads-label">Recent</p>
        <nav aria-label="Recent conversations">
          {threads.data?.items.map((t) => (
            <button
              key={t.id}
              className="tap"
              onClick={() => void openThread(t.id)}
              aria-current={thread === t.id ? 'page' : undefined}
            >
              {t.title}
            </button>
          ))}
          {threads.data && !threads.data.items.length && (
            <p className="muted small-text">No conversations yet.</p>
          )}
        </nav>
      </aside>
      <div className="chat-main">
        {!historyOpen && (
          <Button
            variant="ghost"
            size="icon"
            className="tap chat-history-toggle"
            aria-label="Show conversation history"
            onClick={() => setHistoryOpen(true)}
          >
            <Menu size={18} />
          </Button>
        )}
        <div
          className="chat-scroll"
          aria-label="Conversation"
          role="log"
          aria-live="polite"
        >
          {!messages.length && (
            <div className="chat-welcome">
              <h1>Who would you like to reach?</h1>
              <p className="muted">
                Prepare a call, review the exact recipient, and follow the
                result here.
              </p>
              <div className="chat-examples">
                {examples.map((e) => (
                  <button key={e} className="tap" onClick={() => setInput(e)}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <article className={`chat-message ${m.role}`} key={m.id}>
              <span className="sr-only">
                {m.role === 'user' ? 'You said' : 'Assistant'}
              </span>
              <div className="chat-prose">
                {m.content}
                {busy &&
                  m.role === 'assistant' &&
                  m.id === messages.at(-1)?.id && (
                    <span className="chat-caret" aria-hidden />
                  )}
              </div>
              {m.metadata?.draft && (
                <>
                  <PlanSummary
                    draft={m.metadata.draft}
                    review={() => setReview(m.metadata!.draft)}
                  />
                  <Operation id={m.metadata.draft.campaignId} />
                </>
              )}
            </article>
          ))}
          {activeTool && (busy || activeTool.state === 'fail') && (
            <p
              className="tool-line"
              data-state={activeTool.state}
              role="status"
            >
              {activeTool.state === 'run' ? (
                <LoaderCircle size={13} className="spin" aria-hidden />
              ) : activeTool.state === 'ok' ? (
                <Check size={13} aria-hidden />
              ) : (
                <X size={13} aria-hidden />
              )}
              <span>
                {toolLabel(activeTool)}
                {activeTool.error ? ` ${activeTool.error}` : ''}
              </span>
            </p>
          )}
          {stopped && (
            <p className="chat-note" role="status">
              Stopped. Saved progress is kept; nothing was launched.
            </p>
          )}
          {error != null && (
            <p className="chat-error" role="alert">
              {message(error)}
            </p>
          )}
          {(error != null || stopped) && lastPrompt && !busy && (
            <Button
              variant="outline"
              size="sm"
              className="tap"
              onClick={() => void retry()}
            >
              <RotateCcw size={14} aria-hidden />
              Retry
            </Button>
          )}
          <div ref={end} />
        </div>
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            ref={composer}
            aria-label="Message outreach assistant"
            aria-describedby="composer-hint"
            placeholder="Ask to call a saved contact…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={1}
            disabled={busy}
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="composer-row">
            <select
              aria-label="Voice agent"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              disabled={busy}
            >
              <option value="">Best matching agent</option>
              {agents.data?.items.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            {busy ? (
              <Button
                type="button"
                size="icon"
                className="composer-send"
                aria-label="Stop generation"
                onClick={() => controller.current?.abort()}
              >
                <Square size={14} fill="currentColor" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                className="composer-send"
                aria-label="Send message"
                disabled={!input.trim()}
              >
                <ArrowUp size={18} />
              </Button>
            )}
          </div>
        </form>
        <p className="composer-hint" id="composer-hint">
          Enter to send · Shift+Enter for a new line. Real calls need a reviewed
          recipient and explicit confirmation.
        </p>
      </div>
      {review && (
        <CallReviewDrawer
          campaignId={review.campaignId}
          initial={review}
          close={() => setReview(undefined)}
        />
      )}
    </div>
  );
}

function PlanSummary({
  draft,
  review,
}: {
  draft: ChatDraft;
  review: () => void;
}) {
  return (
    <div className="plan-summary" data-mode={draft.mode}>
      <div className="plan-summary-head">
        <strong>{draft.target?.name ?? 'Call plan'}</strong>
        <ModePill mode={draft.mode} />
      </div>
      <p className="muted small-text">
        <span className="mono">{draft.target?.destinationMasked}</span> ·{' '}
        {draft.eligibleCount} eligible · {draft.excludedCount} excluded ·{' '}
        {draft.agentName}
      </p>
      <Button variant="outline" size="sm" className="tap" onClick={review}>
        Review call plan
      </Button>
    </div>
  );
}
