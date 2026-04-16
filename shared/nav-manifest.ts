export type WorkspaceShellProfileId =
  | 'personal_shell'
  | 'document_workstation_shell'
  | 'operations_admin_shell';

export type WorkspaceNavDestinationId =
  | 'sage'
  | 'studio'
  | 'settings';

export type WorkspaceRouteId =
  | 'chat'
  | 'runs'
  | 'approvals'
  | 'artifacts'
  | 'notifications'
  | 'activity'
  | 'studio'
  | 'channels'
  | 'inbox'
  | 'deploy'
  | 'settings'
;

export type WorkspaceNavIconName =
  | 'message-square'
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
    id: 'sage',
    label: 'Sage',
    iconName: 'message-square',
    defaultRouteId: 'chat',
    childRouteIds: ['chat', 'runs', 'approvals', 'artifacts', 'activity', 'notifications'],
    direct: true,
  },
  {
    id: 'studio',
    label: 'Studio',
    iconName: 'boxes',
    defaultRouteId: 'studio',
    childRouteIds: ['studio', 'channels', 'inbox', 'deploy'],
    direct: false,
  },
  {
    id: 'settings',
    label: 'Settings',
    iconName: 'sliders-horizontal',
    defaultRouteId: 'settings',
    childRouteIds: ['settings'],
    direct: true,
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
    id: 'chat',
    label: 'Sage',
    segment: 'sage',
    legacySegments: ['chat'],
    destinationId: 'sage',
    web: {},
    mobile: {
      screen: '/(workspace)/chat',
      screenName: 'chat',
      groupId: 'sage',
      tabLabel: 'Sage',
      includeInBottomTabs: true,
    },
  },
  {
    id: 'runs',
    label: 'Tasks',
    segment: 'runs',
    legacySegments: ['work'],
    destinationId: 'sage',
    web: {
      hiddenFromNavigation: true,
    },
    mobile: {
      screen: '/(workspace)/runs',
      screenName: 'runs',
      groupId: 'sage',
      tabLabel: 'Tasks',
      includeInBottomTabs: true,
    },
  },
  {
    id: 'approvals',
    label: 'Approvals',
    segment: 'approvals',
    destinationId: 'sage',
    requiredCapabilities: ['approvals_enabled'],
    web: {
      hiddenFromNavigation: true,
    },
    mobile: {
      screen: '/(workspace)/approvals',
      screenName: 'approvals',
      groupId: 'sage',
      includeInBottomTabs: true,
    },
  },
  {
    id: 'artifacts',
    label: 'Files',
    segment: 'artifacts',
    destinationId: 'sage',
    requiredCapabilities: ['artifacts_enabled'],
    web: {
      hiddenFromNavigation: true,
    },
    mobile: {
      screen: '/(workspace)/artifacts',
      screenName: 'artifacts',
      groupId: 'sage',
      tabLabel: 'Files',
      includeInBottomTabs: true,
    },
  },
  {
    id: 'notifications',
    label: 'Inbox',
    segment: 'notifications',
    destinationId: 'sage',
    web: {
      hiddenFromNavigation: true,
    },
    mobile: {
      screen: '/(workspace)/notifications',
      screenName: 'notifications',
      groupId: 'sage',
      tabLabel: 'Inbox',
      includeInBottomTabs: true,
    },
  },
  {
    id: 'activity',
    label: 'Memory',
    segment: 'activity',
    destinationId: 'sage',
    web: {
      hiddenFromNavigation: true,
    },
  },
  {
    id: 'studio',
    label: 'Agents',
    segment: 'studio',
    legacySegments: ['deployed-agents'],
    destinationId: 'studio',
    requiredCapabilities: ['workspace_admin_enabled'],
    web: {},
  },
  {
    id: 'channels',
    label: 'Channels',
    segment: 'channels',
    legacySegments: ['integrations'],
    destinationId: 'studio',
    requiredCapabilities: ['workspace_admin_enabled', 'channel_pairing_enabled'],
    web: {},
  },
  {
    id: 'inbox',
    label: 'Inbox',
    segment: 'inbox',
    legacySegments: ['agents'],
    destinationId: 'studio',
    requiredCapabilities: ['workspace_admin_enabled'],
    web: {},
  },
  {
    id: 'deploy',
    label: 'Deploy',
    segment: 'deploy',
    legacySegments: ['applications'],
    destinationId: 'studio',
    requiredCapabilities: ['workspace_admin_enabled'],
    web: {},
  },
  {
    id: 'settings',
    label: 'Settings',
    segment: 'settings',
    legacySegments: ['control', 'admin', 'admin/platform', 'admin/billing', 'admin/routing', 'admin/members', 'admin/policies'],
    destinationId: 'settings',
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
