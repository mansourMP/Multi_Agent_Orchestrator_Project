'use client';

function normalizeStreamText(value: string): string {
  return String(value || '').replace(/\r\n/g, '\n');
}

function longestSuffixPrefixOverlap(left: string, right: string): number {
  const maxOverlap = Math.min(left.length, right.length, 512);
  for (let size = maxOverlap; size > 0; size -= 1) {
    if (left.slice(-size) === right.slice(0, size)) {
      return size;
    }
  }
  return 0;
}

function dedupeRepeatedBlocks(value: string): string {
  const normalized = normalizeStreamText(value).trim();
  if (!normalized) return normalized;
  const halfLength = Math.floor(normalized.length / 2);
  if (normalized.length % 2 === 0 && normalized.slice(0, halfLength) === normalized.slice(halfLength)) {
    return normalized.slice(0, halfLength).trim();
  }
  const blocks = normalized.split(/\n{2,}/);
  const deduped: string[] = [];
  for (const block of blocks) {
    const compact = block.trim();
    if (!compact) continue;
    if (deduped[deduped.length - 1] === compact) continue;
    deduped.push(compact);
  }
  return deduped.join('\n\n');
}

function mergeBoundaryText(current: string, incoming: string): string {
  const left = normalizeStreamText(current);
  const right = normalizeStreamText(incoming);
  if (!left) return right;
  if (!right) return left;
  if (left === right) return left;
  if (right.startsWith(left)) return right;
  if (left.startsWith(right) || left.includes(right)) return left;
  if (right.includes(left)) return right;
  const overlap = longestSuffixPrefixOverlap(left, right);
  if (overlap > 0) {
    return `${left}${right.slice(overlap)}`;
  }
  return `${left}${right}`;
}

function reconcileFinalText(streamed: string, finalReply: string): string {
  const streamedText = normalizeStreamText(streamed);
  const finalText = normalizeStreamText(finalReply);
  if (!finalText) return streamedText;
  if (!streamedText) return finalText;
  if (streamedText === finalText) return finalText;
  if (finalText.startsWith(streamedText)) return finalText;
  if (streamedText.startsWith(finalText)) return streamedText;
  const overlapFromStream = longestSuffixPrefixOverlap(streamedText, finalText);
  const overlapFromFinal = longestSuffixPrefixOverlap(finalText, streamedText);
  if (overlapFromStream >= overlapFromFinal && overlapFromStream > 0) {
    return `${streamedText}${finalText.slice(overlapFromStream)}`;
  }
  if (overlapFromFinal > 0) {
    return `${finalText}${streamedText.slice(overlapFromFinal)}`;
  }
  return finalText;
}

export function extractDisplaySuffix(previousDisplayText: string, nextDisplayText: string): string {
  const previous = normalizeStreamText(previousDisplayText);
  const next = normalizeStreamText(nextDisplayText);
  if (!next || next === previous || previous.startsWith(next)) {
    return '';
  }
  if (next.startsWith(previous)) {
    return next.slice(previous.length);
  }
  const overlap = longestSuffixPrefixOverlap(previous, next);
  if (overlap > 0) {
    return next.slice(overlap);
  }
  return next;
}

export function normalizeAssembledAssistantText(value: string): string {
  return dedupeRepeatedBlocks(normalizeStreamText(value));
}

export class StreamAssembler {
  private displayText = '';

  ingestDelta(chunk: string): string {
    this.displayText = normalizeAssembledAssistantText(mergeBoundaryText(this.displayText, chunk));
    return this.displayText;
  }

  finalize(result: string): string {
    this.displayText = normalizeAssembledAssistantText(reconcileFinalText(this.displayText, result));
    return this.displayText;
  }

  current(): string {
    return this.displayText;
  }

  drop(): void {
    this.displayText = '';
  }
}
