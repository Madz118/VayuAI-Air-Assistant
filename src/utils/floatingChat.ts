import type { AqiScale, CityLocation, OrchestratorResponse } from '../types/airQuality.ts';

export const FLOATING_CHAT_WELCOME =
  "Hi! I'm VAYU AI. Let's make every breath smarter. How can I help you today?";

export const FLOATING_CHAT_SUGGESTIONS = [
  'Check my air quality',
  "Explain today's pollution",
  'Best time to go outside',
  'Protect my family',
] as const;

export const FLOATING_CHAT_MAX_LENGTH = 500;
export const FLOATING_CHAT_MIN_LENGTH = 3;

export interface FloatingChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  promptText?: string;
  response?: OrchestratorResponse;
  error?: string;
  isWelcome?: boolean;
}

export function createWelcomeMessage(): FloatingChatMessage {
  return {
    id: 'vayu-welcome',
    role: 'assistant',
    content: FLOATING_CHAT_WELCOME,
    createdAt: new Date().toISOString(),
    isWelcome: true,
  };
}

export function validateChatInput(
  raw: string,
  isLoading: boolean,
): { valid: boolean; cleaned: string; error?: string } {
  if (isLoading) {
    return {
      valid: false,
      cleaned: raw.trim(),
      error: 'Please wait for the current VAYU AI response to finish.',
    };
  }

  const cleaned = raw.replace(/\r\n/g, '\n').trim();
  if (cleaned.length < FLOATING_CHAT_MIN_LENGTH) {
    return {
      valid: false,
      cleaned,
      error: 'Please enter at least 3 characters so VAYU AI can analyze your question.',
    };
  }

  if (cleaned.length > FLOATING_CHAT_MAX_LENGTH) {
    return {
      valid: false,
      cleaned: cleaned.slice(0, FLOATING_CHAT_MAX_LENGTH),
      error: `Please keep questions under ${FLOATING_CHAT_MAX_LENGTH} characters.`,
    };
  }

  return { valid: true, cleaned };
}

export function buildFloatingChatPayload(params: {
  query: string;
  location: CityLocation;
  preferredScale: AqiScale;
}) {
  return {
    query: params.query.trim().slice(0, FLOATING_CHAT_MAX_LENGTH),
    location: params.location,
    preferredScale: params.preferredScale,
    // Privacy guard: floating chat never transmits local household profiles implicitly.
    profiles: [] as never[],
  };
}

export function formatAssistantResponseForCopy(message: FloatingChatMessage): string {
  const r = message.response;
  if (!r) {
    return message.content;
  }

  const lines: string[] = [
    `VAYU AI (${r.aqiScaleUsed})`,
    '',
    r.directAnswer,
  ];

  if (r.explanation) {
    lines.push('', `Details: ${r.explanation}`);
  }

  if (r.recommendedActions.length > 0) {
    lines.push('', 'Recommended Actions:');
    r.recommendedActions.forEach((action, idx) => {
      lines.push(`${idx + 1}. ${action}`);
    });
  }

  if (r.environmentalEvidence.length > 0) {
    lines.push('', `Evidence: ${r.environmentalEvidence.slice(0, 4).join(' | ')}`);
  }

  lines.push(
    '',
    `Source: ${r.dataSource} · Timestamp: ${r.dataTimestamp}`,
    `Verification: ${r.verification.passed ? 'Passed' : 'Flagged'}${r.aiSynthesized ? '' : ' (Deterministic agent fallback)'}`,
  );

  return lines.join('\n');
}
