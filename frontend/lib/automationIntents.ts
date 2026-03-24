'use client';

export type AutomationIntent = 'EMAIL_SUMMARY' | 'LEAD_FOLLOWUP' | 'ALERT_ME' | 'UNKNOWN';

const INTENT_KEYWORDS: Record<Exclude<AutomationIntent, 'UNKNOWN'>, string[]> = {
  EMAIL_SUMMARY: ['summarize', 'emails', 'inbox', 'daily summary'],
  LEAD_FOLLOWUP: ['follow up', 'leads', 'contacts', 'outreach'],
  ALERT_ME: ['alert', 'notify', 'tell me when', 'let me know'],
};

export function classifyAutomationIntent(text: string): AutomationIntent {
  const normalized = ` ${String(text || '').trim().toLowerCase()} `;
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS) as Array<[Exclude<AutomationIntent, 'UNKNOWN'>, string[]]>) {
    if (keywords.some((keyword) => normalized.includes(` ${keyword} `) || normalized.includes(keyword))) {
      return intent;
    }
  }
  return 'UNKNOWN';
}
