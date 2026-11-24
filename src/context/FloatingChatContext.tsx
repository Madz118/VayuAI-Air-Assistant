import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useVayu } from './VayuContext.tsx';
import type { OrchestratorResponse } from '../types/airQuality.ts';
import {
  buildFloatingChatPayload,
  createWelcomeMessage,
  validateChatInput,
  type FloatingChatMessage,
} from '../utils/floatingChat.ts';

interface FloatingChatContextValue {
  messages: FloatingChatMessage[];
  isOpen: boolean;
  isLoading: boolean;
  inputDraft: string;
  inputError: string | null;
  unreadAssistantCount: number;
  openChat: () => void;
  minimizeChat: () => void;
  closeChat: () => void;
  toggleChat: () => void;
  setInputDraft: (value: string) => void;
  clearInputError: () => void;
  sendMessage: (text: string) => Promise<void>;
  retryMessage: (messageId: string) => Promise<void>;
  clearChat: () => void;
}

const FloatingChatContext = createContext<FloatingChatContextValue | null>(null);

const REQUEST_TIMEOUT_MS = 25_000;

export function FloatingChatProvider({ children }: { children: React.ReactNode }) {
  const { location, preferences } = useVayu();

  // Ephemeral in-memory React state only (never stored in localStorage).
  const [messages, setMessages] = useState<FloatingChatMessage[]>(() => [createWelcomeMessage()]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [inputDraft, setInputDraftState] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [unreadAssistantCount, setUnreadAssistantCount] = useState(0);

  const inFlightRef = useRef(false);
  const activeAbortRef = useRef<AbortController | null>(null);
  const sessionEpochRef = useRef(0);
  const isOpenRef = useRef(isOpen);

  useEffect(() => {
    isOpenRef.current = isOpen;
    if (isOpen) {
      setUnreadAssistantCount(0);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      activeAbortRef.current?.abort();
    };
  }, []);

  const setInputDraft = useCallback((value: string) => {
    setInputDraftState(value);
    setInputError(null);
  }, []);

  const clearInputError = useCallback(() => {
    setInputError(null);
  }, []);

  const openChat = useCallback(() => {
    setIsOpen(true);
    setUnreadAssistantCount(0);
  }, []);

  const minimizeChat = useCallback(() => {
    setIsOpen(false);
  }, []);

  const closeChat = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggleChat = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) setUnreadAssistantCount(0);
      return next;
    });
  }, []);

  const executeAskRequest = useCallback(
    async (
      cleanedQuery: string,
      options: { replaceMessageId?: string; clearDraft?: boolean } = {},
    ) => {
      if (inFlightRef.current) return;

      inFlightRef.current = true;
      setIsLoading(true);
      setInputError(null);
      if (options.clearDraft) {
        setInputDraftState('');
      }

      const epoch = sessionEpochRef.current;
      const nowIso = new Date().toISOString();

      if (options.replaceMessageId) {
        setMessages((prev) =>
          prev.filter((m) => m.id !== options.replaceMessageId),
        );
      } else {
        const userMsg: FloatingChatMessage = {
          id: `usr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          role: 'user',
          content: cleanedQuery,
          createdAt: nowIso,
        };
        setMessages((prev) => [...prev, userMsg]);
      }

      activeAbortRef.current?.abort();
      const controller = new AbortController();
      activeAbortRef.current = controller;
      const timeoutId = window.setTimeout(() => controller.abort('timeout'), REQUEST_TIMEOUT_MS);

      try {
        const payload = buildFloatingChatPayload({
          query: cleanedQuery,
          location,
          preferredScale: preferences.preferredScale,
        });

        const res = await fetch('/api/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        let json: unknown = null;
        try {
          json = await res.json();
        } catch {
          json = null;
        }

        if (epoch !== sessionEpochRef.current) {
          return;
        }

        if (!res.ok) {
          const errMsg =
            json && typeof json === 'object' && 'error' in json && typeof (json as { error?: unknown }).error === 'string'
              ? (json as { error: string }).error
              : `VAYU AI returned HTTP ${res.status}.`;
          throw new Error(errMsg);
        }

        const data = json as OrchestratorResponse;
        const assistantMsg: FloatingChatMessage = {
          id: `ast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          role: 'assistant',
          content: data.directAnswer,
          createdAt: new Date().toISOString(),
          promptText: cleanedQuery,
          response: data,
        };
        setMessages((prev) => [...prev, assistantMsg]);
        if (!isOpenRef.current) {
          setUnreadAssistantCount((c) => c + 1);
        }
      } catch (err) {
        if (epoch !== sessionEpochRef.current) {
          return;
        }
        const isTimeout =
          (err instanceof DOMException && err.name === 'AbortError') ||
          controller.signal.aborted;
        const msg = isTimeout
          ? 'Request timed out while contacting VAYU AI. Please retry.'
          : err instanceof Error
            ? err.message
            : 'Unable to reach VAYU AI service right now.';

        const errorMsg: FloatingChatMessage = {
          id: `err-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          role: 'assistant',
          content: msg,
          createdAt: new Date().toISOString(),
          promptText: cleanedQuery,
          error: msg,
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        window.clearTimeout(timeoutId);
        if (activeAbortRef.current === controller) {
          activeAbortRef.current = null;
        }
        inFlightRef.current = false;
        setIsLoading(false);
      }
    },
    [location, preferences.preferredScale],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const check = validateChatInput(text, inFlightRef.current);
      if (!check.valid) {
        if (check.error) setInputError(check.error);
        return;
      }
      await executeAskRequest(check.cleaned, { clearDraft: true });
    },
    [executeAskRequest],
  );

  const retryMessage = useCallback(
    async (messageId: string) => {
      if (inFlightRef.current) return;
      const target = messages.find((m) => m.id === messageId);
      if (!target?.promptText) return;
      await executeAskRequest(target.promptText, { replaceMessageId: messageId });
    },
    [messages, executeAskRequest],
  );

  const clearChat = useCallback(() => {
    sessionEpochRef.current += 1;
    activeAbortRef.current?.abort();
    activeAbortRef.current = null;
    inFlightRef.current = false;
    setIsLoading(false);
    setInputError(null);
    setUnreadAssistantCount(0);
    setMessages([createWelcomeMessage()]);
  }, []);

  const value = useMemo<FloatingChatContextValue>(
    () => ({
      messages,
      isOpen,
      isLoading,
      inputDraft,
      inputError,
      unreadAssistantCount,
      openChat,
      minimizeChat,
      closeChat,
      toggleChat,
      setInputDraft,
      clearInputError,
      sendMessage,
      retryMessage,
      clearChat,
    }),
    [
      messages,
      isOpen,
      isLoading,
      inputDraft,
      inputError,
      unreadAssistantCount,
      openChat,
      minimizeChat,
      closeChat,
      toggleChat,
      setInputDraft,
      clearInputError,
      sendMessage,
      retryMessage,
      clearChat,
    ],
  );

  return <FloatingChatContext.Provider value={value}>{children}</FloatingChatContext.Provider>;
}

export function useFloatingChat(): FloatingChatContextValue {
  const ctx = useContext(FloatingChatContext);
  if (!ctx) {
    throw new Error('useFloatingChat must be used inside FloatingChatProvider.');
  }
  return ctx;
}
