export const BRAND = {
  company: 'Empyralis',
  product: 'Empyralis',
  assistant: 'Empyralis Assistant',
  shortMark: 'empyralis',
  accentColor: '#2F3136',
  highlightColor: '#4A4D55',
  warningColor: '#F59E0B',
} as const;

export function withAssistantName(text: string): string {
  return text.replace(/\b(?:Orion|orion|Imperalis|imperalis|Empiralis|empiralis)\b/g, BRAND.assistant);
}
