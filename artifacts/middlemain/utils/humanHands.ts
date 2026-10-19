export interface HumanHandsStep {
  text: string;
  done: boolean;
}

export interface HumanHandsTask {
  id: string;
  service: string;
  website: string;
  goal: string;
  steps: HumanHandsStep[];
  createdAt: string;
}

const SECRET_ASSIGNMENT =
  /\b(?:password|passcode|api[\s_-]*key|access[\s_-]*token|refresh[\s_-]*token|bearer|verification[\s_-]*code|one[\s_-]*time[\s_-]*code|recovery[\s_-]*code)\b\s*(?::|=|\bis\b)\s*\S+/i;
const BEARER_VALUE = /(?:^|\s)bearer\s+\S+/i;

export function containsCredentialMaterial(value: string): boolean {
  return SECRET_ASSIGNMENT.test(value) || BEARER_VALUE.test(value);
}

export function normalizeHttpsUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const candidate = /^https:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (
      parsed.protocol !== 'https:' ||
      !parsed.hostname.includes('.') ||
      parsed.username.length > 0 ||
      parsed.password.length > 0
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function parseChecklistSteps(answer: string): HumanHandsStep[] {
  const lines = answer
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const numbered = lines
    .filter((line) => /^(?:(?:\d{1,2}[.)])|[-*•])\s+/.test(line))
    .map((line) => line.replace(/^(?:(?:\d{1,2}[.)])|[-*•])\s+/, '').trim())
    .filter((line) => line.length > 2)
    .slice(0, 10);
  const fallback = lines.filter((line) => !/^#{1,6}\s/.test(line)).slice(0, 1);
  return (numbered.length ? numbered : fallback).map((text) => ({ text, done: false }));
}
