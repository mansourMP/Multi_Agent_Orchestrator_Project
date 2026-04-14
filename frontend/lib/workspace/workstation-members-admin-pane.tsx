'use client';

import { useEffect, useMemo, useState } from 'react';

import { ConfirmDialog } from '@/lib/ui/confirm-dialog';
import {
  DataBadge,
  DataTable,
  DataTableCell,
  DataTableHeader,
  DataTableHeaderCell,
  DataTableRow,
} from '@/lib/ui/data-table';
import { EmptyPanel } from '@/lib/ui/empty-panel';
import {
  FormField,
  FormGrid,
  FormInput,
  FormReadout,
  FormSection,
  FormSelect,
} from '@/lib/ui/form-controls';
import { ListDetailColumns, ListDetailPanel, ListDetailShell } from '@/lib/ui/list-detail';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import { StateBanner } from '@/lib/ui/state-banner';
import { AppButton } from '@/lib/ui/primitives';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';

type MemberRecord = Record<string, unknown>;
type InviteRecord = Record<string, unknown>;

function readItems(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];
}

function asToken(value: unknown, fallback = 'unknown'): string {
  const token = String(value ?? '').trim();
  return token || fallback;
}

function inviteTone(status: string): 'neutral' | 'success' | 'warning' | 'danger' {
  if (status === 'accepted') {
    return 'success';
  }
  if (status === 'revoked') {
    return 'danger';
  }
  if (status === 'pending') {
    return 'warning';
  }
  return 'neutral';
}

function memberTone(role: string): 'accent' | 'neutral' {
  return role === 'owner' ? 'accent' : 'neutral';
}

function formatTimestamp(value: unknown): string {
  if (typeof value === 'number') {
    return new Date(value * 1000).toLocaleString();
  }
  if (typeof value === 'string' && value.trim()) {
    return new Date(value).toLocaleString();
  }
  return 'n/a';
}

