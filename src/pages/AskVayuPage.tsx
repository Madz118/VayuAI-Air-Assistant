import React, { useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Send,
  ShieldCheck,
  User,
} from 'lucide-react';
import { useVayu } from '../context/VayuContext.tsx';
import type { OrchestratorResponse } from '../types/airQuality.ts';

interface ChatTurn {
  id: string;
  question: string;
  response?: OrchestratorResponse;
  error?: string;
  loading: boolean;
}

const SUGGESTED_QUESTIONS = [
  'Is it suitable to go jogging tomorrow?',
  'Why is air quality poor today?',
  'Which pollutants are increasing?',
  'Is it better to open my windows now?',
  'How can I protect my family?',
  'When should I travel outdoors?',
  'How can I reduce my contribution to pollution?',
];

export const AskVayuPage: React.FC = () => {
  const { location, preferences, profiles } = useVayu();
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [expandedTraceIds, setExpandedTraceIds] = useState<string[]>([]);

  const toggleTrace = (id: string) => {
    setExpandedTraceIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const submitQuestion = async (questionText: string) => {
    const cleaned = questionText.trim();
    if (cleaned.length < 3) return;

    const turnId = `turn-${Date.now().toString(36)}`;
    setTurns((prev) => [...prev, { id: turnId, question: cleaned, loading: true }]);
    setInput('');

    try {
      const anonymizedProfiles = profiles.map((p, idx) => ({
        id: `anon-${idx + 1}`,
        label: `Household member ${idx + 1}`,
        group: p.group,
        hasRespiratorySensitivity: p.hasRespiratorySensitivity,
        sensitivityNote: '',
        createdAt: '',
        updatedAt: '',
      }));

      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: cleaned,
          location,
          profiles: anonymizedProfiles,
          preferredScale: preferences.preferredScale,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || `Request failed with status ${res.status}`);
      }
      setTurns((prev) =>
        prev.map((t) => (t.id === turnId ? { ...t, loading: false, response: json as OrchestratorResponse } : t)),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to reach VAYU AI orchestrator.';
      setTurns((prev) =>
        prev.map((t) => (t.id === turnId ? { ...t, loading: false, error: msg } : t)),
      );
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitQuestion(input);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#F2F7FA]">
            Ask VAYU AI
          </h1>
          <p className="mt-1 text-sm text-[#9BB0C0]">
            Multi-agent conversational intelligence grounded in live Open-Meteo data for{' '}
            <strong className="text-[#F2F7FA]">{location.name}</strong> ({profiles.length} household profile
            {profiles.length === 1 ? '' : 's'} active; only anonymized group &amp; sensitivity flags are sent to Gemini, never names or notes).
          </p>
        </div>

        {turns.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setTurns([]);
              setExpandedTraceIds([]);
            }}
            className="rounded-xl border border-white/10 bg-[#102334] px-3.5 min-h-[38px] text-xs font-medium text-[#B5C7D4] hover:text-[#F2F7FA] hover:border-white/20"
          >
            Clear Conversation
          </button>
        )}
      </div>

      {/* Suggested Questions */}
      <section aria-label="Suggested questions" className="rounded-2xl border border-white/10 bg-[#102334]/95 p-5">
        <span className="block text-xs font-medium text-[#B5C7D4] mb-3">
          Suggested Environmental Questions
        </span>
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => submitQuestion(q)}
              className="rounded-xl border border-white/10 bg-[#0B1928] px-3.5 py-2 min-h-[38px] text-xs text-[#F2F7FA] hover:border-[#49E3D0]/50 hover:text-[#49E3D0] transition-colors text-left"
            >
              {q}
            </button>
          ))}
        </div>
      </section>

      {/* Conversation History */}
      <div className="space-y-5 pb-24" aria-live="polite">
        {turns.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-[#102334]/95 p-8 text-center">
            <Bot className="w-8 h-8 text-[#49E3D0] mx-auto mb-3" aria-hidden="true" />
            <h2 className="text-base font-semibold text-[#F2F7FA]">
              Ready to coordinate 5 specialist agents
            </h2>
            <p className="mt-1.5 text-sm text-[#9BB0C0] max-w-lg mx-auto">
              Select a suggested prompt above or ask any question about outdoor exercise, ventilation, family precautions, or pollutant trends.
            </p>
          </div>
        )}

        {turns.map((turn) => {
          const r = turn.response;
          const traceOpen = expandedTraceIds.includes(turn.id);
          return (
            <article key={turn.id} className="space-y-3">
              {/* User Question Bubble */}
              <div className="flex items-start gap-3 justify-end">
                <div className="rounded-2xl border border-[#49E3D0]/30 bg-[#16C7B0]/15 px-4 py-3 max-w-2xl">
                  <p className="text-sm font-medium text-[#F2F7FA]">{turn.question}</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-[#102334] border border-white/10 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-[#49E3D0]" aria-hidden="true" />
                </div>
              </div>

              {/* Loading State */}
              {turn.loading && (
                <div className="rounded-2xl border border-white/10 bg-[#102334] p-5 max-w-4xl">
                  <div className="flex items-center gap-2.5 text-sm text-[#49E3D0]">
                    <Bot className="w-4 h-4 animate-pulse" aria-hidden="true" />
                    <span>Coordinating Pollution Intelligence, Routine, Family, Sustainability & Verification agents...</span>
                  </div>
                </div>
              )}

              {/* Error State */}
              {turn.error && (
                <div role="alert" className="rounded-2xl border border-red-400/25 bg-[#102334] p-5 max-w-4xl">
                  <p className="text-sm font-semibold text-red-300">Request could not be completed</p>
                  <p className="mt-1 text-xs text-[#9BB0C0]">{turn.error}</p>
                </div>
              )}

              {/* Structured Verified Response */}
              {r && (
                <div className="rounded-2xl border border-white/10 bg-[#102334] p-6 max-w-4xl space-y-5">
                  {/* Agent Activity Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/10">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-[#49E3D0]">Agents Active:</span>
                      <span className="text-[#9BB0C0]">{r.agentsInvolved.join(' · ')}</span>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                        r.verification.passed ? 'text-emerald-300' : 'text-amber-300'
                      }`}
                    >
                      {r.verification.passed ? (
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      <span>{r.verification.passed ? 'Verification Passed' : 'Verification Flagged'}</span>
                    </span>
                  </div>

                  {/* 1. Direct Answer */}
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#49E3D0]">
                      Direct Answer
                    </h3>
                    <p className="mt-1.5 text-base font-medium text-[#F2F7FA] leading-relaxed">
                      {r.directAnswer}
                    </p>
                  </div>

                  {/* 2. Environmental Evidence */}
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#55B8E8]">
                      Environmental Evidence ({r.aqiScaleUsed})
                    </h3>
                    <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#9BB0C0]">
                      {r.environmentalEvidence.map((ev, idx) => (
                        <li key={idx} className="rounded-lg border border-white/10 bg-[#0B1928] px-3 py-2 font-mono">
                          {ev}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* 3. Explanation */}
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#9BB0C0]">
                      Explanation
                    </h3>
                    <p className="mt-1.5 text-sm text-[#F2F7FA]/90 leading-relaxed">{r.explanation}</p>
                  </div>

                  {/* 4. Recommended Actions */}
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#16C7B0]">
                      Recommended Actions
                    </h3>
                    <ul className="mt-2 space-y-1.5 text-sm text-[#F2F7FA]">
                      {r.recommendedActions.map((act, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="font-mono text-xs text-[#49E3D0] mt-1">{idx + 1}.</span>
                          <span>{act}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* 5. Limitations & Uncertainty */}
                  <div className="rounded-xl border border-white/10 bg-[#0B1928] p-3.5">
                    <h3 className="text-xs font-semibold text-[#F2F7FA]">Limitations & Uncertainty</h3>
                    <ul className="mt-1.5 space-y-1 text-xs text-[#9BB0C0]">
                      {r.limitationsAndUncertainty.map((lim, idx) => (
                        <li key={idx}>• {lim}</li>
                      ))}
                    </ul>
                    {r.aiError && (
                      <p className="mt-2 text-xs text-amber-300">
                        Note: Gemini language synthesis fallback active ({r.aiError}). Deterministic specialist agent evidence is shown above.
                      </p>
                    )}
                  </div>

                  {/* 6. Source, Timestamp & Agent Trace Toggle */}
                  <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs text-[#9BB0C0]">
                    <div className="font-mono">
                      {r.dataSource} · Timestamp: {r.dataTimestamp}
                    </div>
                    <button
                      type="button"
                      aria-expanded={traceOpen}
                      onClick={() => toggleTrace(turn.id)}
                      className="inline-flex items-center gap-1.5 py-1.5 text-xs font-medium text-[#49E3D0] hover:underline"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{traceOpen ? 'Hide Agent Trace' : 'Inspect Agent Trace'}</span>
                      {traceOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {traceOpen && (
                    <div className="space-y-2.5 pt-2">
                      {r.agentResults.map((ag) => (
                        <div key={ag.agent_name} className="rounded-xl border border-white/10 bg-[#0B1928] p-3.5 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-[#F2F7FA]">{ag.agent_name}</span>
                            <span className="font-mono text-[#49E3D0]">
                              {ag.status} · confidence: {ag.confidence}
                            </span>
                          </div>
                          <p className="mt-1.5 text-[#9BB0C0]">{ag.recommendation}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* Prompt Input Form */}
      <form
        onSubmit={handleSubmit}
        className="sticky bottom-4 z-20 mr-[68px] sm:mr-20 rounded-2xl border border-white/15 bg-[#0B1928] p-2.5 sm:p-3 shadow-[0_-12px_32px_rgba(7,17,31,0.92)] flex items-center gap-2 sm:gap-3 focus-within:border-[#49E3D0] focus-within:ring-2 focus-within:ring-[#49E3D0]/50"
      >
        <label htmlFor="ask-vayu-input" className="sr-only">
          Ask VAYU AI a question about air quality
        </label>
        <input
          id="ask-vayu-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about jogging tomorrow, window ventilation, pollutants, or family protection..."
          className="min-w-0 flex-1 bg-transparent px-2.5 sm:px-3 py-2 text-sm text-[#F2F7FA] placeholder-[#9BB0C0] focus:outline-none"
        />
        <button
          type="submit"
          disabled={input.trim().length < 3}
          aria-label="Send question to VAYU AI"
          className="inline-flex items-center gap-2 rounded-xl bg-[#16C7B0] px-3.5 sm:px-4 min-h-[42px] text-xs font-semibold text-[#07111F] hover:bg-[#49E3D0] disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <span>Ask VAYU</span>
          <Send className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
};
