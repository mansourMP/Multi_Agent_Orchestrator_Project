export const WORKSPACE_NAV_DESTINATIONS = [
  {
    id: 'sage',
    label: 'Sage',
    iconName: 'message-square',
    defaultRouteId: 'chat',
    childRouteIds: ['chat', 'memory', 'integrations', 'channels', 'heartbeat', 'activity', 'profile', 'runs', 'approvals', 'artifacts', 'skills', 'notifications'],
    direct: true,
  },
  {
    id: 'studio',
    label: 'Build',
    iconName: 'boxes',
    defaultRouteId: 'studio',
    childRouteIds: ['studio', 'inbox', 'deploy', 'studioIntegrations'],
    direct: false,
  },
  {
    id: 'marketplace',
    label: 'Discover',
    iconName: 'compass',
    defaultRouteId: 'marketplace',
    childRouteIds: ['marketplace'],
    direct: true,
  },
  {
    id: 'gateway',
    label: 'My Computer',
    iconName: 'waypoints',
    defaultRouteId: 'gateway',
    childRouteIds: ['gateway', 'gatewayApprovals', 'gatewayActivity'],
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
];

export const WORKSPACE_NAV_DESTINATION_INDEX = WORKSPACE_NAV_DESTINATIONS.reduce((accumulator, destination) => {
  accumulator[destination.id] = destination;
  return accumulator;
}, {});

export const WORKSPACE_WEB_NAV_GROUP_LABELS = WORKSPACE_NAV_DESTINATIONS.reduce((accumulator, destination) => {
  accumulator[destination.id] = destination.label;
  return accumulator;
}, {});

export const WORKSPACE_MOBILE_NAV_GROUP_LABELS = WORKSPACE_WEB_NAV_GROUP_LABELS;

export const WORKSPACE_ROUTE_DEFINITIONS = [
  {
    id: 'chat',
    label: 'Sage',
    segment: 'sage',
    legacySegments: ['chat'],
    destinationId: 'sage',
    web: {},
    mobile: {
      screen: '/(tabs)/chats',
      screenName: 'chats',
      groupId: 'sage',
      tabLabel: 'Chat',
      includeInBottomTabs: true,
    },
  },
  {
    id: 'memory',
    label: 'Memory',
    segment: 'memory',
    destinationId: 'sage',
    web: {},
  },
  {
    id: 'runs',
    label: 'History',
    segment: 'runs',
    legacySegments: ['work', 'history'],
    destinationId: 'sage',
    web: {
      hiddenFromNavigation: true,
    },
    mobile: {
      screen: '/(tabs)/home/index',
      screenName: 'home/index',
      groupId: 'sage',
      tabLabel: 'Home',
      includeInBottomTabs: true,
    },
  },
  {
    id: 'profile',
    label: 'Profile',
    segment: 'profile',
    destinationId: 'sage',
    web: {
      hiddenFromNavigation: true,
    },
  },
  {
    id: 'approvals',
    label: 'Needs your OK',
    segment: 'approvals',
    destinationId: 'sage',
    requiredCapabilities: ['approvals_enabled'],
    web: {
      hiddenFromNavigation: true,
    },
    mobile: {
      screen: '/approvals',
      screenName: 'approvals',
      groupId: 'sage',
      tabLabel: 'Needs your OK',
      includeInBottomTabs: false,
    },
  },
  {
    id: 'artifacts',
    label: 'Results & Files',
    segment: 'artifacts',
    destinationId: 'sage',
    requiredCapabilities: ['artifacts_enabled'],
    web: {
      hiddenFromNavigation: true,
    },
    mobile: {
      screen: '/artifacts',
      screenName: 'artifacts',
      groupId: 'sage',
      tabLabel: 'Files',
      includeInBottomTabs: false,
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
      screen: '/(tabs)/inbox/index',
      screenName: 'inbox/index',
      groupId: 'sage',
      tabLabel: 'Notifications',
      includeInBottomTabs: true,
    },
  },
  {
    id: 'activity',
    label: 'Activity',
    segment: 'activity',
    destinationId: 'sage',
    web: {},
  },
  {
    id: 'heartbeat',
    label: 'Tasks',
    segment: 'heartbeat',
    destinationId: 'sage',
    web: {},
  },
  {
    id: 'skills',
    label: 'Skills',
    segment: 'skills',
    destinationId: 'sage',
    web: {
      hiddenFromNavigation: true,
    },
  },
  {
    id: 'integrations',
    label: 'Integrations',
    segment: 'integrations',
    destinationId: 'sage',
    web: {},
  },
  {
    id: 'studio',
    label: 'Assistants',
    segment: 'studio',
    legacySegments: ['deployed-agents'],
    destinationId: 'studio',
    requiredCapabilities: ['workspace_admin_enabled'],
    web: {},
    mobile: {
      screen: '/(tabs)/kin/index',
      screenName: 'kin/index',
      groupId: 'studio',
      tabLabel: 'Assistants',
      includeInBottomTabs: true,
    },
  },
  {
    id: 'studioIntegrations',
    label: 'Integrations',
    segment: 'studio-integrations',
    destinationId: 'studio',
    requiredCapabilities: ['workspace_admin_enabled'],
    web: {
      hiddenFromNavigation: true,
    },
  },
  {
    id: 'channels',
    label: 'Integrations',
    segment: 'channels',
    destinationId: 'sage',
    web: {
      hiddenFromNavigation: true,
    },
  },
  {
    id: 'inbox',
    label: 'Messages',
    segment: 'inbox',
    legacySegments: ['agents'],
    destinationId: 'studio',
    requiredCapabilities: ['workspace_admin_enabled'],
    web: {},
  },
  {
    id: 'deploy',
    label: 'Go Live',
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
    mobile: {
      screen: '/(tabs)/profile/index',
      screenName: 'profile/index',
      groupId: 'settings',
      tabLabel: 'Profile',
      includeInBottomTabs: true,
    },
  },
  {
    id: 'marketplace',
    label: 'Discover',
    segment: 'marketplace',
    destinationId: 'marketplace',
    web: {},
    mobile: {
      screen: '/(tabs)/apps/index',
      screenName: 'apps/index',
      groupId: 'marketplace',
      tabLabel: 'Discover',
      includeInBottomTabs: true,
    },
  },
  {
    id: 'gateway',
    label: 'My Computer',
    segment: 'gateway',
    destinationId: 'gateway',
    web: {},
  },
  {
    id: 'gatewayApprovals',
    label: 'Needs your OK',
    segment: 'gateway-approvals',
    destinationId: 'gateway',
    web: {
      hiddenFromNavigation: true,
    },
  },
  {
    id: 'gatewayActivity',
    label: 'Activity',
    segment: 'gateway-activity',
    destinationId: 'gateway',
    web: {
      hiddenFromNavigation: true,
    },
  },
];

function hasMobileRouteDefinition(definition) {
  return definition.mobile !== undefined;
}

export const WORKSPACE_WEB_ROUTE_DEFINITIONS = [...WORKSPACE_ROUTE_DEFINITIONS];

export const WORKSPACE_MOBILE_ROUTE_DEFINITIONS = WORKSPACE_ROUTE_DEFINITIONS.filter(
  hasMobileRouteDefinition,
);

export const WORKSPACE_ROUTE_ID_SET = new Set(
  WORKSPACE_ROUTE_DEFINITIONS.map((definition) => definition.id),
);

export const WORKSPACE_ROUTE_DEFINITION_INDEX = WORKSPACE_ROUTE_DEFINITIONS.reduce((accumulator, definition) => {
  accumulator[definition.id] = definition;
  return accumulator;
}, {});

const WORKSPACE_ROUTE_SEGMENT_INDEX = WORKSPACE_ROUTE_DEFINITIONS.reduce((accumulator, definition) => {
  accumulator[definition.segment] = definition.id;
  for (const legacySegment of definition.legacySegments ?? []) {
    accumulator[legacySegment] = definition.id;
  }
  return accumulator;
}, {});

export function getWorkspaceNavRouteDefinition(routeId) {
  return WORKSPACE_ROUTE_DEFINITION_INDEX[routeId];
}

export function getWorkspaceNavDestinationDefinition(destinationId) {
  return WORKSPACE_NAV_DESTINATION_INDEX[destinationId];
}

export function getWorkspaceDestinationRouteDefinitions(destinationId) {
  return getWorkspaceNavDestinationDefinition(destinationId).childRouteIds.map((routeId) =>
    getWorkspaceNavRouteDefinition(routeId),
  );
}

export function buildWorkspaceRouteHref(workspaceId, routeId) {
  const definition = getWorkspaceNavRouteDefinition(routeId);
  return `/w/${encodeURIComponent(workspaceId)}/${definition.segment}`;
}

export function resolveWorkspaceRouteIdFromSegment(segment) {
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
}));
