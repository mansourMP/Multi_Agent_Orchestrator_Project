type ExecutionTarget = 'auto' | 'cloud' | 'local_companion';
type WorkflowDefaultNodeType = 'trigger' | 'agent' | 'tool' | 'decision' | 'human' | 'data' | 'subflow';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeExecutionTarget(value: unknown): ExecutionTarget {
  const token = String(value || '').trim().toLowerCase();
  if (token === 'local') return 'local_companion';
  if (token === 'local_companion') return 'local_companion';
  if (token === 'cloud') return 'cloud';
  return 'auto';
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function mergeConfigDefaults(
  defaults: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = clone(defaults);
  for (const [key, value] of Object.entries(overrides)) {
    if (isRecord(value) && isRecord(next[key])) {
      next[key] = mergeConfigDefaults(next[key] as Record<string, unknown>, value);
      continue;
    }
    next[key] = clone(value);
  }
  return next;
}

export function defaultFileMountGrants() {
  return [
    { mount: 'artifacts', grant: 'read_write' },
    { mount: 'project', grant: 'read' },
    { mount: 'shared', grant: 'read' },
    { mount: 'knowledge', grant: 'read' },
    { mount: 'local_root', grant: 'none' },
    { mount: 'connector_files', grant: 'read' },
  ];
}

function defaultPermissions(overrides: Record<string, unknown> = {}) {
  return mergeConfigDefaults(
    {
      trust_preset: 'standard_local',
      action_policy: 'guarded',
      connector_permissions: [],
      browser_permissions: { allow: false },
      file_mount_grants: defaultFileMountGrants(),
      remembered_grants: {
        folders: [],
        browser_session: false,
        shell_capabilities: [],
      },
    },
    overrides,
  );
}

export function buildDefaultCanonicalConfig(type: WorkflowDefaultNodeType, variant = ''): Record<string, unknown> {
  if (type === 'trigger') {
    if (variant === 'connector_event') return { test_only: false, connector: '', event: '' };
    if (variant === 'schedule') return { test_only: false, schedule: { cron: '0 9 * * 1-5' } };
    if (variant === 'webhook') return { test_only: false, webhook: { method: 'POST', path: '/webhooks/inbound' } };
    if (variant === 'workflow') return { test_only: false, workflow_id: '' };
    if (variant === 'file_watch') return { test_only: false, file_watch: { path: '/watch/inbox' } };
    return { test_only: true };
  }

  if (type === 'agent') {
    return {
      identity: {
        name: 'Agent',
        role: 'operator',
        goal: '',
        success_condition: '',
        output_contract: '',
      },
      runtime: {
        execution_target: 'auto',
        timeout_seconds: 300,
        token_budget: null,
        retry_policy: { max_attempts: 1 },
      },
      skills: {
        skill_bundle_ids: [],
        prompt_append: '',
      },
      tools: {
        dynamic_allowed: [],
        explicit_required: [],
      },
      memory: {
        read_scopes: ['session', 'project'],
        write_scopes: ['session'],
        retrieval_policy: 'recent',
      },
      connectors: {
        bindings: [],
      },
      permissions: defaultPermissions(),
    };
  }

  if (type === 'tool') {
    if (variant === 'http') {
      return {
        summary: 'HTTP request',
        execution_target: 'auto',
        method: 'GET',
        url: 'https://api.example.com',
        permissions: defaultPermissions(),
      };
    }
    if (variant === 'browser') {
      return {
        summary: 'Browser action',
        execution_target: 'local_companion',
        url: 'https://example.com',
        permissions: defaultPermissions({ browser_permissions: { allow: true } }),
      };
    }
    if (variant === 'file') {
      return {
        summary: 'File action',
        execution_target: 'auto',
        path: 'artifacts/output.txt',
        content_type: 'text/plain; charset=utf-8',
        permissions: defaultPermissions(),
      };
    }
    if (variant === 'shell') {
      return {
        summary: 'Shell action',
        execution_target: 'local_companion',
        command: 'printf "hello\\n"',
        permissions: defaultPermissions(),
      };
    }
    if (variant === 'document') {
      return {
        summary: 'Create document',
        execution_target: 'auto',
        operation: 'create',
        title: 'Empyralist Document',
        permissions: defaultPermissions(),
      };
    }
    if (variant === 'spreadsheet') {
      return {
        summary: 'Create spreadsheet',
        execution_target: 'auto',
        operation: 'create',
        title: 'Empyralist Sheet',
        permissions: defaultPermissions(),
      };
    }
    if (variant === 'code') {
      return {
        summary: 'Requires reviewed execution path',
        execution_target: 'local_companion',
        code: 'print("ok")',
        permissions: defaultPermissions(),
      };
    }
    return {
      summary: 'Tool action',
      execution_target: 'auto',
      connector: '',
      action_id: '',
      permissions: defaultPermissions(),
    };
  }

  if (type === 'human') {
    return {
      title: variant === 'wait_for_reply' ? 'Wait for reply' : variant === 'review' ? 'Review required' : 'Approval required',
      instructions: '',
      decision_options: variant === 'approval' ? ['approve', 'reject'] : [],
    };
  }

  if (type === 'decision') {
    return {
      expression: variant === 'classifier' ? 'Classify the input into named routes.' : 'Continue only when the required condition is true',
      routes: variant === 'field_router' ? ['route_a', 'route_b'] : [],
    };
  }

  if (type === 'data') {
    return {
      mapping: variant === 'validate' ? 'Validate the structured payload before continuing.' : 'Map fields to output payload',
      template: variant === 'compose' ? 'Compose the final structured message.' : '',
    };
  }

  return {
    workflow_id: '',
    mode: 'sync',
  };
}

export function resetCanonicalConfigForVariant(
  type: WorkflowDefaultNodeType,
  variant: string,
  currentInput: unknown,
): Record<string, unknown> {
  const current = isRecord(currentInput) ? currentInput : {};
  const defaults = buildDefaultCanonicalConfig(type, variant);

  if (type === 'agent') {
    return mergeConfigDefaults(defaults, current);
  }

  if (type === 'trigger') {
    if (variant === 'connector_event') {
      return mergeConfigDefaults(defaults, {
        connector: current.connector,
        event: current.event,
      });
    }
    if (variant === 'schedule') {
      return mergeConfigDefaults(defaults, {
        schedule: isRecord(current.schedule) ? current.schedule : {},
      });
    }
    if (variant === 'webhook') {
      return mergeConfigDefaults(defaults, {
        webhook: isRecord(current.webhook) ? current.webhook : {},
      });
    }
    if (variant === 'workflow') {
      return mergeConfigDefaults(defaults, { workflow_id: current.workflow_id });
    }
    if (variant === 'file_watch') {
      return mergeConfigDefaults(defaults, {
        file_watch: isRecord(current.file_watch) ? current.file_watch : {},
      });
    }
    return defaults;
  }

  if (type === 'tool') {
    const next = mergeConfigDefaults(defaults, {
      summary: current.summary,
      execution_target: current.execution_target ? normalizeExecutionTarget(current.execution_target) : undefined,
      permissions: isRecord(current.permissions) ? current.permissions : {},
    });
    if (variant === 'connector_action') {
      return mergeConfigDefaults(next, {
        connector: current.connector,
        action_id: current.action_id,
        url: current.url,
        path: current.path,
        file_path: current.file_path,
        signing_secret: current.signing_secret,
        recipient_id: current.recipient_id,
        comment_id: current.comment_id,
      });
    }
    if (variant === 'http') {
      return mergeConfigDefaults(next, {
        method: current.method,
        url: current.url,
        headers: current.headers,
        payload: current.payload,
      });
    }
    if (variant === 'browser') {
      return mergeConfigDefaults(next, { url: current.url, browser_actions: current.browser_actions });
    }
    if (variant === 'file') {
      return mergeConfigDefaults(next, {
        path: current.path,
        file_path: current.file_path,
        content: current.content,
        content_type: current.content_type,
      });
    }
    if (variant === 'shell' || variant === 'code') {
      return mergeConfigDefaults(next, {
        command: current.command,
        argv: current.argv,
        cwd: current.cwd,
        timeout_seconds: current.timeout_seconds,
        code: current.code,
      });
    }
    if (variant === 'document' || variant === 'spreadsheet') {
      return mergeConfigDefaults(next, {
        title: current.title,
        operation: current.operation,
        path: current.path,
        file_path: current.file_path,
        rows: current.rows,
        values: current.values,
        sheet_name: current.sheet_name,
      });
    }
    return next;
  }

  if (type === 'human') {
    return mergeConfigDefaults(defaults, {
      title: current.title,
      instructions: current.instructions,
      decision_options: current.decision_options,
    });
  }

  if (type === 'decision') {
    return mergeConfigDefaults(defaults, {
      expression: current.expression,
      routes: current.routes,
      field: current.field,
    });
  }

  if (type === 'data') {
    return mergeConfigDefaults(defaults, {
      mapping: current.mapping,
      template: current.template,
    });
  }

  return mergeConfigDefaults(defaults, {
    workflow_id: current.workflow_id,
    mode: current.mode,
  });
}
