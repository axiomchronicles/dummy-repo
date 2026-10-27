import { useState } from 'react';
import {
  Bot,
  Wrench,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  Cpu
} from 'lucide-react';

export function Agents() {
  const agents = [
    {
      id: 'outreach-planner',
      name: 'Outreach Planner Agent',
      role: 'Draft Synthesis & Policy Boundary',
      instructions:
        'Converts natural-language outreach requests into structured, verified campaign drafts. Proposes drafts for user review. Never places real calls.',
      tools: ['listConfiguredVoiceAgents', 'inspectImportBatch', 'checkEligibility'],
      skills: ['outreachPlanningSkill', 'callPolicySkill'],
      model: 'Configured Model / DeterministicLocalPlanner',
    },
    {
      id: 'campaign-supervisor',
      name: 'Campaign Supervisor Agent',
      role: 'Progress Monitoring & Explanation',
      instructions:
        'Monitors active campaign execution, counts contacts, identifies excluded contacts. Read-only access to progress.',
      tools: ['listConfiguredVoiceAgents', 'inspectImportBatch'],
      skills: ['callPolicySkill'],
      model: 'Configured Model / DeterministicLocalPlanner',
    },
    {
      id: 'post-call-analyst',
      name: 'Post-Call Analysis Agent',
      role: 'Objective Transcript Analysis',
      instructions:
        'Analyzes completed call transcripts. Classifies disposition strictly into confirmed, declined, reschedule_requested, wrong_number, or unknown.',
      tools: [],
      skills: ['postCallAnalysisSkill'],
      model: 'Configured Model / DeterministicLocalPlanner',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight">Mastra Agent Harness Registry</h2>
        <p className="text-xs text-neutral-400 mt-0.5">
          Configured Mastra 1.79 agents, tools, skills, and model harness boundaries.
        </p>
      </div>

      {/* Model Configuration Card */}
      <div className="bg-[#141414] border border-[#262626] rounded-2xl p-6 shadow-xl">
        <h3 className="text-sm font-bold text-neutral-200 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-red-500" />
          <span>LLM Provider Harness Configuration</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="p-4 rounded-xl bg-[#0B0B0B] border border-[#262626]">
            <span className="text-xs text-neutral-500 uppercase font-semibold">Configured Model ID</span>
            <div className="text-white font-mono font-medium mt-1">gpt-4o-mini / local-deterministic</div>
          </div>
          <div className="p-4 rounded-xl bg-[#0B0B0B] border border-[#262626]">
            <span className="text-xs text-neutral-500 uppercase font-semibold">Provider URL</span>
            <div className="text-white font-mono font-medium mt-1">https://api.openai.com/v1</div>
          </div>
          <div className="p-4 rounded-xl bg-[#0B0B0B] border border-[#262626]">
            <span className="text-xs text-neutral-500 uppercase font-semibold">API Key Secret State</span>
            <div className="text-emerald-400 font-semibold flex items-center gap-1.5 mt-1">
              <ShieldCheck className="w-4 h-4" />
              <span>Configured (Server-Side Only)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Agents Grid */}
      <div className="grid grid-cols-1 gap-4">
        {agents.map((agent) => (
          <div key={agent.id} className="bg-[#141414] border border-[#262626] rounded-2xl p-6 shadow-lg">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-red-500/10 text-red-500">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">{agent.name}</h3>
                  <span className="text-xs text-neutral-400">{agent.role}</span>
                </div>
              </div>
              <span className="font-mono text-xs text-neutral-500 bg-neutral-900 px-2 py-1 rounded border border-neutral-800">
                id: {agent.id}
              </span>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed mb-4 bg-[#0B0B0B] p-3 rounded-xl border border-[#262626]">
              {agent.instructions}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2 border-t border-[#262626]">
              <div>
                <span className="font-semibold text-neutral-400 flex items-center gap-1.5 mb-1.5">
                  <Wrench className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Bound Mastra Tools</span>
                </span>
                {agent.tools.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {agent.tools.map((t) => (
                      <span
                        key={t}
                        className="font-mono px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 text-[11px]"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-neutral-500 italic">No external mutation tools</span>
                )}
              </div>

              <div>
                <span className="font-semibold text-neutral-400 flex items-center gap-1.5 mb-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Active Skills</span>
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {agent.skills.map((s) => (
                    <span
                      key={s}
                      className="font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[11px] border border-amber-500/20"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
