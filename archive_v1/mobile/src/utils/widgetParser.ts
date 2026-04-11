export interface WidgetAction {
  id: string;
  label: string;
  theme?: 'primary' | 'secondary' | 'success' | 'danger';
  payload?: any;
}

export interface WidgetPayload {
  id: string;
  type: 'widget' | 'text' | 'error';
  widgetType?: string; // 'BarChart' | 'QuickLog' | null
  title?: string;
  message?: string; // Fallback text
  data?: any;
  actions?: WidgetAction[];
}

/**
 * Attempts to parse an AI response string.
 * If it's valid JSON matching the widget schema, it returns the structured object.
 * If it's plain text, it wraps it in a basic 'text' widget payload.
 */
export function parseServerResponse(rawMessage: string, id: string): WidgetPayload {
  try {
    // Basic heuristic: does it look like JSON?
    const trimmed = rawMessage.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const parsed = JSON.parse(trimmed);
      
      // Duck-type validation to ensure it's actually our widget format
      if (parsed.widgetType || parsed.type === 'widget') {
        return {
          id: parsed.id || id,
          type: parsed.type || 'widget',
          widgetType: parsed.widgetType || 'Unknown',
          title: parsed.title,
          data: parsed.data || {},
          actions: parsed.actions || [],
        };
      }
    }
  } catch (e) {
    // Fall through on JSON parse errors, treat as plain markdown/text
  }

  // Fallback: This is a standard text response from an older or simpler AI node
  return {
    id,
    type: 'text',
    message: rawMessage,
  };
}
