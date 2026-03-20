'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Database, Edit2, FileJson, Hash, Plus, ShieldCheck, Trash2, Type, X } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { MetricStrip } from '@/components/ui/MetricStrip';
import { OsPageHeader } from '@/components/ui/OsPageHeader';

interface Variable {
  id: string;
  key: string;
  value: string;
  type: 'string' | 'number' | 'json';
  description?: string;
}

const STORAGE_KEY = 'conductor_variables';

function prettyType(type: Variable['type']): string {
  if (type === 'json') return 'JSON';
  if (type === 'number') return 'Number';
  return 'String';
}

export default function VariablesPage() {
  const { addToast } = useToast();
  const [variables, setVariables] = useState<Variable[]>(() => {
    if (typeof window === 'undefined') return [];
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? (parsed as Variable[]) : [];
    } catch {
      return [];
    }
  });
  const [query, setQuery] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Variable, 'id'>>({
    key: '',
    value: '',
    type: 'string',
    description: '',
  });

  function persist(next: Variable[]) {
    setVariables(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function openCreateModal() {
    setEditingId(null);
    setForm({ key: '', value: '', type: 'string', description: '' });
    setShowModal(true);
  }

  function openEditModal(variable: Variable) {
    setEditingId(variable.id);
    setForm({
      key: variable.key,
      value: variable.value,
      type: variable.type,
      description: variable.description || '',
    });
    setShowModal(true);
  }

  function saveVariable() {
    const normalizedKey = form.key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');

    if (!normalizedKey) {
      addToast({ title: 'Variable key is required', type: 'error' });
      return;
    }

    const duplicate = variables.find((item) => item.key === normalizedKey && item.id !== editingId);
    if (duplicate) {
      addToast({ title: 'Variable key must be unique', type: 'error' });
      return;
    }

    if (form.type === 'json') {
      try {
        JSON.parse(form.value || '{}');
      } catch {
        addToast({ title: 'Invalid JSON value', type: 'error' });
        return;
      }
    }

    const payload: Omit<Variable, 'id'> = {
      ...form,
      key: normalizedKey,
      description: form.description?.trim() || '',
    };

    if (editingId) {
      persist(variables.map((item) => (item.id === editingId ? { ...item, ...payload } : item)));
      addToast({ title: 'Variable updated', type: 'success' });
    } else {
      const newItem: Variable = {
        id: crypto.randomUUID(),
        ...payload,
      };
      persist([newItem, ...variables]);
      addToast({ title: 'Variable created', type: 'success' });
    }

    setShowModal(false);
  }

  function deleteVariable(id: string) {
    const item = variables.find((entry) => entry.id === id);
    if (!item) return;
    if (!window.confirm(`Delete variable ${item.key}?`)) return;
    persist(variables.filter((entry) => entry.id !== id));
    addToast({ title: 'Variable deleted', type: 'info' });
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return variables;
    return variables.filter((item) =>
      item.key.toLowerCase().includes(q) ||
      item.value.toLowerCase().includes(q) ||
      (item.description || '').toLowerCase().includes(q) ||
      item.type.toLowerCase().includes(q),
    );
  }, [variables, query]);

  const stats = useMemo(
    () => ({
      total: variables.length,
      string: variables.filter((item) => item.type === 'string').length,
      number: variables.filter((item) => item.type === 'number').length,
      json: variables.filter((item) => item.type === 'json').length,
    }),
    [variables],
  );

  return (
    <div className="orion-page-shell orion-animate-in">
      <OsPageHeader
        icon={<Database size={18} />}
        title="Variables"
        subtitle="Control Center section for shared constants and reusable references across workflows."
        meta={
          <>
            <span>Control Center</span>
            <span>{variables.length} saved</span>
          </>
        }
        actions={
          <>
            <Link href="/control-center" className="orion-btn orion-btn-ghost">
              <ShieldCheck size={14} />
              Overview
            </Link>
            <button className="orion-btn orion-btn-primary" onClick={openCreateModal}>
              <Plus size={14} />
              New variable
            </button>
          </>
        }
      />

      <MetricStrip
        items={[
          { label: 'Saved', value: String(stats.total) },
          { label: 'Text', value: String(stats.string) },
          { label: 'Number', value: String(stats.number) },
          { label: 'JSON', value: String(stats.json) },
        ]}
        minWidth={170}
      />

      <section className="orion-panel orion-surface-lift">
        <div className="orion-toolbar">
          <div className="orion-toolbar-input-wrap">
            <Hash size={14} className="icon" />
            <input
              className="input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by key, value, type"
              style={{ height: 40, borderRadius: 10, paddingLeft: 36 }}
            />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>
            {filtered.length} of {variables.length} variables
          </div>
        </div>
      </section>

      {filtered.length === 0 ? (
        <section className="orion-empty">
          <div className="orion-empty-title">No variables</div>
          <div className="orion-empty-copy" style={{ marginBottom: 16 }}>
            Create your first variable to reuse constants across workflows and prompts.
          </div>
          <button className="orion-btn orion-btn-primary" onClick={openCreateModal}>
            Create variable
          </button>
        </section>
      ) : (
        <section className="orion-list">
          {filtered.map((item) => {
            const icon = item.type === 'json' ? <FileJson size={13} /> : item.type === 'number' ? <Hash size={13} /> : <Type size={13} />;
            const valuePreview =
              item.type === 'json'
                ? 'JSON object'
                : item.value.length > 90
                  ? `${item.value.slice(0, 90)}...`
                  : item.value;

            return (
              <article key={item.id} className="orion-list-row orion-surface-lift">
                <div className="orion-list-row-main" style={{ gap: 6 }}>
                  <div className="orion-list-row-title" style={{ fontFamily: 'var(--font-mono)' }}>
                    {item.key}
                  </div>
                  <div className="orion-list-row-subtitle" style={{ lineHeight: 1.45 }}>
                    {valuePreview}
                  </div>
                  <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
                    <span className="orion-chip" style={{ background: 'var(--bg-element)' }}>
                      {icon}
                      {prettyType(item.type)}
                    </span>
                    {item.description ? <span className="orion-chip">{item.description}</span> : null}
                  </div>
                </div>

                <div className="orion-toolbar-group">
                  <button className="orion-icon-btn" onClick={() => openEditModal(item)} aria-label="Edit variable">
                    <Edit2 size={14} />
                  </button>
                  <button className="orion-icon-btn" onClick={() => deleteVariable(item.id)} aria-label="Delete variable">
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      <section className="orion-panel orion-surface-lift" style={{ display: 'grid', gap: 8 }}>
        <div className="orion-panel-title">Reference format</div>
        <div className="orion-panel-copy">
          Use variable values in prompts and nodes with <code style={{ fontFamily: 'var(--font-mono)' }}>{'{{ $vars.KEY }}'}</code>
        </div>
      </section>

      {showModal && (
        <div className="orion-modal-overlay" onClick={() => setShowModal(false)}>
          <section className="orion-modal" onClick={(event) => event.stopPropagation()}>
            <header className="orion-panel-header" style={{ marginBottom: 0 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800 }}>
                {editingId ? 'Edit variable' : 'Create variable'}
              </h2>
              <button
                className="orion-btn orion-btn-ghost"
                style={{ minHeight: 30, paddingInline: 8 }}
                onClick={() => setShowModal(false)}
                aria-label="Close"
              >
                <X size={13} />
              </button>
            </header>

            <div className="orion-field">
              <label className="orion-field-label">Key</label>
              <input
                className="input"
                value={form.key}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    key: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''),
                  }))
                }
                placeholder="VARIABLE_KEY"
                style={{ height: 40, borderRadius: 10, fontFamily: 'var(--font-mono)' }}
                autoFocus
              />
            </div>

            <div className="orion-field">
              <label className="orion-field-label">Type</label>
              <select
                className="input"
                value={form.type}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, type: event.target.value as Variable['type'] }))
                }
                style={{ height: 40, borderRadius: 10 }}
              >
                <option value="string">String</option>
                <option value="number">Number</option>
                <option value="json">JSON</option>
              </select>
            </div>

            <div className="orion-field">
              <label className="orion-field-label">Value</label>
              <textarea
                className="input"
                rows={form.type === 'json' ? 8 : 4}
                value={form.value}
                onChange={(event) => setForm((prev) => ({ ...prev, value: event.target.value }))}
                placeholder={form.type === 'json' ? '{"example": true}' : 'Variable value'}
                style={{ borderRadius: 10, resize: 'vertical', minHeight: form.type === 'json' ? 160 : 96, fontFamily: form.type === 'json' ? 'var(--font-mono)' : undefined }}
              />
            </div>

            <div className="orion-field">
              <label className="orion-field-label">Description (optional)</label>
              <input
                className="input"
                value={form.description || ''}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                style={{ height: 40, borderRadius: 10 }}
                placeholder="What this variable is for"
              />
            </div>

            <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
              <button className="orion-btn" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button className="orion-btn orion-btn-primary" onClick={saveVariable}>
                {editingId ? 'Save' : 'Create'}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
