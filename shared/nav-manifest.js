export const WORKSPACE_NAV_DESTINATIONS = [
  {
    id: 'sage',
    label: 'Sage',
    iconName: 'message-square',
    defaultRouteId: 'chat',
    childRouteIds: ['chat', 'runs', 'approvals', 'artifacts', 'activity', 'integrations', 'notifications'],
    direct: true,
  },
  {
    id: 'studio',
    label: 'Studio',
    iconName: 'boxes',
    defaultRouteId: 'studio',
    childRouteIds: ['studio', 'channels', 'inbox', 'deploy', 'studioIntegrations'],
    direct: false,
  },
  {
    id: 'marketplace',
    label: 'Marketplace',
    iconName: 'compass',
    defaultRouteId: 'marketplace',
    childRouteIds: ['marketplace'],
    direct: true,
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
      tabLabel: 'Approvals',
      includeInBottomTabs: false,
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
      includeInBottomTabs: false,
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
    id: 'integrations',
    label: 'Integrations',
    segment: 'integrations',
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
    label: 'Channels',
    segment: 'channels',
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
  {
    id: 'marketplace',
    label: 'Marketplace',
    segment: 'marketplace',
    destinationId: 'marketplace',
    web: {},
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