export function WorkstationMembersAdminPane() {
  const services = useWorkspaceServices();
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [pendingInvites, setPendingInvites] = useState<InviteRecord[]>([]);
  const [inviteHistory, setInviteHistory] = useState<InviteRecord[]>([]);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({});
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [isLoading, setIsLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<MemberRecord | null>(null);
  const [inviteToRevoke, setInviteToRevoke] = useState<InviteRecord | null>(null);

  const loadMembers = async () => {
    const payload = await services.client.listWorkspaceMembers();
    const nextMembers = readItems((payload as Record<string, unknown>).members);
    const allInvites = readItems((payload as Record<string, unknown>).invites);
    const nextPending = readItems((payload as Record<string, unknown>).pending_invites);
    const nextHistory = readItems((payload as Record<string, unknown>).invite_history);
    setMembers(nextMembers);
    setPendingInvites(
      nextPending.length
        ? nextPending
        : allInvites.filter((invite) => asToken(invite.status, 'pending').toLowerCase() === 'pending'),
    );
    setInviteHistory(
      nextHistory.length
        ? nextHistory
        : allInvites.filter((invite) => asToken(invite.status, '').toLowerCase() !== 'pending'),
    );
    setRoleDrafts(
      Object.fromEntries(
        nextMembers.map((member) => [
          asToken(member.user_id),
          asToken(member.role, 'member'),
        ]),
      ),
    );
  };

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    void loadMembers()
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Workspace members are unavailable.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [services.client]);

  const sortedMembers = useMemo(
    () => [...members].sort((left, right) => {
      const leftLabel = asToken(left.display_name ?? left.email ?? left.user_id, 'member');
      const rightLabel = asToken(right.display_name ?? right.email ?? right.user_id, 'member');
      return leftLabel.localeCompare(rightLabel);
    }),
    [members],
  );

  const ownerCount = useMemo(
    () =>
      members.filter((member) => asToken(member.role, 'member').toLowerCase() === 'owner').length,
    [members],
  );

  const canInvite = inviteEmail.trim().includes('@');

  return (
    <div data-workstation-surface="admin/members">
      <ListDetailShell
        title="Workspace access"
        subtitle="Manage operators, owners, and invite state without leaving the workstation."
        actions={(
          <AppButton
            type="button"
            tone="secondary"
            disabled={isLoading || Boolean(busyKey)}
            onClick={() => {
              setStatus(null);
              setError(null);
              setIsLoading(true);
              void loadMembers()
                .then(() => {
                  setStatus('Workspace access state refreshed.');
                })
                .catch((loadError) => {
                  setError(loadError instanceof Error ? loadError.message : 'Workspace access state is unavailable.');
                })
                .finally(() => {
                  setIsLoading(false);
                });
            }}
          >
            Refresh
          </AppButton>
        )}
      >
        {status ? <StateBanner tone="success" title="Updated" detail={status} /> : null}
        {error ? <StateBanner tone="danger" title="Admin action failed" detail={error} /> : null}

        <ListDetailColumns
          primary={(
            <div className="app-stack-4">
              <ListDetailPanel
                eyebrow="Members"
                title="Role assignments"
                subtitle="Owners can change roles, revoke access, and validate who still has direct control of the workspace."
              >
                {isLoading ? (
                  <div className="app-stack-3">
                    <SkeletonBlock height="3.5rem" />
                    <SkeletonBlock height="3.5rem" />
                    <SkeletonBlock height="3.5rem" />
                  </div>
                ) : sortedMembers.length === 0 ? (
                  <EmptyPanel
                    title="No active members"
                    body="This workspace does not currently have any persisted memberships."
                  />
                ) : (
                  <DataTable>
                    <DataTableHeader columns="minmax(0, 2fr) minmax(8rem, 0.9fr) minmax(13rem, 1.1fr)">
                      <DataTableHeaderCell>Member</DataTableHeaderCell>
                      <DataTableHeaderCell>Role</DataTableHeaderCell>
                      <DataTableHeaderCell align="end">Actions</DataTableHeaderCell>
                    </DataTableHeader>
                    {sortedMembers.map((member) => {
                      const userId = asToken(member.user_id);
                      const currentRole = asToken(member.role, 'member');
                      const draftRole = roleDrafts[userId] ?? currentRole;
                      const isBusy = busyKey === `member:${userId}`;
                      return (
                        <DataTableRow
                          key={userId}
                          columns="minmax(0, 2fr) minmax(8rem, 0.9fr) minmax(13rem, 1.1fr)"
                        >
                          <DataTableCell
                            primary={String(member.display_name ?? member.email ?? userId)}
                            secondary={String(member.email ?? userId)}
                            meta={`Updated ${formatTimestamp(member.updated_at)}`}
                          />
                          <DataTableCell
                            primary={<DataBadge tone={memberTone(currentRole)}>{currentRole}</DataBadge>}
                            secondary={currentRole === 'owner' ? 'Full workspace administration' : 'Scoped workspace access'}
                          />
                          <div className="app-inline-actions app-inline-actions--end">
                            <FormSelect
                              value={draftRole}
                              disabled={isBusy}
                              onChange={(event) => {
                                setRoleDrafts((current) => ({
                                  ...current,
                                  [userId]: event.currentTarget.value,
                                }));
                              }}
                              aria-label={`Role for ${String(member.display_name ?? member.email ?? userId)}`}
                            >
                              <option value="viewer">viewer</option>
                              <option value="member">member</option>
                              <option value="owner">owner</option>
                            </FormSelect>
                            <AppButton
                              type="button"
                              tone="secondary"
                              disabled={isBusy || draftRole === currentRole}
                              onClick={() => {
                                setBusyKey(`member:${userId}`);
                                setError(null);
                                setStatus(null);
                                void services.client.updateWorkspaceMemberRole({
                                  userId,
                                  role: draftRole,
                                })
                                  .then(async () => {
                                    await loadMembers();
                                    setStatus(`Updated role for ${String(member.email ?? userId)}.`);
                                  })
                                  .catch((updateError) => {
                                    setError(updateError instanceof Error ? updateError.message : 'Workspace membership update failed.');
                                  })
                                  .finally(() => {
                                    setBusyKey(null);
                                  });
                              }}
                            >
                              Save
                            </AppButton>
                            <AppButton
                              type="button"
                              tone="danger"
                              disabled={isBusy}
                              onClick={() => {
                                setMemberToRemove(member);
                              }}
                            >
                              Remove
                            </AppButton>
                          </div>
                        </DataTableRow>
                      );
                    })}
                  </DataTable>
                )}
              </ListDetailPanel>

              <ListDetailPanel
                eyebrow="Pending"
                title="Pending invites"
                subtitle="Open invitations that have not yet been accepted."
              >
                {isLoading ? (
                  <div className="app-stack-3">
                    <SkeletonBlock height="3.2rem" />
                    <SkeletonBlock height="3.2rem" />
                  </div>
                ) : pendingInvites.length === 0 ? (
                  <EmptyPanel
                    title="No pending invites"
                    body="There are no outstanding invites waiting for acceptance."
                  />
                ) : (
                  <DataTable>
                    <DataTableHeader columns="minmax(0, 2fr) minmax(8rem, 0.9fr) minmax(12rem, 1fr)">
                      <DataTableHeaderCell>Invitee</DataTableHeaderCell>
                      <DataTableHeaderCell>Status</DataTableHeaderCell>
                      <DataTableHeaderCell align="end">Actions</DataTableHeaderCell>
                    </DataTableHeader>
                    {pendingInvites.map((invite) => {
                      const inviteId = asToken(invite.id);
                      const isBusy = busyKey === `invite:${inviteId}`;
                      const statusToken = asToken(invite.status, 'pending').toLowerCase();
                      return (
                        <DataTableRow
                          key={inviteId}
                          columns="minmax(0, 2fr) minmax(8rem, 0.9fr) minmax(12rem, 1fr)"
                        >
                          <DataTableCell
                            primary={String(invite.email ?? inviteId)}
                            secondary={`Role ${asToken(invite.role, 'member')}`}
                            meta={`Created ${formatTimestamp(invite.created_at)}`}
                          />
                          <DataTableCell
                            primary={<DataBadge tone={inviteTone(statusToken)}>{statusToken}</DataBadge>}
                            secondary={statusToken === 'pending' ? 'Awaiting acceptance' : 'No longer actionable'}
                          />
                          <div className="app-inline-actions app-inline-actions--end">
                            <AppButton
                              type="button"
                              tone="danger"
                              disabled={isBusy || statusToken !== 'pending'}
                              onClick={() => {
                                setInviteToRevoke(invite);
                              }}
                            >
                              Revoke
                            </AppButton>
                          </div>
                        </DataTableRow>
                      );
                    })}
                  </DataTable>
                )}
              </ListDetailPanel>

              <ListDetailPanel
                eyebrow="History"
                title="Invite history"
                subtitle="Accepted and revoked invites remain visible as an audit trail."
              >
                {isLoading ? (
                  <SkeletonBlock height="3rem" />
                ) : inviteHistory.length === 0 ? (
                  <EmptyPanel
                    title="No invite history"
                    body="Accepted and revoked invite activity will appear here."
                  />
                ) : (
                  <DataTable>
                    <DataTableHeader columns="minmax(0, 2fr) minmax(8rem, 0.9fr) minmax(10rem, 0.9fr)">
                      <DataTableHeaderCell>Invitee</DataTableHeaderCell>
                      <DataTableHeaderCell>Status</DataTableHeaderCell>
                      <DataTableHeaderCell>Updated</DataTableHeaderCell>
                    </DataTableHeader>
                    {inviteHistory.map((invite) => {
                      const statusToken = asToken(invite.status, 'unknown').toLowerCase();
                      return (
                        <DataTableRow
                          key={asToken(invite.id)}
                          columns="minmax(0, 2fr) minmax(8rem, 0.9fr) minmax(10rem, 0.9fr)"
                        >
                          <DataTableCell
                            primary={String(invite.email ?? invite.id ?? 'invite')}
                            secondary={`Role ${asToken(invite.role, 'member')}`}
                          />
                          <DataTableCell
                            primary={<DataBadge tone={inviteTone(statusToken)}>{statusToken}</DataBadge>}
                          />
                          <DataTableCell primary={formatTimestamp(invite.updated_at ?? invite.accepted_at ?? invite.revoked_at)} />
                        </DataTableRow>
                      );
                    })}
                  </DataTable>
                )}
              </ListDetailPanel>
            </div>
          )}
          secondary={(
            <div className="app-stack-4">
              <ListDetailPanel
                eyebrow="Invite"
                title="Create workspace invite"
                subtitle="Invite a collaborator directly into this workspace with a role scoped at acceptance time."
              >
                <FormSection title="Invite details" description="Pending invites are accepted on sign-in or registration.">
                  <FormGrid columns="1fr">
                    <FormField label="Email" hint="Use a real email address. Duplicate pending invites are overwritten server-side.">
                      <FormInput
                        value={inviteEmail}
                        placeholder="operator@example.com"
                        onChange={(event) => setInviteEmail(event.currentTarget.value)}
                      />
                    </FormField>
                    <FormField label="Role" hint="Owners can change runtime routing, membership, and policy state.">
                      <FormSelect
                        value={inviteRole}
                        onChange={(event) => setInviteRole(event.currentTarget.value)}
                      >
                        <option value="viewer">viewer</option>
                        <option value="member">member</option>
                        <option value="owner">owner</option>
                      </FormSelect>
                    </FormField>
                  </FormGrid>
                </FormSection>
                <div className="app-inline-actions app-inline-actions--end">
                  <AppButton
                    type="button"
                    disabled={!canInvite || Boolean(busyKey)}
                    onClick={() => {
                      setBusyKey('invite:create');
                      setError(null);
                      setStatus(null);
                      void services.client.inviteWorkspaceMember({
                        email: inviteEmail.trim(),
                        role: inviteRole,
                      })
                        .then(async () => {
                          await loadMembers();
                          setInviteEmail('');
                          setStatus('Workspace invite created.');
                        })
                        .catch((inviteError) => {
                          setError(inviteError instanceof Error ? inviteError.message : 'Workspace invite failed.');
                        })
                        .finally(() => {
                          setBusyKey(null);
                        });
                    }}
                  >
                    Send invite
                  </AppButton>
                </div>
              </ListDetailPanel>

              <ListDetailPanel
                eyebrow="Summary"
                title="Access posture"
                subtitle="Quick readout of direct workspace control."
              >
                <FormGrid columns="repeat(2, minmax(0, 1fr))">
                  <FormReadout label="Members" value={String(members.length)} />
                  <FormReadout label="Owners" value={String(ownerCount)} />
                  <FormReadout label="Pending invites" value={String(pendingInvites.length)} />
                  <FormReadout label="Invite history" value={String(inviteHistory.length)} />
                </FormGrid>
              </ListDetailPanel>
            </div>
          )}
        />
      </ListDetailShell>

      <ConfirmDialog
        open={Boolean(memberToRemove)}
        title="Remove workspace member"
        body={`Remove ${String(memberToRemove?.email ?? memberToRemove?.display_name ?? memberToRemove?.user_id ?? 'this member')} from the workspace?`}
        confirmLabel="Remove member"
        busy={Boolean(memberToRemove && busyKey === `member:${asToken(memberToRemove.user_id)}`)}
        onCancel={() => {
          if (!busyKey?.startsWith('member:')) {
            setMemberToRemove(null);
          }
        }}
        onConfirm={() => {
          if (!memberToRemove) {
            return;
          }
          const userId = asToken(memberToRemove.user_id);
          setBusyKey(`member:${userId}`);
          setError(null);
          setStatus(null);
          void services.client.removeWorkspaceMember({ userId })
            .then(async () => {
              await loadMembers();
              setStatus(`Removed ${String(memberToRemove.email ?? userId)} from the workspace.`);
              setMemberToRemove(null);
            })
            .catch((removeError) => {
              setError(removeError instanceof Error ? removeError.message : 'Workspace member removal failed.');
            })
            .finally(() => {
              setBusyKey(null);
            });
        }}
      />

      <ConfirmDialog
        open={Boolean(inviteToRevoke)}
        title="Revoke workspace invite"
        body={`Revoke the invite for ${String(inviteToRevoke?.email ?? inviteToRevoke?.id ?? 'this invite')}?`}
        confirmLabel="Revoke invite"
        busy={Boolean(inviteToRevoke && busyKey === `invite:${asToken(inviteToRevoke.id)}`)}
        onCancel={() => {
          if (!busyKey?.startsWith('invite:')) {
            setInviteToRevoke(null);
          }
        }}
        onConfirm={() => {
          if (!inviteToRevoke) {
            return;
          }
          const inviteId = asToken(inviteToRevoke.id);
          setBusyKey(`invite:${inviteId}`);
          setError(null);
          setStatus(null);
          void services.client.revokeWorkspaceInvite({ inviteId })
            .then(async () => {
              await loadMembers();
              setStatus(`Revoked invite for ${String(inviteToRevoke.email ?? inviteId)}.`);
              setInviteToRevoke(null);
            })
            .catch((revokeError) => {
              setError(revokeError instanceof Error ? revokeError.message : 'Workspace invite revoke failed.');
            })
            .finally(() => {
              setBusyKey(null);
            });
        }}
      />
    </div>
  );
}
