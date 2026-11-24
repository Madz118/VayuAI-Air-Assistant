import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Minus,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  Wind,
  X,
} from 'lucide-react';
import { useFloatingChat } from '../../context/FloatingChatContext.tsx';
import { useVayu } from '../../context/VayuContext.tsx';
import {
  FLOATING_CHAT_MAX_LENGTH,
  FLOATING_CHAT_SUGGESTIONS,
  formatAssistantResponseForCopy,
  type FloatingChatMessage,
} from '../../utils/floatingChat.ts';

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back to textarea copy below
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.className = 'fixed -left-[9999px] top-0 opacity-0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export const FloatingVayuChat: React.FC = () => {
  const { location, preferences, notifications } = useVayu();
  const {
    messages,
    isOpen,
    isLoading,
    inputDraft,
    inputError,
    unreadAssistantCount,
    openChat,
    minimizeChat,
    closeChat,
    setInputDraft,
    sendMessage,
    retryMessage,
    clearChat,
  } = useFloatingChat();

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const [showSuggestionsDrawer, setShowSuggestionsDrawer] = useState(false);

  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const wasOpenRef = useRef(isOpen);

  const scaleBadge = preferences.preferredScale === 'european_aqi' ? 'EU EAQI' : 'US AQI';
  const hasOnlyWelcome = messages.length === 1 && Boolean(messages[0]?.isWelcome);
  const indicatorCount = unreadAssistantCount > 0 ? unreadAssistantCount : notifications.length;

  const scrollToBottom = useCallback(
    (instant = false) => {
      const behavior: ScrollBehavior =
        instant || preferences.reducedMotion ? 'auto' : 'smooth';
      messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
      setShowScrollToLatest(false);
    },
    [preferences.reducedMotion],
  );

  // Focus composer when opening, restore focus to launcher when closing
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      window.setTimeout(() => {
        inputRef.current?.focus();
        scrollToBottom(true);
      }, 40);
    } else if (!isOpen && wasOpenRef.current) {
      window.setTimeout(() => {
        launcherRef.current?.focus();
      }, 20);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, scrollToBottom]);

  // Auto-scroll when messages update or loading indicator appears
  useEffect(() => {
    if (!isOpen) return;
    scrollToBottom();
  }, [messages.length, isLoading, isOpen, scrollToBottom]);

  // Auto-resize textarea height up to ~4 lines
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  }, [inputDraft, isOpen]);

  // Escape closes expanded floating window
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeChat();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, closeChat]);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollToLatest(distanceFromBottom > 64);
  };

  const handleCopy = async (msg: FloatingChatMessage) => {
    const ok = await copyTextToClipboard(formatAssistantResponseForCopy(msg));
    if (ok) {
      setCopiedId(msg.id);
      window.setTimeout(() => {
        setCopiedId((current) => (current === msg.id ? null : current));
      }, 2000);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setShowSuggestionsDrawer(false);
    await sendMessage(inputDraft);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleSuggestionClick = (question: string) => {
    if (isLoading) return;
    setShowSuggestionsDrawer(false);
    void sendMessage(question);
  };

  return (
    <div className="fixed z-40 vayu-floating-anchor pointer-events-none">
      {/* Collapsed Launcher */}
      {!isOpen && (
        <div className="relative pointer-events-auto flex items-center justify-end">
          <button
            ref={launcherRef}
            type="button"
            onClick={openChat}
            aria-label={
              indicatorCount > 0
                ? `Chat with VAYU AI (${indicatorCount} active ${
                    unreadAssistantCount > 0 ? 'unread replies' : 'air quality advisories'
                  })`
                : 'Chat with VAYU AI'
            }
            aria-expanded={false}
            aria-haspopup="dialog"
            title="Chat with VAYU AI"
            data-testid="vayu-floating-launcher"
            className="peer order-2 relative w-14 h-14 rounded-full border border-[#49E3D0]/50 bg-gradient-to-br from-[#102334] via-[#0B1928] to-[#07111F] text-[#49E3D0] shadow-[0_8px_28px_rgba(22,199,176,0.34)] hover:shadow-[0_10px_36px_rgba(73,227,208,0.48)] hover:border-[#49E3D0] hover:scale-105 active:scale-95 transition-all flex items-center justify-center focus-visible:outline-2 focus-visible:outline-[#49E3D0] focus-visible:outline-offset-2"
          >
            <span
              className={`flex items-center justify-center pointer-events-none ${
                preferences.reducedMotion ? '' : 'vayu-launcher-float'
              }`}
            >
              <Wind className="w-6 h-6 text-[#49E3D0]" aria-hidden="true" />
            </span>
            {indicatorCount > 0 && (
              <span
                aria-hidden="true"
                data-testid="vayu-launcher-badge"
                className="absolute -top-1 -right-1 min-w-[20px] h-[20px] px-1 rounded-full bg-[#16C7B0] text-[#07111F] font-mono text-[10px] font-bold flex items-center justify-center border-2 border-[#07111F] shadow-sm"
              >
                {indicatorCount > 9 ? '9+' : indicatorCount}
              </span>
            )}
          </button>

          <span
            role="tooltip"
            className="order-1 hidden sm:inline-flex mr-3 rounded-xl border border-[#49E3D0]/30 bg-[#0B1928]/95 px-3 py-1.5 text-xs font-medium text-[#F2F7FA] shadow-lg whitespace-nowrap invisible opacity-0 translate-x-1 peer-hover:visible peer-hover:opacity-100 peer-hover:translate-x-0 peer-focus-visible:visible peer-focus-visible:opacity-100 peer-focus-visible:translate-x-0 transition-all pointer-events-none"
          >
            Chat with VAYU AI
          </span>
        </div>
      )}

      {/* Expanded Floating Chat Window */}
      {isOpen && (
        <section
          role="dialog"
          aria-modal="false"
          aria-labelledby="vayu-floating-chat-title"
          data-testid="vayu-floating-chat-panel"
          className="pointer-events-auto vayu-chat-panel-enter w-[min(404px,calc(100vw-1.5rem))] h-[min(590px,calc(100dvh-2rem))] sm:h-[min(600px,calc(100vh-3rem))] rounded-2xl border border-[#49E3D0]/25 bg-[#0B1928]/95 backdrop-blur-xl shadow-[0_22px_60px_rgba(2,8,18,0.78)] flex flex-col overflow-hidden"
        >
          {/* Header */}
          <header className="px-4 py-3 border-b border-white/10 bg-[#07111F]/90 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#16C7B0]/15 border border-[#49E3D0]/35 flex items-center justify-center shrink-0">
                <Wind className="w-4 h-4 text-[#49E3D0]" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2
                  id="vayu-floating-chat-title"
                  className="font-display text-sm font-bold text-[#F2F7FA] tracking-tight truncate"
                >
                  VAYU AI
                </h2>
                <p className="text-[11px] font-mono text-[#9BB0C0] truncate">
                  {location.name} · {scaleBadge}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={clearChat}
                disabled={hasOnlyWelcome && !isLoading}
                aria-label="Clear chat history"
                title="Clear chat"
                data-testid="vayu-chat-clear"
                className="min-w-[36px] min-h-[36px] rounded-lg flex items-center justify-center text-[#B5C7D4] hover:text-[#F2F7FA] hover:bg-white/10 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={minimizeChat}
                aria-label="Minimize chat window"
                title="Minimize"
                data-testid="vayu-chat-minimize"
                className="min-w-[36px] min-h-[36px] rounded-lg flex items-center justify-center text-[#B5C7D4] hover:text-[#F2F7FA] hover:bg-white/10 transition-colors"
              >
                <Minus className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={closeChat}
                aria-label="Close chat window"
                title="Close"
                data-testid="vayu-chat-close"
                className="min-w-[36px] min-h-[36px] rounded-lg flex items-center justify-center text-[#B5C7D4] hover:text-[#F2F7FA] hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </header>

          {/* Scrollable Message Viewport */}
          <div className="relative flex-1 min-h-0 flex flex-col">
            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              aria-live="polite"
              aria-label="Conversation messages"
              data-testid="vayu-chat-messages"
              className="flex-1 overflow-y-auto px-4 py-4 space-y-3.5"
            >
              {messages.map((msg) => {
                if (msg.role === 'user') {
                  return (
                    <div key={msg.id} className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-sm border border-[#49E3D0]/35 bg-[#16C7B0]/18 px-3.5 py-2.5 text-sm text-[#F2F7FA] whitespace-pre-wrap break-words leading-relaxed">
                        {msg.content}
                      </div>
                    </div>
                  );
                }

                // Error response bubble
                if (msg.error) {
                  return (
                    <div key={msg.id} className="flex items-start gap-2.5 justify-start">
                      <div className="w-7 h-7 rounded-lg bg-[#102334] border border-red-400/35 flex items-center justify-center shrink-0 mt-0.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-300" aria-hidden="true" />
                      </div>
                      <div
                        role="alert"
                        className="max-w-[88%] rounded-2xl rounded-tl-sm border border-red-400/30 bg-[#102334] p-3.5 space-y-2.5"
                      >
                        <p className="text-xs font-semibold text-red-300">
                          Unable to complete request
                        </p>
                        <p className="text-xs text-[#C6D6E2] leading-relaxed">{msg.error}</p>
                        {msg.promptText && (
                          <button
                            type="button"
                            onClick={() => void retryMessage(msg.id)}
                            disabled={isLoading}
                            data-testid="vayu-chat-retry"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#49E3D0]/35 bg-[#16C7B0]/15 px-2.5 py-1.5 text-xs font-medium text-[#49E3D0] hover:bg-[#16C7B0]/25 disabled:opacity-50"
                          >
                            <RefreshCw className="w-3 h-3" aria-hidden="true" />
                            <span>Retry</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }

                const r = msg.response;

                return (
                  <div key={msg.id} className="flex items-start gap-2.5 justify-start">
                    <div className="w-7 h-7 rounded-lg bg-[#102334] border border-[#49E3D0]/30 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="w-3.5 h-3.5 text-[#49E3D0]" aria-hidden="true" />
                    </div>

                    <div className="max-w-[88%] rounded-2xl rounded-tl-sm border border-white/10 bg-[#102334]/95 p-3.5 space-y-2.5">
                      <p className="text-sm text-[#F2F7FA] leading-relaxed">{msg.content}</p>

                      {r && (
                        <>
                          {r.explanation && (
                            <p className="text-xs text-[#B5C7D4] leading-relaxed">{r.explanation}</p>
                          )}

                          {r.recommendedActions.length > 0 && (
                            <div className="rounded-xl border border-white/10 bg-[#0B1928]/85 p-2.5 space-y-1.5">
                              <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#49E3D0]">
                                Recommended Actions
                              </span>
                              <ul className="space-y-1 text-xs text-[#E4EEF5]">
                                {r.recommendedActions.slice(0, 3).map((action, idx) => (
                                  <li key={idx} className="flex items-start gap-1.5 leading-relaxed">
                                    <span className="font-mono text-[11px] text-[#49E3D0] mt-0.5 shrink-0">
                                      {idx + 1}.
                                    </span>
                                    <span>{action}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {!r.aiSynthesized && r.aiError && (
                            <div
                              role="status"
                              className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-200 space-y-1.5"
                            >
                              <p>{r.aiError}</p>
                              {msg.promptText && (
                                <button
                                  type="button"
                                  onClick={() => void retryMessage(msg.id)}
                                  disabled={isLoading}
                                  className="inline-flex items-center gap-1 font-medium text-[#49E3D0] hover:underline disabled:opacity-50"
                                >
                                  <RefreshCw className="w-3 h-3" aria-hidden="true" />
                                  <span>Retry AI synthesis</span>
                                </button>
                              )}
                            </div>
                          )}

                          <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#9BB0C0]">
                            <div className="min-w-0 space-y-0.5">
                              <div className="inline-flex items-center gap-1 font-medium">
                                {r.verification.passed ? (
                                  <CheckCircle2
                                    className="w-3 h-3 text-emerald-300 shrink-0"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <AlertTriangle
                                    className="w-3 h-3 text-amber-300 shrink-0"
                                    aria-hidden="true"
                                  />
                                )}
                                <span
                                  className={
                                    r.verification.passed ? 'text-emerald-300' : 'text-amber-300'
                                  }
                                >
                                  {r.verification.passed
                                    ? 'Verification Passed'
                                    : 'Verification Flagged'}
                                </span>
                              </div>
                              <div className="font-mono text-[10px] text-[#9BB0C0] break-words">
                                {r.dataSource} · {r.dataTimestamp}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => void handleCopy(msg)}
                              aria-label={
                                copiedId === msg.id ? 'Response copied' : 'Copy response'
                              }
                              data-testid={`vayu-chat-copy-${msg.id}`}
                              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-[#0B1928] px-2.5 py-1 text-[11px] font-medium text-[#B5C7D4] hover:text-[#F2F7FA] hover:border-[#49E3D0]/40 transition-colors shrink-0"
                            >
                              {copiedId === msg.id ? (
                                <>
                                  <Check className="w-3 h-3 text-[#49E3D0]" aria-hidden="true" />
                                  <span className="text-[#49E3D0]">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" aria-hidden="true" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Suggested Question Chips on Welcome / Fresh State */}
              {(hasOnlyWelcome || showSuggestionsDrawer) && !isLoading && (
                <div
                  aria-label="Suggested questions"
                  className="pt-1 flex flex-wrap gap-2"
                >
                  {FLOATING_CHAT_SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => handleSuggestionClick(suggestion)}
                      className="rounded-xl border border-[#49E3D0]/30 bg-[#102334] px-3 py-1.5 min-h-[34px] text-xs font-medium text-[#E4EEF5] hover:border-[#49E3D0] hover:text-[#49E3D0] hover:bg-[#16C7B0]/10 transition-colors text-left"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}

              {/* Animated Three-Dot Typing Indicator */}
              {isLoading && (
                <div
                  role="status"
                  aria-label="VAYU AI is generating a response"
                  data-testid="vayu-chat-typing"
                  className="flex items-start gap-2.5 justify-start"
                >
                  <div className="w-7 h-7 rounded-lg bg-[#102334] border border-[#49E3D0]/30 flex items-center justify-center shrink-0">
                    <Bot className="w-3.5 h-3.5 text-[#49E3D0]" aria-hidden="true" />
                  </div>
                  <div className="rounded-2xl rounded-tl-sm border border-white/10 bg-[#102334] px-4 py-3 flex items-center gap-1.5">
                    <span className="sr-only">VAYU AI is analyzing air quality data...</span>
                    <span className="w-2 h-2 rounded-full bg-[#49E3D0] vayu-typing-dot" />
                    <span className="w-2 h-2 rounded-full bg-[#49E3D0] vayu-typing-dot vayu-typing-dot-2" />
                    <span className="w-2 h-2 rounded-full bg-[#49E3D0] vayu-typing-dot vayu-typing-dot-3" />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {showScrollToLatest && (
              <button
                type="button"
                onClick={() => scrollToBottom(false)}
                aria-label="Scroll to latest message"
                data-testid="vayu-chat-scroll-latest"
                className="absolute bottom-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full border border-[#49E3D0]/45 bg-[#07111F]/95 px-3 py-1.5 text-[11px] font-semibold text-[#49E3D0] shadow-lg hover:bg-[#102334] transition-colors"
              >
                <ArrowDown className="w-3 h-3" aria-hidden="true" />
                <span>Latest</span>
              </button>
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={handleSend}
            className="border-t border-white/10 bg-[#07111F]/95 p-3 space-y-2 shrink-0"
          >
            {inputError && (
              <p role="alert" className="text-[11px] text-amber-300 px-1">
                {inputError}
              </p>
            )}

            <div className="flex items-end gap-2 rounded-xl border border-white/15 bg-[#0B1928] px-3 py-2 focus-within:border-[#49E3D0] focus-within:ring-2 focus-within:ring-[#49E3D0]/35">
              <label htmlFor="vayu-floating-input" className="sr-only">
                Ask VAYU AI a question about air quality
              </label>
              <textarea
                ref={inputRef}
                id="vayu-floating-input"
                rows={1}
                value={inputDraft}
                maxLength={FLOATING_CHAT_MAX_LENGTH}
                onChange={(e) => setInputDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about air quality, pollutants, or timing..."
                disabled={isLoading}
                data-testid="vayu-floating-input"
                className="flex-1 min-w-0 bg-transparent py-1 text-sm text-[#F2F7FA] placeholder-[#9BB0C0] resize-none focus:outline-none focus-visible:outline-none max-h-28 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={isLoading || inputDraft.trim().length < 3}
                aria-label="Send message to VAYU AI"
                data-testid="vayu-floating-send"
                className="min-w-[38px] min-h-[38px] rounded-lg bg-[#16C7B0] text-[#07111F] hover:bg-[#49E3D0] disabled:opacity-45 disabled:pointer-events-none flex items-center justify-center transition-colors shrink-0"
              >
                <Send className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 px-0.5 text-[10px] text-[#9BB0C0]">
              <span>Open-Meteo data · Household profiles stay on-device</span>
              {!hasOnlyWelcome && (
                <button
                  type="button"
                  onClick={() => setShowSuggestionsDrawer((v) => !v)}
                  className="inline-flex items-center gap-1 text-[#49E3D0] hover:underline shrink-0"
                >
                  <Sparkles className="w-3 h-3" aria-hidden="true" />
                  <span>{showSuggestionsDrawer ? 'Hide prompts' : 'Prompts'}</span>
                </button>
              )}
            </div>
          </form>
        </section>
      )}
    </div>
  );
};
