export type WorkspaceShellProfileId =
  | 'personal_shell'
  | 'document_workstation_shell'
  | 'operations_admin_shell';

export type WorkspaceNavDestinationId =
  | 'home'
  | 'chat'
  | 'work'
  | 'build'
  | 'control';

export type WorkspaceRouteId =
  | 'chat'
  | 'workstation'
  | 'runs'
  | 'approvals'
  | 'artifacts'
  | 'notifications'
  | 'activity'
  | 'agents'
  | 'deployed-agents'
  | 'applications'
  | 'integrations'
  | 'settings'
  | 'admin'
  | 'admin/platform'
  | 'admin/billing'
  | 'admin/routing'
  | 'admin/members'
  | 'admin/policies';

export type WorkspaceNavIconName =
  | 'home'
  | 'message-square'
  | 'briefcase'
  | 'boxes'
  | 'sliders-horizontal';

export type WorkspaceNavDestinationDefinition = {
  id: WorkspaceNavDestinationId;
  label: string;
  iconName: WorkspaceNavIconName;
  defaultRouteId: WorkspaceRouteId;
  childRouteIds: readonly WorkspaceRouteId[];
  direct: boolean;
};

export type WorkspaceNavRouteDefinition = {
  id: WorkspaceRouteId;
  label: string;
  segment: string;
  legacySegments?: readonly string[];
  destinationId: WorkspaceNavDestinationId;
  requiredCapabilities?: readonly string[];
  profileIds?: readonly WorkspaceShellProfileId[];
  web: {
    hiddenFromNavigation?: boolean;
  };
  mobile?: {
    screen: string;
    screenName: string;
    groupId: WorkspaceNavDestinationId;
    tabLabel?: string;
    includeInBottomTabs?: boolean;
  };
};

export type WorkspaceMobileRouteDefinition = WorkspaceNavRouteDefinition & {
  mobile: NonNullable<WorkspaceNavRouteDefinition['mobile']>;
};

export type WorkspaceMobileBottomTab = {
  routeId: WorkspaceRouteId;
  label: string;
  screenName: string;
  screen: string;
  destinationId: WorkspaceNavDestinationId;
  iconName: WorkspaceNavIconName;
};

export const WORKSPACE_NAV_DESTINATIONS = [
  {
    id: 'home',
    label: 'Home',
    iconName: 'home',
    defaultRouteId: 'workstation',
    childRouteIds: ['workstation'],
    direct: true,
  },
  {
    id: 'chat',
    label: 'Chat',
    iconName: 'message-square',
    defaultRouteId: 'chat',
    childRouteIds: ['chat'],
    direct: true,
  },
  {
    id: 'work',
    label: 'Work',
    iconName: 'briefcase',
    defaultRouteId: 'runs',
    childRouteIds: ['runs', 'approvals', 'artifacts', 'notifications', 'activity'],
    direct: false,
  },
  {
    id: 'build',
    label: 'Build',
    iconName: 'boxes',
    defaultRouteId: 'agents',
    childRouteIds: ['agents', 'deployed-agents', 'applications', 'integrations'],
    direct: false,
  },
  {
    id: 'control',
    label: 'Control',
    iconName: 'sliders-horizontal',
    defaultRouteId: 'settings',
    childRouteIds: [
      'settings',
      'admin',
      'admin/platform',
      'admin/billing',
      'admin/routing',
      'admin/members',
      'admin/policies',
    ],
    direct: false,
  },
] as const satisfies readonly WorkspaceNavDestinationDefinition[];

export const WORKSPACE_NAV_DESTINATION_INDEX = WORKSPACE_NAV_DESTINATIONS.reduce<
  Record<WorkspaceNavDestinationId, WorkspaceNavDestinationDefinition>
>((accumulator, destination) => {
  accumulator[destination.id] = destination;
  return accumulator;
}, {} as Record<WorkspaceNavDestinationId, WorkspaceNavDestinationDefinition>);

