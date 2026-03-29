export function normalizeAssistantDisplayText(content: string): string {
  return content.replace(/\r\n/g, '\n');
}

export function normalizeInlineErrorMessage(message: string): string {
  return normalizeAssistantDisplayText(message).trim();
}
