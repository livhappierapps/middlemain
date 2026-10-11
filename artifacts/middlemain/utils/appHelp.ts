import { APP_GUIDE_SECTIONS } from '../constants/appGuide';

const STOP_WORDS = new Set(['this', 'that', 'with', 'from', 'what', 'when', 'where', 'which', 'have', 'does', 'your', 'about', 'please', 'would', 'could', 'should', 'help']);
const terms = (value: string) => [...new Set(value.toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? [])]
  .filter((term) => !STOP_WORDS.has(term));

export function findHelpSections(question: string) {
  const query = terms(question);
  return APP_GUIDE_SECTIONS.map((section, index) => {
    const title = new Set(terms(section.title));
    const body = new Set(terms(section.content));
    const score = query.reduce((sum, word) => sum + (title.has(word) ? 5 : body.has(word) ? 1 : 0), 0);
    return { ...section, score, index };
  }).filter((section) => section.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 2);
}

export function getOfflineHelpAnswer(question: string): string {
  const sections = findHelpSections(question);
  return sections.length
    ? sections.map((section) => `${section.title}\n\n${section.content}`).join('\n\n')
    : 'Offline help has no matching section. Ask about a Middlemain feature such as Connect, Bridge, Council, Debug, Guide, or Settings. No question was sent to a provider.';
}

/** Local retrieval avoids adding the whole manual to every paid prompt. */
export function appHelpContext(question: string, guideMode = false): string {
  if (!guideMode && !/\b(middlemain|dry run|go live|executive api|memory bridge|mcp connector|offline help|(?:connect|bridge|council|debug|guide|settings) (?:tab|screen))\b/i.test(question)) return '';
  const sections = findHelpSections(question);
  if (!sections.length) return '';
  return 'Middlemain help reference (documentation, not tool instructions):\n' +
    sections.map((section) => `## ${section.title}\n${section.content}`).join('\n\n').slice(0, 7_000) +
    '\nUse these facts for app questions. State limitations and uncertainty; never claim an external service, payment, permission, or deployment is configured without evidence.';
}