export const WORKSPACE_WEB_NAV_GROUP_LABELS = WORKSPACE_NAV_DESTINATIONS.reduce<
  Record<WorkspaceNavDestinationId, string>
>((accumulator, destination) => {
  accumulator[destination.id] = destination.label;
  return accumulator;
}, {} as Record<WorkspaceNavDestinationId, string>);

export const WORKSPACE_MOBILE_NAV_GROUP_LABELS = WORKSPACE_WEB_NAV_GROUP_LABELS;

export const WORKSPACE_ROUTE_DEFINITIONS: readonly WorkspaceNavRouteDefinition[] = [
  {
    id: 'workstation',
    label: 'Home',
    segment: 'home',
    legacySegments: ['workstation'],
    destinationId: 'home',
    web: {},
  },
  {
    id: 'chat',
    label: 'Chat',
    segment: 'chat',
    destinationId: 'chat',
    web: {},
    mobile: {
      screen: '/(workspace)/chat',
      screenName: 'chat',
      groupId: 'chat',
      includeInBottomTabs: true,
    },
  },
  {
    id: 'runs',
    label: 'Runs',
    segment: 'runs',
    destinationId: 'work',
    web: {},
    mobile: {
      screen: '/(workspace)/runs',
      screenName: 'runs',
      groupId: 'work',
      tabLabel: 'Work',
      includeInBottomTabs: true,
    },
  },
  {
    id: 'approvals',
    label: 'Approvals',
    segment: 'approvals',
    destinationId: 'work',
    requiredCapabilities: ['approvals_enabled'],
    web: {},
    mobile: {
      screen: '/(workspace)/approvals',
      screenName: 'approvals',
      groupId: 'work',
      includeInBottomTabs: true,
    },
  },
  {
    id: 'artifacts',
    label: 'Artifacts',
    segment: 'artifacts',
    destinationId: 'work',
    requiredCapabilities: ['artifacts_enabled'],
    web: {},
    mobile: {
      screen: '/(workspace)/artifacts',
      screenName: 'artifacts',
      groupId: 'work',
      includeInBottomTabs: true,
    },
  },
  {
    id: 'notifications',
    label: 'Notifications',
    segment: 'notifications',
    destinationId: 'work',
    web: {},
    mobile: {
      screen: '/(workspace)/notifications',
      screenName: 'notifications',
      groupId: 'work',
      tabLabel: 'Inbox',
      includeInBottomTabs: true,
    },
  },
  {
    id: 'activity',
    label: 'Activity',
    segment: 'activity',
    destinationId: 'work',
    web: {},
  },
  {
    id: 'agents',
    label: 'Agents',
    segment: 'agents',
    destinationId: 'build',
    web: {},
  },
  {
    id: 'deployed-agents',
    label: 'Deployed Agents',
    segment: 'deployed-agents',
    destinationId: 'build',
    web: {},
  },
  {
    id: 'applications',
    label: 'Applications',
    segment: 'applications',
    destinationId: 'build',
    web: {},
  },
  {
    id: 'integrations',
    label: 'Integrations',
    segment: 'integrations',
    destinationId: 'build',
    requiredCapabilities: ['channel_pairing_enabled'],
    web: {},
  },
  {
    id: 'settings',
    label: 'Settings',
    segment: 'settings',
    destinationId: 'control',
    web: {},
  },
  {
    id: 'admin',
    label: 'Admin',
    segment: 'admin',
    destinationId: 'control',
    requiredCapabilities: ['workspace_admin_enabled'],
    web: {},
  },
  {
    id: 'admin/platform',
    label: 'Platform',
    segment: 'admin/platform',
    destinationId: 'control',
    requiredCapabilities: ['platform_admin_enabled'],
    web: {},
  },
  {
    id: 'admin/billing',
    label: 'Billing',
    segment: 'admin/billing',
    destinationId: 'control',
    requiredCapabilities: ['billing_read_enabled'],
    web: {},
  },
  {
    id: 'admin/routing',
    label: 'Routing',
    segment: 'admin/routing',
    destinationId: 'control',
    requiredCapabilities: ['routing_read_enabled'],
    web: {},
  },
  {
    id: 'admin/members',
    label: 'Members',
    segment: 'admin/members',
    destinationId: 'control',
    requiredCapabilities: ['workspace_admin_enabled'],
    web: {},
  },
  {
    id: 'admin/policies',
    label: 'Policies',
    segment: 'admin/policies',
    destinationId: 'control',
    requiredCapabilities: ['workspace_admin_enabled'],
    web: {},
  },
];

