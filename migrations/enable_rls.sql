BEGIN;

CREATE OR REPLACE FUNCTION public.empyralis_rls_current_tenant_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('app.current_tenant_id', true), '');
$$;

CREATE OR REPLACE FUNCTION public.empyralis_rls_current_workspace_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('app.current_workspace_id', true), '');
$$;

CREATE OR REPLACE FUNCTION public.empyralis_rls_bypass()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(NULLIF(current_setting('app.rls_bypass', true), ''), 'off') IN ('1', 'true', 'on');
$$;

CREATE OR REPLACE FUNCTION public.empyralis_rls_scope_match(row_tenant_id text, row_workspace_id text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT
        public.empyralis_rls_bypass()
        OR (
            row_tenant_id = public.empyralis_rls_current_tenant_id()
            AND row_workspace_id = public.empyralis_rls_current_workspace_id()
        );
$$;

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS empyralis_tenants_scope ON tenants;
CREATE POLICY empyralis_tenants_scope ON tenants
    FOR ALL
    USING (public.empyralis_rls_scope_match(tenant_id, workspace_id))
    WITH CHECK (public.empyralis_rls_scope_match(tenant_id, workspace_id));

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS empyralis_users_scope ON users;
CREATE POLICY empyralis_users_scope ON users
    FOR ALL
    USING (public.empyralis_rls_scope_match(tenant_id, workspace_id))
    WITH CHECK (public.empyralis_rls_scope_match(tenant_id, workspace_id));

ALTER TABLE auth_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_identities FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS empyralis_auth_identities_scope ON auth_identities;
CREATE POLICY empyralis_auth_identities_scope ON auth_identities
    FOR ALL
    USING (public.empyralis_rls_scope_match(tenant_id, workspace_id))
    WITH CHECK (public.empyralis_rls_scope_match(tenant_id, workspace_id));

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS empyralis_workspaces_scope ON workspaces;
CREATE POLICY empyralis_workspaces_scope ON workspaces
    FOR ALL
    USING (public.empyralis_rls_scope_match(tenant_id, workspace_id))
    WITH CHECK (public.empyralis_rls_scope_match(tenant_id, workspace_id));

ALTER TABLE workspace_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_memberships FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS empyralis_workspace_memberships_scope ON workspace_memberships;
CREATE POLICY empyralis_workspace_memberships_scope ON workspace_memberships
    FOR ALL
    USING (public.empyralis_rls_scope_match(tenant_id, workspace_id))
    WITH CHECK (public.empyralis_rls_scope_match(tenant_id, workspace_id));

ALTER TABLE agent_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_threads FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS empyralis_agent_threads_scope ON agent_threads;
CREATE POLICY empyralis_agent_threads_scope ON agent_threads
    FOR ALL
    USING (public.empyralis_rls_scope_match(tenant_id, workspace_id))
    WITH CHECK (public.empyralis_rls_scope_match(tenant_id, workspace_id));

ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS empyralis_agent_sessions_scope ON agent_sessions;
CREATE POLICY empyralis_agent_sessions_scope ON agent_sessions
    FOR ALL
    USING (public.empyralis_rls_scope_match(tenant_id, workspace_id))
    WITH CHECK (public.empyralis_rls_scope_match(tenant_id, workspace_id));

ALTER TABLE agent_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_turns FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS empyralis_agent_turns_scope ON agent_turns;
CREATE POLICY empyralis_agent_turns_scope ON agent_turns
    FOR ALL
    USING (public.empyralis_rls_scope_match(tenant_id, workspace_id))
    WITH CHECK (public.empyralis_rls_scope_match(tenant_id, workspace_id));

ALTER TABLE workflow_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_definitions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS empyralis_workflow_definitions_scope ON workflow_definitions;
CREATE POLICY empyralis_workflow_definitions_scope ON workflow_definitions
    FOR ALL
    USING (public.empyralis_rls_scope_match(tenant_id, workspace_id))
    WITH CHECK (public.empyralis_rls_scope_match(tenant_id, workspace_id));

ALTER TABLE workflow_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_versions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS empyralis_workflow_versions_scope ON workflow_versions;
CREATE POLICY empyralis_workflow_versions_scope ON workflow_versions
    FOR ALL
    USING (public.empyralis_rls_scope_match(tenant_id, workspace_id))
    WITH CHECK (public.empyralis_rls_scope_match(tenant_id, workspace_id));

ALTER TABLE runtime_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS empyralis_runtime_profiles_scope ON runtime_profiles;
CREATE POLICY empyralis_runtime_profiles_scope ON runtime_profiles
    FOR ALL
    USING (public.empyralis_rls_scope_match(tenant_id, workspace_id))
    WITH CHECK (public.empyralis_rls_scope_match(tenant_id, workspace_id));

ALTER TABLE agent_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_definitions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS empyralis_agent_definitions_scope ON agent_definitions;
CREATE POLICY empyralis_agent_definitions_scope ON agent_definitions
    FOR ALL
    USING (public.empyralis_rls_scope_match(tenant_id, workspace_id))
    WITH CHECK (public.empyralis_rls_scope_match(tenant_id, workspace_id));

ALTER TABLE agent_definition_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_definition_versions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS empyralis_agent_definition_versions_scope ON agent_definition_versions;
CREATE POLICY empyralis_agent_definition_versions_scope ON agent_definition_versions
    FOR ALL
    USING (public.empyralis_rls_scope_match(tenant_id, workspace_id))
    WITH CHECK (public.empyralis_rls_scope_match(tenant_id, workspace_id));

ALTER TABLE workspace_agent_installs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_agent_installs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS empyralis_workspace_agent_installs_scope ON workspace_agent_installs;
CREATE POLICY empyralis_workspace_agent_installs_scope ON workspace_agent_installs
    FOR ALL
    USING (public.empyralis_rls_scope_match(tenant_id, workspace_id))
    WITH CHECK (public.empyralis_rls_scope_match(tenant_id, workspace_id));

COMMIT;