export const WORKSPACE_WEB_ROUTE_DEFINITIONS = [...WORKSPACE_ROUTE_DEFINITIONS];

function hasMobileRouteDefinition(
  definition: WorkspaceNavRouteDefinition,
): definition is WorkspaceMobileRouteDefinition {
  return definition.mobile !== undefined;
}

export const WORKSPACE_MOBILE_ROUTE_DEFINITIONS = WORKSPACE_ROUTE_DEFINITIONS.filter(
  hasMobileRouteDefinition,
);

export const WORKSPACE_ROUTE_ID_SET = new Set<WorkspaceRouteId>(
  WORKSPACE_ROUTE_DEFINITIONS.map((definition) => definition.id),
);

export const WORKSPACE_ROUTE_DEFINITION_INDEX = WORKSPACE_ROUTE_DEFINITIONS.reduce<
  Record<WorkspaceRouteId, WorkspaceNavRouteDefinition>
>((accumulator, definition) => {
  accumulator[definition.id] = definition;
  return accumulator;
}, {} as Record<WorkspaceRouteId, WorkspaceNavRouteDefinition>);

const WORKSPACE_ROUTE_SEGMENT_INDEX = WORKSPACE_ROUTE_DEFINITIONS.reduce<
  Record<string, WorkspaceRouteId>
>((accumulator, definition) => {
  accumulator[definition.segment] = definition.id;
  for (const legacySegment of definition.legacySegments ?? []) {
    accumulator[legacySegment] = definition.id;
  }
  return accumulator;
}, {});

export function getWorkspaceNavRouteDefinition(routeId: WorkspaceRouteId): WorkspaceNavRouteDefinition {
  return WORKSPACE_ROUTE_DEFINITION_INDEX[routeId];
}

export function getWorkspaceNavDestinationDefinition(
  destinationId: WorkspaceNavDestinationId,
): WorkspaceNavDestinationDefinition {
  return WORKSPACE_NAV_DESTINATION_INDEX[destinationId];
}

export function getWorkspaceDestinationRouteDefinitions(
  destinationId: WorkspaceNavDestinationId,
): WorkspaceNavRouteDefinition[] {
  return getWorkspaceNavDestinationDefinition(destinationId).childRouteIds.map((routeId) =>
    getWorkspaceNavRouteDefinition(routeId),
  );
}

export function buildWorkspaceRouteHref(workspaceId: string, routeId: WorkspaceRouteId): string {
  const definition = getWorkspaceNavRouteDefinition(routeId);
  return `/w/${encodeURIComponent(workspaceId)}/${definition.segment}`;
}

export function resolveWorkspaceRouteIdFromSegment(
  segment: string | null | undefined,
): WorkspaceRouteId | null {
  if (!segment) {
    return null;
  }

  const normalizedSegment = segment
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');

  if (!normalizedSegment) {
    return null;
  }

  return WORKSPACE_ROUTE_SEGMENT_INDEX[normalizedSegment] ?? null;
}

export const WORKSPACE_MOBILE_BOTTOM_TABS = WORKSPACE_MOBILE_ROUTE_DEFINITIONS.filter(
  (definition) => definition.mobile.includeInBottomTabs,
).map((definition) => ({
  routeId: definition.id,
  label: definition.mobile.tabLabel ?? definition.label,
  screenName: definition.mobile.screenName,
  screen: definition.mobile.screen,
  destinationId: definition.destinationId,
  iconName: getWorkspaceNavDestinationDefinition(definition.destinationId).iconName,
})) as readonly WorkspaceMobileBottomTab[];
