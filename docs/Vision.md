  1. CanvasNodeDefault.vue
  Location:
  packages/frontend/editor-ui/src/features/workflows/canvas/components/elements/nodes/render-types/CanvasNodeDefault.v
  ue

     1 <script lang="ts" setup>
     2 import { computed, ref, useCssModule, watch } from 'vue';
     3 import { useNodeConnections } from '@/app/composables/useNodeConnections';
     4 import { useI18n } from '@n8n/i18n';
     5 import { useCanvasNode } from '../../../../composables/useCanvasNode';
     6 import type { CanvasNodeDefaultRender } from '../../../../canvas.types';
     7 import { useCanvas } from '../../../../composables/useCanvas';
     8 import { useZoomAdjustedValues } from '../../../../composables/useZoomAdjustedValues';
     9 import CanvasNodeSettingsIcons from './parts/CanvasNodeSettingsIcons.vue';
    10 import { useNodeHelpers } from '@/app/composables/useNodeHelpers';
    11 import { calculateNodeSize } from '@/app/utils/nodeViewUtils';
    12 import ExperimentalInPlaceNodeSettings from
       '../../../../experimental/components/ExperimentalEmbeddedNodeDetails.vue';
    13 import CanvasNodeTooltip from './parts/CanvasNodeTooltip.vue';
    14 import CanvasNodeDisabledStrikeThrough from './parts/CanvasNodeDisabledStrikeThrough.vue';
    15 import CanvasNodeStatusIcons from './parts/CanvasNodeStatusIcons.vue';
    16 import NodeIcon from '@/app/components/NodeIcon.vue';
    17 import { useRoute } from 'vue-router';
    18 import { VIEWS } from '@/app/constants';
    19 import type { NodeIconSource } from '@/app/utils/nodeIcon';
    20
    21 const $style = useCssModule();
    22 const i18n = useI18n();
    23
    24 const emit = defineEmits<{
    25     'open:contextmenu': [event: MouseEvent];
    26     activate: [id: string, event: MouseEvent];
    27     'replace:node': [id: string];
    28 }>();
    29
    30 const { initialized, viewport, isExperimentalNdvActive } = useCanvas();
    31 const { calculateNodeBorderOpacity } = useZoomAdjustedValues(viewport);
    32 const route = useRoute();
    33 const {
    34     id,
    35     label,
    36     subtitle,
    37     inputs,
    38     outputs,
    39     connections,
    40     isDisabled,
    41     isReadOnly,
    42     isSelected,
    43     hasPinnedData,
    44     executionStatus,
    45     executionWaiting,
    46     executionWaitingForNext,
    47     executionRunning,
    48     hasRunData,
    49     hasExecutionErrors,
    50     render,
    51     isNotInstalledCommunityNode,
    52 } = useCanvasNode();
    53 const { mainOutputs, mainOutputConnections, mainInputs, mainInputConnections, nonMainInputs } =
    54     useNodeConnections({
    55         inputs,
    56         outputs,
    57         connections,
    58     });
    59
    60 const nodeHelpers = useNodeHelpers();
    61 const renderOptions = computed(() => render.value.options as CanvasNodeDefaultRender['options']);
    62 const isDemoRoute = computed(() => route.name === VIEWS.DEMO);
    63
    64 const classes = computed(() => {
    65     return {
    66         [$style.node]: true,
    67         [$style.selected]: isSelected.value,
    68         [$style.disabled]:
    69             isDisabled.value || (isNotInstalledCommunityNode.value && !isDemoRoute.value),
    70         [$style.success]: hasRunData.value && executionStatus.value === 'success',
    71         [$style.error]: hasExecutionErrors.value,
    72         [$style.pinned]: hasPinnedData.value,
    73         [$style.waiting]: executionWaiting.value || executionStatus.value === 'waiting',
    74         [$style.running]: executionRunning.value || executionWaitingForNext.value,
    75         [$style.configurable]: renderOptions.value.configurable,
    76         [$style.configuration]: renderOptions.value.configuration,
    77         [$style.trigger]: renderOptions.value.trigger,
    78         [$style.warning]: renderOptions.value.dirtiness !== undefined,
    79         [$style.placeholder]: renderOptions.value.placeholder,
    80         waiting: executionWaiting.value || executionStatus.value === 'waiting',
    81         running: executionRunning.value || executionWaitingForNext.value,
    82     };
    83 });
    84
    85 const iconSize = computed(() => (renderOptions.value.configuration ? 30 : 40));
    86
    87 const nodeSize = computed(() =>
    88     calculateNodeSize(
    89         renderOptions.value.configuration ?? false,
    90         renderOptions.value.configurable ?? false,
    91         mainInputs.value.length,
    92         mainOutputs.value.length,
    93         nonMainInputs.value.length,
    94         isExperimentalNdvActive.value,
    95     ),
    96 );
    97
    98 const nodeBorderOpacity = calculateNodeBorderOpacity();
    99
   100 const styles = computed(() => ({
   101     '--canvas-node--width': `${nodeSize.value.width}px`,
   102     '--canvas-node--height': `${nodeSize.value.height}px`,
   103     '--node--icon--size': `${iconSize.value}px`,
   104     '--canvas-node--border--opacity-light': nodeBorderOpacity.value.light,
   105     '--canvas-node--border--opacity-dark': nodeBorderOpacity.value.dark,
   106 }));
   107
   108 const dataTestId = computed(() => {
   109     let type = 'default';
   110     if (renderOptions.value.configurable) {
   111         type = 'configurable';
   112     } else if (renderOptions.value.configuration) {
   113         type = 'configuration';
   114     } else if (renderOptions.value.trigger) {
   115         type = 'trigger';
   116     }
   117
   118     return `canvas-${type}-node`;
   119 });
   120
   121 const isStrikethroughVisible = computed(() => {
   122     const isSingleMainInputNode =
   123         mainInputs.value.length === 1 && mainInputConnections.value.length <= 1;
   124     const isSingleMainOutputNode =
   125         mainOutputs.value.length === 1 && mainOutputConnections.value.length <= 1;
   126
   127     return isDisabled.value && isSingleMainInputNode && isSingleMainOutputNode;
   128 });
   129
   130 const iconSource = computed(() => {
   131     if (renderOptions.value.placeholder) {
   132         return {
   133             type: 'icon',
   134             name: 'plus',
   135         } as NodeIconSource;
   136     }
   137     return renderOptions.value.icon;
   138 });
   139
   140 const showTooltip = ref(false);
   141
   142 watch(initialized, () => {
   143     if (initialized.value) {
   144         showTooltip.value = true;
   145     }
   146 });
   147
   148 watch(viewport, () => {
   149     showTooltip.value = false;
   150     setTimeout(() => {
   151         showTooltip.value = true;
   152     }, 0);
   153 });
   154
   155 function openContextMenu(event: MouseEvent) {
   156     emit('open:contextmenu', event);
   157 }
   158
   159 function onActivate(event: MouseEvent) {
   160     if (renderOptions.value.placeholder) {
   161         emit('replace:node', id.value);
   162         return;
   163     }
   164
   165     emit('activate', id.value, event);
   166 }
   167 </script>
   168
   169 <template>
   170     <ExperimentalInPlaceNodeSettings
   171         v-if="isExperimentalNdvActive"
   172         :node-id="id"
   173         :class="classes"
   174         :style="styles"
   175         :is-read-only="isReadOnly"
   176         :is-configurable="renderOptions.configurable ?? false"
   177     />
   178     <div
   179         v-else
   180         :class="classes"
   181         :style="styles"
   182         :data-test-id="dataTestId"
   183         @contextmenu="openContextMenu"
   184         @dblclick.stop="onActivate"
   185     >
   186         <CanvasNodeTooltip v-if="renderOptions.tooltip" :visible="showTooltip" />
   187         <NodeIcon
   188             :icon-source="iconSource"
   189             :size="iconSize"
   190             :shrink="false"
   191             :disabled="isDisabled"
   192             :class="$style.icon"
   193         />
   194         <CanvasNodeSettingsIcons
   195             v-if="
   196                 !renderOptions.configuration &&
   197                 !isDisabled &&
   198                 !(hasPinnedData && !nodeHelpers.isProductionExecutionPreview.value)
   199             "
   200         />
   201         <CanvasNodeDisabledStrikeThrough v-if="isStrikethroughVisible" />
   202         <div :class="$style.description">
   203             <div v-if="label" :class="$style.label">
   204                 {{ label }}
   205             </div>
   206             <div v-if="isDisabled" :class="$style.disabledLabel">
   207                 ({{ i18n.baseText('node.disabled') }})
   208             </div>
   209             <div v-if="subtitle && !isNotInstalledCommunityNode" :class="$style.subtitle">
   210                 {{ subtitle }}
   211             </div>
   212         </div>
   213         <CanvasNodeStatusIcons v-if="!isDisabled" :class="$style.statusIcons" />
   214     </div>
   215 </template>
   216
   217 <style lang="scss" module>
   218 .node {
   219     --canvas-node--border-width: 1.5px;
   220     --trigger-node--radius: 36px;
   221     --canvas-node--status-icons--margin: var(--spacing--3xs);
   222     --node--icon--color: var(--color--foreground--shade-1);
   223
   224     position: relative;
   225     height: var(--canvas-node--height);
   226     width: var(--canvas-node--width);
   227     display: flex;
   228     align-items: center;
   229     justify-content: center;
   230     background: var(--canvas-node--color--background, var(--node--color--background));
   231     background-clip: padding-box;
   232     border: var(--canvas-node--border-width) solid
   233         var(
   234             --canvas-node--border-color,
   235             light-dark(
   236                 oklch(
   237                     from var(--color--neutral-black) l c h / var(--canvas-node--border--opacity-light, 0.1)
   238                 ),
   239                 oklch(
   240                     from var(--color--neutral-white) l c h / var(--canvas-node--border--opacity-dark, 0.15)
   241                 )
   242             )
   243         );
   244     border-radius: var(--radius--lg);
   245
   246     &.trigger {
   247         border-radius: var(--trigger-node--radius) var(--radius--lg) var(--radius--lg)
   248             var(--trigger-node--radius);
   249
   250         &.running::after,
   251         &.waiting::after {
   252             border-radius: var(--trigger-node--radius) var(--radius--lg) var(--radius--lg)
   253                 var(--trigger-node--radius);
   254         }
   255     }
   256
   257     /**
   258      * Node types
   259      */
   260
   261     &.configuration {
   262         border-radius: calc(var(--canvas-node--height) / 2);
   263
   264         &.running::after,
   265         &.waiting::after {
   266             border-radius: calc(var(--canvas-node--height) / 2);
   267         }
   268
   269         .statusIcons {
   270             right: unset;
   271         }
   272     }
   273
   274     &.configurable {
   275         .icon {
   276             margin-left: calc(40px - (var(--node--icon--size)) / 2 - var(--canvas-node--border-width));
   277         }
   278
   279         .description {
   280             top: unset;
   281             position: relative;
   282             margin-top: 0;
   283             margin-left: var(--spacing--sm);
   284             margin-right: var(--spacing--sm);
   285             width: auto;
   286             min-width: unset;
   287             overflow: hidden;
   288             text-overflow: ellipsis;
   289             flex-grow: 1;
   290             flex-shrink: 1;
   291         }
   292
   293         .label {
   294             text-align: left;
   295         }
   296
   297         .subtitle {
   298             text-align: left;
   299         }
   300
   301         &.configuration {
   302             .icon {
   303                 // 4px represents calc(var(--handle--indicator--width) - configuration node offset) / 2)
   304                 margin-left: calc((var(--canvas-node--height) - var(--node--icon--size) - 4px) / 2);
   305             }
   306
   307             .statusIcons {
   308                 position: static;
   309                 margin-right: var(--spacing--2xs);
   310             }
   311
   312             .description {
   313                 margin-right: var(--spacing--xs);
   314             }
   315         }
   316     }
   317
   318     /**
   319      * State classes
   320      * The reverse order defines the priority in case multiple states are active
   321      */
   322
   323     &.selected {
   324         /* stylelint-disable-next-line @n8n/css-var-naming */
   325         box-shadow: 0 0 0 calc(6px * var(--canvas-zoom-compensation-factor, 1))
   326             var(--canvas--color--selected-transparent);
   327     }
   328
   329     &.success {
   330         --canvas-node--border-width: 2px;
   331         --canvas-node--border-color: var(
   332             --color-canvas-node-success-border-color,
   333             var(--color--success)
   334         );
   335     }
   336
   337     &.warning {
   338         --canvas-node--border-width: 2px;
   339         --canvas-node--border-color: var(--color--warning);
   340     }
   341
   342     &.error {
   343         --canvas-node--border-color: var(--canvas-node--border-color--error, var(--color--danger));
   344     }
   345
   346     &.pinned {
   347         --canvas-node--border-width: 2px;
   348         --canvas-node--border-color: var(
   349             --color-canvas-node-pinned-border-color,
   350             var(--node--border-color--pinned)
   351         );
   352     }
   353
   354     &.disabled {
   355         --canvas-node--border-color: var(
   356             --color-canvas-node-disabled-border-color,
   357             var(--color--foreground)
   358         );
   359     }
   360
   361     &.running {
   362         border-color: transparent;
   363         --canvas-node--border-color: var(
   364             --color-canvas-node-running-border-color,
   365             var(--node--border-color--running)
   366         );
   367     }
   368
   369     &.waiting {
   370         --canvas-node--border-color: transparent;
   371     }
   372
   373     &.placeholder {
   374         background: var(--color--foreground--tint-2);
   375         border: 2px dashed var(--color--foreground--shade-2);
   376         cursor: pointer;
   377
   378         &:hover {
   379             .icon {
   380                 color: var(--color--primary);
   381             }
   382         }
   383     }
   384 }
   385
   386 /* stylelint-disable */
   387 .running::after,
   388 .waiting::after {
   389     content: '';
   390     position: absolute;
   391     inset: -3px;
   392     border-radius: 10px;
   393     z-index: -1;
   394     background: conic-gradient(
   395         from var(--node--gradient-angle),
   396         rgba(255, 109, 90, 1),
   397         rgba(255, 109, 90, 1) 20%,
   398         rgba(255, 109, 90, 0.2) 35%,
   399         rgba(255, 109, 90, 0.2) 65%,
   400         rgba(255, 109, 90, 1) 90%,
   401         rgba(255, 109, 90, 1)
   402     );
   403 }
   404
   405 .running::after {
   406     animation: border-rotate 1.5s linear infinite;
   407 }
   408 .waiting::after {
   409     animation: border-rotate 4.5s linear infinite;
   410 }
   411
   412 @property --node--gradient-angle {
   413     syntax: '<angle>';
   414     initial-value: 0deg;
   415     inherits: false;
   416 }
   417
   418 @keyframes border-rotate {
   419     from {
   420         --node--gradient-angle: 0deg;
   421     }
   422     to {
   423         --node--gradient-angle: 360deg;
   424     }
   425 }
   426 /* stylelint-enable */
   427
   428 .description {
   429     top: 100%;
   430     position: absolute;
   431     width: 100%;
   432     min-width: calc(var(--canvas-node--width) * 2);
   433     margin-top: var(--spacing--2xs);
   434     display: flex;
   435     flex-direction: column;
   436     gap: var(--spacing--4xs);
   437     pointer-events: none;
   438 }
   439
   440 .label,
   441 .disabledLabel {
   442     font-size: var(--font-size--md);
   443     text-align: center;
   444     text-overflow: ellipsis;
   445     display: -webkit-box;
   446     -webkit-box-orient: vertical;
   447     -webkit-line-clamp: 2;
   448     overflow: hidden;
   449     overflow-wrap: anywhere;
   450     font-weight: var(--font-weight--medium);
   451     line-height: var(--line-height--sm);
   452 }
   453
   454 .subtitle {
   455     width: 100%;
   456     text-align: center;
   457     color: var(--color--text--tint-1);
   458     font-size: var(--font-size--xs);
   459     white-space: nowrap;
   460     overflow: hidden;
   461     text-overflow: ellipsis;
   462     line-height: var(--line-height--sm);
   463     font-weight: var(--font-weight--regular);
   464 }
   465
   466 .statusIcons {
   467     position: absolute;
   468     bottom: var(--canvas-node--status-icons--margin);
   469     right: var(--canvas-node--status-icons--margin);
   470 }
   471
   472 .icon {
   473     flex-grow: 0;
   474     flex-shrink: 0;
   475 }
   476 </style>

  2. CanvasNodeIcon.vue
  (Note: As mentioned, I cannot access the file system to read
  packages/frontend/editor-ui/src/app/components/NodeIcon.vue directly. I am omitting it to avoid providing a summary
  or hallucinated content.)

  3. CanvasEdge.vue
  Location: packages/frontend/editor-ui/src/features/workflows/canvas/components/elements/edges/CanvasEdge.vue

     1 <script lang="ts" setup>
     2 /* eslint-disable vue/no-multiple-template-root */
     3 import type { CanvasConnectionData } from '../../../canvas.types';
     4 import { isValidNodeConnectionType } from '@/app/utils/typeGuards';
     5 import type { Connection, EdgeProps } from '@vue-flow/core';
     6 import { BaseEdge, EdgeLabelRenderer } from '@vue-flow/core';
     7 import { NodeConnectionTypes } from 'n8n-workflow';
     8 import { computed, ref, toRef, useCssModule, watch } from 'vue';
     9 import CanvasEdgeToolbar from './CanvasEdgeToolbar.vue';
    10 import { getEdgeRenderData } from './utils';
    11 import { useCanvas } from '../../../composables/useCanvas';
    12 import { useZoomAdjustedValues } from '../../../composables/useZoomAdjustedValues';
    13
    14 const emit = defineEmits<{
    15     add: [connection: Connection];
    16     delete: [connection: Connection];
    17     'update:label:hovered': [hovered: boolean];
    18 }>();
    19
    20 export type CanvasEdgeProps = EdgeProps<CanvasConnectionData> & {
    21     readOnly?: boolean;
    22     hovered?: boolean;
    23     bringToFront?: boolean; // Determines if entire edges layer should be brought to front
    24 };
    25
    26 const props = defineProps<CanvasEdgeProps>();
    27
    28 const data = toRef(props, 'data');
    29
    30 const $style = useCssModule();
    31
    32 const { viewport } = useCanvas();
    33 const { calculateEdgeLightness } = useZoomAdjustedValues(viewport);
    34
    35 const connectionType = computed(() =>
    36     isValidNodeConnectionType(props.data.source.type)
    37         ? props.data.source.type
    38         : NodeConnectionTypes.Main,
    39 );
    40
    41 const delayedHovered = ref(props.hovered);
    42 const delayedHoveredSetTimeoutRef = ref<NodeJS.Timeout | null>(null);
    43 const delayedHoveredTimeout = 600;
    44
    45 watch(
    46     () => props.hovered,
    47     (isHovered) => {
    48         if (isHovered) {
    49             if (delayedHoveredSetTimeoutRef.value) clearTimeout(delayedHoveredSetTimeoutRef.value);
    50             delayedHovered.value = true;
    51         } else {
    52             delayedHoveredSetTimeoutRef.value = setTimeout(() => {
    53                 delayedHovered.value = false;
    54             }, delayedHoveredTimeout);
    55         }
    56     },
    57     { immediate: true },
    58 );
    59
    60 const renderToolbar = computed(() => delayedHovered.value && !props.readOnly);
    61
    62 const isMainConnection = computed(() => data.value.source.type === NodeConnectionTypes.Main);
    63
    64 const status = computed(() => props.data.status);
    65
    66 const edgeStyle = computed(() => ({
    67     ...props.style,
    68     ...(isMainConnection.value ? {} : { strokeDasharray: '5,6' }),
    69 }));
    70
    71 const edgeClasses = computed(() => ({
    72     [$style.edge]: true,
    73     hovered: delayedHovered.value,
    74     'bring-to-front': props.bringToFront,
    75 }));
    76
    77 const edgeToolbarStyle = computed(() => ({
    78     transform: `translate(-50%, -50%) translate(${labelPosition.value[0]}px, ${labelPosition.value[1]}px)`,
    79     ...(delayedHovered.value && props.bringToFront ? { zIndex: 1 } : {}),
    80 }));
    81
    82 const edgeToolbarClasses = computed(() => ({
    83     [$style.edgeLabelWrapper]: true,
    84     'vue-flow__edge-label': true,
    85     selected: props.selected,
    86     [$style.straight]: renderData.value.isConnectorStraight,
    87 }));
    88
    89 const renderData = computed(() =>
    90     getEdgeRenderData(props, {
    91         connectionType: connectionType.value,
    92     }),
    93 );
    94
    95 const segments = computed(() => renderData.value.segments);
    96
    97 const labelPosition = computed(() => renderData.value.labelPosition);
    98
    99 const connection = computed<Connection>(() => ({
   100     source: props.source,
   101     target: props.target,
   102     sourceHandle: props.sourceHandleId,
   103     targetHandle: props.targetHandleId,
   104 }));
   105
   106 const edgeColor = computed(() => {
   107     if (status.value === 'success') {
   108         return 'var(--color--success)';
   109     } else if (status.value === 'pinned') {
   110         return 'var(--color--secondary)';
   111     }
   112     return undefined;
   113 });
   114
   115 // For colored edges (success/pinned), don't apply hover effect
   116 const hasColoredStatus = computed(() => status.value === 'success' || status.value === 'pinned');
   117 const hoveredForLightness = computed(() => (hasColoredStatus.value ? false : delayedHovered.value));
   118
   119 const edgeLightness = calculateEdgeLightness(hoveredForLightness);
   120
   121 const edgeStyles = computed(() => {
   122     const styles: Record<string, string> = {
   123         '--canvas-edge--color--lightness--light': edgeLightness.value.light,
   124         '--canvas-edge--color--lightness--dark': edgeLightness.value.dark,
   125     };
   126     if (edgeColor.value) {
   127         styles['--canvas-edge--color'] = edgeColor.value;
   128     }
   129     return styles;
   130 });
   131
   132 function onAdd() {
   133     emit('add', connection.value);
   134 }
   135
   136 function onDelete() {
   137     emit('delete', connection.value);
   138 }
   139
   140 function onEdgeLabelMouseEnter() {
   141     emit('update:label:hovered', true);
   142 }
   143
   144 function onEdgeLabelMouseLeave() {
   145     emit('update:label:hovered', false);
   146 }
   147 </script>
   148
   149 <template>
   150     <g
   151         data-test-id="edge"
   152         :data-source-node-name="data.source?.node"
   153         :data-target-node-name="data.target?.node"
   154         :style="edgeStyles"
   155         v-bind="$attrs"
   156     >
   157         <slot name="highlight" v-bind="{ segments }" />
   158
   159         <BaseEdge
   160             v-for="(segment, index) in segments"
   161             :id="`${id}-${index}`"
   162             :key="segment[0]"
   163             :class="edgeClasses"
   164             :style="edgeStyle"
   165             :path="segment[0]"
   166             :marker-end="isMainConnection ? markerEnd : undefined"
   167             :interaction-width="40"
   168         />
   169     </g>
   170
   171     <EdgeLabelRenderer>
   172         <div
   173             data-test-id="edge-label"
   174             :data-source-node-name="data.source?.node"
   175             :data-target-node-name="data.target?.node"
   176             :data-edge-status="status"
   177             :style="edgeToolbarStyle"
   178             :class="edgeToolbarClasses"
   179             @mouseenter="onEdgeLabelMouseEnter"
   180             @mouseleave="onEdgeLabelMouseLeave"
   181         >
   182             <CanvasEdgeToolbar
   183                 v-if="renderToolbar"
   184                 :type="connectionType"
   185                 :target-node="targetNode"
   186                 :source-node="sourceNode"
   187                 @add="onAdd"
   188                 @delete="onDelete"
   189             />
   190             <div v-else :class="$style.edgeLabel">{{ label }}</div>
   191         </div>
   192     </EdgeLabelRenderer>
   193 </template>
   194
   195 <style lang="scss" module>
   196 .edge {
   197     transition: fill 0.3s ease;
   198     // @bugfix cat-1639-connection-colors-not-rendering-correctly
   199     // Using !important here to override BaseEdge styles after Rolldown Vite migration
   200     stroke: var(
   201         --canvas-edge--color,
   202         light-dark(
   203             oklch(var(--canvas-edge--color--lightness--light) 0 0),
   204             oklch(var(--canvas-edge--color--lightness--dark) 0 0)
   205         )
   206     ) !important;
   207     /* stylelint-disable-next-line @n8n/css-var-naming */
   208     stroke-width: calc(2 * var(--canvas-zoom-compensation-factor, 1)) !important;
   209     stroke-linecap: square;
   210 }
   211
   212 .edgeLabelWrapper {
   213     transform: translateY(calc(var(--spacing--xs) * -1));
   214     position: absolute;
   215
   216     /* stylelint-disable-next-line @n8n/css-var-naming */
   217     --label-translate-y: 0;
   218
   219     &.straight {
   220         /* stylelint-disable-next-line @n8n/css-var-naming */
   221         --label-translate-y: -100%;
   222     }
   223 }
   224
   225 .edgeLabel {
   226     /* stylelint-disable-next-line @n8n/css-var-naming */
   227     transform: scale(var(--canvas-zoom-compensation-factor, 1)) translate(0, var(--label-translate-y));
   228     color: var(--canvas--label--color);
   229     font-size: var(--font-size--xs);
   230     background-color: var(--canvas--label--color--background);
   231 }
   232 </style>

  4. getEdgeRenderData.ts (equivalent to utils.ts)
  Location:
  packages/frontend/editor-ui/src/features/workflows/canvas/components/elements/edges/utils/getEdgeRenderData.ts

    1 import type { EdgeProps } from '@vue-flow/core';
    2 import { getBezierPath, getSmoothStepPath, Position } from '@vue-flow/core';
    3 import { NodeConnectionTypes } from 'n8n-workflow';
    4 import type { NodeConnectionType } from 'n8n-workflow';
    5
    6 const EDGE_PADDING_BOTTOM = 130;
    7 const EDGE_PADDING_X = 40;
    8 const EDGE_BORDER_RADIUS = 16;
    9 const HANDLE_SIZE = 20; // Required to avoid connection line glitching when initially interacting with the
      handle
   10
   11 const isRightOfSourceHandle = (sourceX: number, targetX: number) => sourceX - HANDLE_SIZE > targetX;
   12
   13 export function getEdgeRenderData(
   14     props: Pick<
   15         EdgeProps,
   16         'sourceX' | 'sourceY' | 'sourcePosition' | 'targetX' | 'targetY' | 'targetPosition'
   17     >,
   18     {
   19         connectionType = NodeConnectionTypes.Main,
   20     }: {
   21         connectionType?: NodeConnectionType;
   22     } = {},
   23 ) {
   24     const { targetX, targetY, sourceX, sourceY, sourcePosition, targetPosition } = props;
   25     const isConnectorStraight = sourceY === targetY;
   26
   27     if (!isRightOfSourceHandle(sourceX, targetX) || connectionType !== NodeConnectionTypes.Main) {
   28         const segment = getBezierPath(props);
   29         return {
   30             segments: [segment],
   31             labelPosition: [segment[1], segment[2]],
   32             isConnectorStraight,
   33         };
   34     }
   35
   36     // Connection is backwards and the source is on the right side
   37     // -> We need to avoid overlapping the source node
   38     const firstSegmentTargetX = (sourceX + targetX) / 2;
   39     const firstSegmentTargetY = sourceY + EDGE_PADDING_BOTTOM;
   40     const firstSegment = getSmoothStepPath({
   41         sourceX,
   42         sourceY,
   43         targetX: firstSegmentTargetX,
   44         targetY: firstSegmentTargetY,
   45         sourcePosition,
   46         targetPosition: Position.Right,
   47         borderRadius: EDGE_BORDER_RADIUS,
   48         offset: EDGE_PADDING_X,
   49     });
   50
   51     const secondSegment = getSmoothStepPath({
   52         sourceX: firstSegmentTargetX,
   53         sourceY: firstSegmentTargetY,
   54         targetX,
   55         targetY,
   56         sourcePosition: Position.Left,
   57         targetPosition,
   58         borderRadius: EDGE_BORDER_RADIUS,
   59         offset: EDGE_PADDING_X,
   60     });
   61
   62     return {
   63         segments: [firstSegment, secondSegment],
   64         labelPosition: [firstSegmentTargetX, firstSegmentTargetY],
   65         isConnectorStraight,
   66     };
   67 }

  5. useZoomAdjustedValues.ts
  Location: packages/frontend/editor-ui/src/features/workflows/canvas/composables/useZoomAdjustedValues.ts

    1 import { computed, ref, type Ref } from 'vue';
    2 import type { ViewportTransform } from '@vue-flow/core';
    3
    4 /**
    5  * Composable for calculating zoom-adjusted visual values (lightness, opacity, etc.)
    6  * Uses gamma correction for perceptually smooth transitions
    7  */
    8 export function useZoomAdjustedValues(viewport: Ref<ViewportTransform>) {
    9     /**
   10      * Core calculation function with gamma correction
   11      * @param zoom - Current zoom level
   12      * @param baseValue - Value at 100% zoom
   13      * @param maxValue - Value at minimum zoom
   14      * @param minZoom - Minimum zoom threshold (default: 0.2)
   15      * @param gamma - Gamma correction for perceptual smoothness (default: 2.2)
   16      */
   17     function calculateZoomAdjustedValue(
   18         zoom: number,
   19         baseValue: number,
   20         maxValue: number,
   21         minZoom = 0.2,
   22         gamma = 2.2,
   23     ): number {
   24         if (zoom >= 1.0) {
   25             return baseValue;
   26         } else if (zoom <= minZoom) {
   27             return maxValue;
   28         } else {
   29             const t = (1.0 - zoom) / (1.0 - minZoom);
   30             const tGamma = Math.pow(t, gamma);
   31             return baseValue + tGamma * (maxValue - baseValue);
   32         }
   33     }
   34
   35     /**
   36      * Calculate edge lightness values for light and dark modes
   37      * @param hovered - Whether the edge is hovered (optional, defaults to false)
   38      */
   39     function calculateEdgeLightness(hovered: Ref<boolean> = ref(false)) {
   40         return computed(() => {
   41             const zoom = viewport.value.zoom;
   42             let lightnessLight = calculateZoomAdjustedValue(zoom, 0.84, 0.6);
   43             let lightnessDark = calculateZoomAdjustedValue(zoom, 0.42, 0.66);
   44
   45             if (hovered.value) {
   46                 lightnessLight = Math.max(0, lightnessLight - 0.3); // Darken by 30%
   47                 lightnessDark = Math.min(1, lightnessDark + 0.2); // Lighten by 20%
   48             }
   49
   50             return {
   51                 light: lightnessLight.toFixed(3),
   52                 dark: lightnessDark.toFixed(3),
   53             };
   54         });
   55     }
   56
   57     /**
   58      * Calculate handle border lightness values for light and dark modes
   59      */
   60     function calculateHandleLightness() {
   61         return computed(() => {
   62             const zoom = viewport.value.zoom;
   63             const lightnessLight = calculateZoomAdjustedValue(zoom, 0.68, 0.3);
   64             const lightnessDark = calculateZoomAdjustedValue(zoom, 0.5, 0.7);
   65
   66             return {
   67                 light: lightnessLight.toFixed(3),
   68                 dark: lightnessDark.toFixed(3),
   69             };
   70         });
   71     }
   72
   73     /**
   74      * Calculate node border opacity values for light and dark modes
   75      */
   76     function calculateNodeBorderOpacity() {
   77         return computed(() => {
   78             const zoom = viewport.value.zoom;
   79             const opacityLight = calculateZoomAdjustedValue(zoom, 0.1, 0.7);
   80             const opacityDark = calculateZoomAdjustedValue(zoom, 0.2, 0.7);
   81
   82             return {
   83                 light: opacityLight.toFixed(3),
   84                 dark: opacityDark.toFixed(3),
   85             };
   86         });
   87     }
   88
   89     return {
   90         calculateZoomAdjustedValue,
   91         calculateEdgeLightness,
   92         calculateHandleLightness,
   93         calculateNodeBorderOpacity,
   94     };
   95 }

  6. Canvas.vue
  Location: packages/frontend/editor-ui/src/features/workflows/canvas/components/Canvas.vue

      1 <script lang="ts" setup>
      2 import ContextMenu from '@/features/shared/contextMenu/components/ContextMenu.vue';
      3 import type { ContextMenuTarget } from '@/features/shared/contextMenu/composables/useContextMenu';
      4 import { useContextMenu } from '@/features/shared/contextMenu/composables/useContextMenu';
      5 import type { CanvasLayoutEvent } from '../composables/useCanvasLayout';
      6 import { useCanvasLayout } from '../composables/useCanvasLayout';
      7 import { useCanvasNodeHover } from '../composables/useCanvasNodeHover';
      8 import { useCanvasTraversal } from '../composables/useCanvasTraversal';
      9 import { type KeyMap, useKeybindings } from '@/app/composables/useKeybindings';
     10 import type { PinDataSource } from '@/app/composables/usePinnedData';
     11 import { CanvasKey } from '@/app/constants';
     12 import { useUsersStore } from '@/features/settings/users/users.store';
     13 import { NODE_CREATOR_SHORTCUT_COACHMARK_KEY } from
        '@/features/shared/nodeCreator/composables/useNodeCreatorShortcutCoachmark';
     14 import type { NodeCreatorOpenSource } from '@/Interface';
     15 import type {
     16     CanvasConnection,
     17     CanvasEventBusEvents,
     18     CanvasNode,
     19     CanvasNodeData,
     20     CanvasNodeMoveEvent,
     21     ConnectStartEvent,
     22 } from '../canvas.types';
     23 import { CanvasNodeRenderType } from '../canvas.types';
     24 import { isOutsideSelected } from '@/app/utils/htmlUtils';
     25 import {
     26     getMousePosition,
     27     GRID_SIZE,
     28     updateViewportToContainNodes,
     29 } from '@/app/utils/nodeViewUtils';
     30 import { isPresent } from '@/app/utils/typesUtils';
     31 import { useDeviceSupport } from '@n8n/composables/useDeviceSupport';
     32 import { useShortKeyPress } from '@n8n/composables/useShortKeyPress';
     33 import type { EventBus } from '@n8n/utils/event-bus';
     34 import { createEventBus } from '@n8n/utils/event-bus';
     35 import type {
     36     Connection,
     37     Dimensions,
     38     GraphNode,
     39     NodeDragEvent,
     40     NodeMouseEvent,
     41     ViewportTransform,
     42     XYPosition,
     43 } from '@vue-flow/core';
     44 import { getRectOfNodes, MarkerType, PanelPosition, useVueFlow, VueFlow } from '@vue-flow/core';
     45 import { MiniMap } from '@vue-flow/minimap';
     46 import { onKeyDown, onKeyUp, useThrottleFn } from '@vueuse/core';
     47 import { NodeConnectionTypes } from 'n8n-workflow';
     48 import {
     49     computed,
     50     nextTick,
     51     onMounted,
     52     onUnmounted,
     53     provide,
     54     ref,
     55     toRef,
     56     useCssModule,
     57     watch,
     58 } from 'vue';
     59 import { useViewportAutoAdjust } from '../composables/useViewportAutoAdjust';
     60 import CanvasBackground from './elements/background/CanvasBackground.vue';
     61 import CanvasArrowHeadMarker from './elements/edges/CanvasArrowHeadMarker.vue';
     62 import CanvasConnectionLine from './elements/edges/CanvasConnectionLine.vue';
     63 import CanvasControlButtons from './elements/buttons/CanvasControlButtons.vue';
     64 import Edge from './elements/edges/CanvasEdge.vue';
     65 import Node from './elements/nodes/CanvasNode.vue';
     66 import { useExperimentalNdvStore } from '../experimental/experimentalNdv.store';
     67 import { type ContextMenuAction } from '@/features/shared/contextMenu/composables/useContextMenuItems';
     68 import { useFocusedNodesStore } from '@/features/ai/assistant/focusedNodes.store';
     69 import { useChatPanelStore } from '@/features/ai/assistant/chatPanel.store';
     70 import { useSetupPanelStore } from '@/features/setupPanel/setupPanel.store';
     71
     72 const $style = useCssModule();
     73
     74 const emit = defineEmits<{
     75     'update:modelValue': [elements: CanvasNode[]];
     76     'update:node:position': [id: string, position: XYPosition];
     77     'update:nodes:position': [events: CanvasNodeMoveEvent[]];
     78     'update:node:activated': [id: string, event?: MouseEvent];
     79     'update:node:deactivated': [id: string];
     80     'update:node:enabled': [id: string];
     81     'update:node:selected': [id?: string];
     82     'update:node:name': [id: string];
     83     'update:node:parameters': [id: string, parameters: Record<string, unknown>];
     84     'update:node:inputs': [id: string];
     85     'update:node:outputs': [id: string];
     86     'update:logs-open': [open?: boolean];
     87     'update:logs:input-open': [open?: boolean];
     88     'update:logs:output-open': [open?: boolean];
     89     'update:has-range-selection': [isActive: boolean];
     90     'click:node': [id: string, position: XYPosition];
     91     'click:node:add': [id: string, handle: string];
     92     'run:node': [id: string];
     93     'copy:production:url': [id: string];
     94     'copy:test:url': [id: string];
     95     'delete:node': [id: string];
     96     'replace:node': [id: string];
     97     'create:node': [source: NodeCreatorOpenSource];
     98     'create:sticky': [];
     99     'delete:nodes': [ids: string[]];
    100     'update:nodes:enabled': [ids: string[]];
    101     'copy:nodes': [ids: string[]];
    102     'duplicate:nodes': [ids: string[]];
    103     'update:nodes:pin': [ids: string[], source: PinDataSource];
    104     'cut:nodes': [ids: string[]];
    105     'delete:connection': [connection: Connection];
    106     'create:connection:start': [handle: ConnectStartEvent];
    107     'create:connection': [connection: Connection];
    108     'create:connection:end': [connection: Connection, event?: MouseEvent];
    109     'create:connection:cancelled': [
    110         handle: ConnectStartEvent,
    111         position: XYPosition,
    112         event?: MouseEvent,
    113     ];
    114     'click:connection:add': [connection: Connection];
    115     'click:pane': [position: XYPosition];
    116     'run:workflow': [];
    117     'create:workflow': [];
    118     'drag-and-drop': [position: XYPosition, event: DragEvent];
    119     'tidy-up': [
    120         CanvasLayoutEvent,
    121         {
    122             trackEvents?: boolean;
    123             trackHistory?: boolean;
    124             trackBulk?: boolean;
    125         },
    126     ];
    127     'toggle:focus-panel': [];
    128     'viewport:change': [viewport: ViewportTransform, dimensions: Dimensions];
    129     'selection:end': [position: XYPosition];
    130     'open:sub-workflow': [nodeId: string];
    131     'start-chat': [];
    132     'extract-workflow': [ids: string[]];
    133 }>();
    134
    135 const props = withDefaults(
    136     defineProps<{
    137         id?: string;
    138         nodes: CanvasNode[];
    139         connections: CanvasConnection[];
    140         controlsPosition?: PanelPosition;
    141         eventBus?: EventBus<CanvasEventBusEvents>;
    142         readOnly?: boolean;
    143         executing?: boolean;
    144         keyBindings?: boolean;
    145         loading?: boolean;
    146         suppressInteraction?: boolean;
    147         hideControls?: boolean;
    148         initialViewport?: ViewportTransform | null;
    149     }>(),
    150     {
    151         id: 'canvas',
    152         nodes: () => [],
    153         connections: () => [],
    154         controlsPosition: PanelPosition.BottomLeft,
    155         eventBus: () => createEventBus(),
    156         readOnly: false,
    157         executing: false,
    158         keyBindings: true,
    159         loading: false,
    160         suppressInteraction: false,
    161         hideControls: false,
    162     },
    163 );
    164
    165 const { isMobileDevice, controlKeyCode } = useDeviceSupport();
    166 const usersStore = useUsersStore();
    167 const experimentalNdvStore = useExperimentalNdvStore();
    168 const focusedNodesStore = useFocusedNodesStore();
    169 const chatPanelStore = useChatPanelStore();
    170 const setupPanelStore = useSetupPanelStore();
    171
    172 const isExperimentalNdvActive = computed(() => experimentalNdvStore.isActive(viewport.value.zoom));
    173
    174 const vueFlow = useVueFlow(props.id);
    175 const {
    176     getSelectedNodes: selectedNodes,
    177     addSelectedNodes,
    178     removeSelectedNodes,
    179     viewportRef,
    180     fitView,
    181     fitBounds,
    182     zoomIn,
    183     zoomOut,
    184     zoomTo,
    185     setInteractive,
    186     elementsSelectable,
    187     project,
    188     nodes: graphNodes,
    189     onPaneReady,
    190     onNodesInitialized,
    191     findNode,
    192     viewport,
    193     dimensions,
    194     nodesSelectionActive,
    195     userSelectionRect,
    196     setViewport,
    197     setCenter,
    198     onEdgeMouseLeave,
    199     onEdgeMouseEnter,
    200     onEdgeMouseMove,
    201     onNodeMouseEnter,
    202     onNodeMouseLeave,
    203 } = vueFlow;
    204 const {
    205     getIncomingNodes,
    206     getOutgoingNodes,
    207     getSiblingNodes,
    208     getDownstreamNodes,
    209     getUpstreamNodes,
    210 } = useCanvasTraversal(vueFlow);
    211 const { layout } = useCanvasLayout(props.id, isExperimentalNdvActive);
    212
    213 const isPaneReady = ref(false);
    214
    215 const classes = computed(() => ({
    216     [$style.canvas]: true,
    217     [$style.ready]: !props.loading && isPaneReady.value,
    218     [$style.isExperimentalNdvActive]: isExperimentalNdvActive.value,
    219     spotlightActive: setupPanelStore.isHighlightActive,
    220 }));
    221
    222 /**
    223  * Panning and Selection key bindings
    224  */
    225
    226 // @see https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_key_values#whitespace_keys
    227 const panningKeyCode = ref<string[] | true>(isMobileDevice ? true : [' ', controlKeyCode]);
    228 const panningMouseButton = ref<number[] | true>(isMobileDevice ? true : [1]);
    229 const selectionKeyCode = ref<string | true | null>(isMobileDevice ? 'Shift' : true);
    230 const isInPanningMode = ref(false);
    231
    232 function switchToPanningMode() {
    233     selectionKeyCode.value = null;
    234     panningMouseButton.value = [0, 1];
    235     isInPanningMode.value = true;
    236 }
    237
    238 function switchToSelectionMode() {
    239     selectionKeyCode.value = true;
    240     panningMouseButton.value = [1];
    241     isInPanningMode.value = false;
    242 }
    243
    244 onKeyDown(panningKeyCode.value, switchToPanningMode, {
    245     dedupe: true,
    246 });
    247
    248 onKeyUp(panningKeyCode.value, switchToSelectionMode);
    249
    250 /**
    251  * Rename node key bindings
    252  * We differentiate between short and long press because the space key is also used for activating panning
    253  */
    254
    255 const renameKeyCode = ' ';
    256
    257 useShortKeyPress(
    258     renameKeyCode,
    259     () => {
    260         if (lastSelectedNode.value) {
    261             emit('update:node:name', lastSelectedNode.value.id);
    262         }
    263     },
    264     {
    265         disabled: toRef(props, 'readOnly'),
    266     },
    267 );
    268
    269 /**
    270  * Key bindings
    271  */
    272
    273 const disableKeyBindings = computed(() => !props.keyBindings);
    274
    275 function selectLeftNode(id: string) {
    276     const incomingNodes = getIncomingNodes(id);
    277     const previousNode = incomingNodes[0];
    278     if (previousNode) {
    279         onSelectNodes({ ids: [previousNode.id] });
    280     }
    281 }
    282
    283 function selectRightNode(id: string) {
    284     const outgoingNodes = getOutgoingNodes(id);
    285     const nextNode = outgoingNodes[0];
    286     if (nextNode) {
    287         onSelectNodes({ ids: [nextNode.id] });
    288     }
    289 }
    290
    291 function selectLowerSiblingNode(id: string) {
    292     const siblingNodes = getSiblingNodes(id);
    293     const index = siblingNodes.findIndex((n) => n.id === id);
    294     const nextNode = siblingNodes[index + 1] ?? siblingNodes[0];
    295     if (nextNode) {
    296         onSelectNodes({
    297             ids: [nextNode.id],
    298         });
    299     }
    300 }
    301
    302 function selectUpperSiblingNode(id: string) {
    303     const siblingNodes = getSiblingNodes(id);
    304     const index = siblingNodes.findIndex((n) => n.id === id);
    305     const previousNode = siblingNodes[index - 1] ?? siblingNodes[siblingNodes.length - 1];
    306     if (previousNode) {
    307         onSelectNodes({
    308             ids: [previousNode.id],
    309         });
    310     }
    311 }
    312
    313 function selectDownstreamNodes(id: string) {
    314     const downstreamNodes = getDownstreamNodes(id);
    315     onSelectNodes({ ids: [...downstreamNodes.map((node) => node.id), id] });
    316 }
    317
    318 function selectUpstreamNodes(id: string) {
    319     const upstreamNodes = getUpstreamNodes(id);
    320     onSelectNodes({ ids: [...upstreamNodes.map((node) => node.id), id] });
    321 }
    322
    323 function onToggleZoomMode() {
    324     experimentalNdvStore.toggleZoomMode({
    325         canvasViewport: viewport.value,
    326         canvasDimensions: dimensions.value,
    327         selectedNodes: selectedNodes.value,
    328         setViewport,
    329         fitView,
    330         zoomTo,
    331         setCenter,
    332     });
    333 }
    334
    335 const keyMap = computed(() => {
    336     const readOnlyKeymap: KeyMap = {
    337         ctrl_shift_o: emitWithLastSelectedNode((id) => emit('open:sub-workflow', id)),
    338         ctrl_c: {
    339             disabled: () => isOutsideSelected(viewportRef.value),
    340             run: emitWithSelectedNodes((ids) => emit('copy:nodes', ids)),
    341         },
    342         enter: emitWithLastSelectedNode((id) => onSetNodeActivated(id)),
    343         ctrl_a: () => addSelectedNodes(graphNodes.value),
    344         // Support both key and code for zooming in and out
    345         'shift_+|+|=|shift_Equal|Equal': async () => await onZoomIn(),
    346         'shift+_|-|_|shift_Minus|Minus': async () => await onZoomOut(),
    347         0: async () => await onResetZoom(),
    348         1: async () => await onFitView(),
    349         ArrowUp: emitWithLastSelectedNode(selectUpperSiblingNode),
    350         ArrowDown: emitWithLastSelectedNode(selectLowerSiblingNode),
    351         ArrowLeft: emitWithLastSelectedNode(selectLeftNode),
    352         ArrowRight: emitWithLastSelectedNode(selectRightNode),
    353         shift_ArrowLeft: emitWithLastSelectedNode(selectUpstreamNodes),
    354         shift_ArrowRight: emitWithLastSelectedNode(selectDownstreamNodes),
    355         l: () => emit('update:logs-open'),
    356         i: () => emit('update:logs:input-open'),
    357         o: () => emit('update:logs:output-open'),
    358         z: onToggleZoomMode,
    359     };
    360
    361     if (props.readOnly) return readOnlyKeymap;
    362
    363     const fullKeymap: KeyMap = {
    364         ...readOnlyKeymap,
    365         ctrl_x: emitWithSelectedNodes((ids) => emit('cut:nodes', ids)),
    366         'delete|backspace': emitWithSelectedNodes((ids) => emit('delete:nodes', ids)),
    367         ctrl_d: emitWithSelectedNodes((ids) => emit('duplicate:nodes', ids)),
    368         d: emitWithSelectedNodes((ids) => emit('update:nodes:enabled', ids)),
    369         p: emitWithSelectedNodes((ids) => emit('update:nodes:pin', ids, 'keyboard-shortcut')),
    370         f2: emitWithLastSelectedNode((id) => emit('update:node:name', id)),
    371         n: () => emit('create:node', 'node_shortcut'),
    372         tab: {
    373             disabled: () => usersStore.isCalloutDismissed(NODE_CREATOR_SHORTCUT_COACHMARK_KEY),
    374             run: () => {
    375                 props.eventBus.emit('deprecated:tab-shortcut');
    376             },
    377         },
    378         shift_s: () => emit('create:sticky'),
    379         shift_f: () => emit('toggle:focus-panel'),
    380         ctrl_alt_n: () => emit('create:workflow'),
    381         ctrl_enter: () => emit('run:workflow'),
    382         // override the default cmd+s which saves the page html as file
    383         ctrl_s: () => {},
    384         shift_alt_t: async () => await onTidyUp({ source: 'keyboard-shortcut' }),
    385         alt_x: emitWithSelectedNodes((ids) => emit('extract-workflow', ids)),
    386         c: () => emit('start-chat'),
    387         r: emitWithLastSelectedNode((id) => emit('replace:node', id)),
    388         shift_alt_u: emitWithLastSelectedNode((id) => emit('copy:test:url', id)),
    389         alt_u: emitWithLastSelectedNode((id) => emit('copy:production:url', id)),
    390         alt_i: emitWithSelectedNodes((ids) => onAddSelectedNodesToAi(ids)),
    391     };
    392     return fullKeymap;
    393 });
    394
    395 useKeybindings(keyMap, { disabled: disableKeyBindings });
    396
    397 /**
    398  * Nodes
    399  */
    400
    401 const hasSelection = computed(() => selectedNodes.value.length > 0);
    402 const selectedNodeIds = computed(() => selectedNodes.value.map((node) => node.id));
    403
    404 const lastSelectedNode = ref<GraphNode>();
    405 const triggerNodes = computed(() =>
    406     props.nodes.filter(
    407         (node) =>
    408             node.data?.render.type === CanvasNodeRenderType.Default && node.data.render.options.trigger,
    409     ),
    410 );
    411
    412 const hoveredTriggerNode = useCanvasNodeHover(triggerNodes, vueFlow, (nodeRect) => ({
    413     x: nodeRect.x - nodeRect.width * 2, // should cover the width of trigger button
    414     y: nodeRect.y - nodeRect.height,
    415     width: nodeRect.width * 4,
    416     height: nodeRect.height * 3,
    417 }));
    418
    419 watch(selectedNodes, (nodes) => {
    420     if (!lastSelectedNode.value || !nodes.find((node) => node.id === lastSelectedNode.value?.id)) {
    421         lastSelectedNode.value = nodes[nodes.length - 1];
    422     }
    423 });
    424
    425 watch(selectedNodeIds, (newIds) => {
    426     if (chatPanelStore.isOpen && focusedNodesStore.isFeatureEnabled) {
    427         focusedNodesStore.setUnconfirmedFromCanvasSelection(newIds);
    428     }
    429 });
    430
    431 watch(
    432     () => chatPanelStore.isOpen,
    433     (isOpen) => {
    434         if (isOpen && selectedNodeIds.value.length > 0 && focusedNodesStore.isFeatureEnabled) {
    435             focusedNodesStore.setUnconfirmedFromCanvasSelection(selectedNodeIds.value);
    436         }
    437     },
    438 );
    439
    440 function onClickNodeAdd(id: string, handle: string) {
    441     emit('click:node:add', id, handle);
    442 }
    443
    444 function onUpdateNodesPosition(events: CanvasNodeMoveEvent[]) {
    445     emit('update:nodes:position', events);
    446 }
    447
    448 function onUpdateNodePosition(id: string, position: XYPosition) {
    449     emit('update:node:position', id, position);
    450 }
    451
    452 function onNodeDragStop(event: NodeDragEvent) {
    453     onUpdateNodesPosition(event.nodes.map(({ id, position }) => ({ id, position })));
    454 }
    455
    456 function onNodeClick({ event, node }: NodeMouseEvent) {
    457     if (chatPanelStore.isOpen && focusedNodesStore.isFeatureEnabled) {
    458         focusedNodesStore.setUnconfirmedFromCanvasSelection([node.id]);
    459     }
    460
    461     emit('click:node', node.id, getProjectedPosition(event));
    462
    463     if (event.ctrlKey || event.metaKey || selectedNodes.value.length < 2) {
    464         return;
    465     }
    466
    467     onSelectNodes({ ids: [node.id] });
    468 }
    469
    470 function onSelectionDragStop(event: NodeDragEvent) {
    471     onUpdateNodesPosition(event.nodes.map(({ id, position }) => ({ id, position })));
    472 }
    473
    474 function onSelectionEnd(event: MouseEvent) {
    475     if (selectedNodes.value.length === 1) {
    476         nodesSelectionActive.value = false;
    477     }
    478
    479     emit('selection:end', getProjectedPosition(event));
    480 }
    481
    482 function onSetNodeActivated(id: string, event?: MouseEvent) {
    483     props.eventBus.emit('nodes:action', { ids: [id], action: 'update:node:activated' });
    484     emit('update:node:activated', id, event);
    485 }
    486
    487 function onSetNodeDeactivated(id: string) {
    488     emit('update:node:deactivated', id);
    489 }
    490
    491 function clearSelectedNodes() {
    492     removeSelectedNodes(selectedNodes.value);
    493 }
    494
    495 function onSelectNode() {
    496     emit('update:node:selected', lastSelectedNode.value?.id);
    497 }
    498
    499 function onSelectNodes({ ids, panIntoView }: CanvasEventBusEvents['nodes:select']) {
    500     clearSelectedNodes();
    501     addSelectedNodes(ids.map(findNode).filter(isPresent));
    502
    503     if (panIntoView) {
    504         const nodes = ids.map(findNode).filter(isPresent);
    505
    506         if (nodes.length === 0) {
    507             return;
    508         }
    509
    510         const newViewport = updateViewportToContainNodes(viewport.value, dimensions.value, nodes, 100);
    511
    512         void setViewport(newViewport, { duration: 200, interpolate: 'linear' });
    513     }
    514 }
    515
    516 function onToggleNodeEnabled(id: string) {
    517     emit('update:node:enabled', id);
    518 }
    519
    520 function onDeleteNode(id: string) {
    521     emit('delete:node', id);
    522 }
    523
    524 function onUpdateNodeParameters(id: string, parameters: Record<string, unknown>) {
    525     emit('update:node:parameters', id, parameters);
    526 }
    527
    528 function onUpdateNodeInputs(id: string) {
    529     emit('update:node:inputs', id);
    530
    531     // Let VueFlow update connection paths to match the new handle position
    532     void nextTick(() => vueFlow.updateNodeInternals([id]));
    533 }
    534
    535 function onUpdateNodeOutputs(id: string) {
    536     emit('update:node:outputs', id);
    537
    538     // Let VueFlow update connection paths to match the new handle position
    539     void nextTick(() => vueFlow.updateNodeInternals([id]));
    540 }
    541
    542 function onFocusNode(id: string) {
    543     const node = vueFlow.nodeLookup.value.get(id);
    544
    545     if (node) {
    546         addSelectedNodes([node]);
    547         experimentalNdvStore.focusNode(node, {
    548             canvasViewport: viewport.value,
    549             canvasDimensions: dimensions.value,
    550             setCenter,
    551         });
    552     }
    553 }
    554
    555 function onReplaceNode(id: string) {
    556     emit('replace:node', id);
    557 }
    558
    559 function onAddToAi(id: string) {
    560     focusedNodesStore.confirmNodes([id], 'context_menu');
    561     void chatPanelStore.open({ mode: 'builder' });
    562 }
    563
    564 function onAddSelectedNodesToAi(nodeIds: string[]) {
    565     if (!focusedNodesStore.isFeatureEnabled) {
    566         return;
    567     }
    568     focusedNodesStore.confirmNodes(nodeIds, 'context_menu');
    569     void chatPanelStore.open({ mode: 'builder' });
    570 }
    571
    572 /**
    573  * Connections / Edges
    574  */
    575
    576 const connectionCreated = ref(false);
    577 const connectingHandle = ref<ConnectStartEvent>();
    578 const connectedHandle = ref<Connection>();
    579
    580 function onConnectStart(handle: ConnectStartEvent) {
    581     emit('create:connection:start', handle);
    582
    583     connectingHandle.value = handle;
    584     connectionCreated.value = false;
    585 }
    586
    587 function onConnect(connection: Connection) {
    588     emit('create:connection', connection);
    589
    590     connectedHandle.value = connection;
    591     connectionCreated.value = true;
    592 }
    593
    594 function onConnectEnd(event?: MouseEvent) {
    595     if (connectedHandle.value) {
    596         emit('create:connection:end', connectedHandle.value, event);
    597     } else if (connectingHandle.value) {
    598         emit('create:connection:cancelled', connectingHandle.value, getProjectedPosition(event), event);
    599     }
    600
    601     connectedHandle.value = undefined;
    602     connectingHandle.value = undefined;
    603 }
    604
    605 function onDeleteConnection(connection: Connection) {
    606     emit('delete:connection', connection);
    607 }
    608
    609 function onClickConnectionAdd(connection: Connection) {
    610     emit('click:connection:add', connection);
    611 }
    612
    613 const arrowHeadMarkerId = ref('custom-arrow-head');
    614
    615 /**
    616  * Edge and Nodes Hovering
    617  */
    618
    619 const edgesHoveredById = ref<Record<string, boolean>>({});
    620 const edgesBringToFrontById = ref<Record<string, boolean>>({});
    621
    622 onEdgeMouseEnter(({ edge }) => {
    623     edgesBringToFrontById.value = { [edge.id]: true };
    624     edgesHoveredById.value = { [edge.id]: true };
    625 });
    626
    627 onEdgeMouseMove(
    628     useThrottleFn(({ edge, event }) => {
    629         const type = edge.data.source.type;
    630         if (type !== NodeConnectionTypes.AiTool) {
    631             return;
    632         }
    633
    634         if (!edge.data.maxConnections || edge.data.maxConnections > 1) {
    635             const projectedPosition = getProjectedPosition(event);
    636             const yDiff = projectedPosition.y - edge.targetY;
    637             if (yDiff < 4 * GRID_SIZE) {
    638                 edgesBringToFrontById.value = { [edge.id]: false };
    639             } else {
    640                 edgesBringToFrontById.value = { [edge.id]: true };
    641             }
    642         }
    643     }, 100),
    644 );
    645
    646 onEdgeMouseLeave(({ edge }) => {
    647     edgesBringToFrontById.value = { [edge.id]: false };
    648     edgesHoveredById.value = { [edge.id]: false };
    649 });
    650
    651 function onUpdateEdgeLabelHovered(id: string, hovered: boolean) {
    652     edgesBringToFrontById.value = { [id]: true };
    653     edgesHoveredById.value[id] = hovered;
    654 }
    655
    656 const nodesHoveredById = ref<Record<string, boolean>>({});
    657
    658 onNodeMouseEnter(({ node }) => {
    659     nodesHoveredById.value = { [node.id]: true };
    660 });
    661
    662 onNodeMouseLeave(({ node }) => {
    663     nodesHoveredById.value = { [node.id]: false };
    664 });
    665
    666 /**
    667  * Executions
    668  */
    669
    670 function onRunNode(id: string) {
    671     emit('run:node', id);
    672 }
    673
    674 /**
    675  * Emit helpers
    676  */
    677
    678 function emitWithSelectedNodes(emitFn: (ids: string[]) => void) {
    679     return () => {
    680         if (hasSelection.value) {
    681             emitFn(selectedNodeIds.value);
    682         }
    683     };
    684 }
    685
    686 function emitWithLastSelectedNode(emitFn: (id: string) => void) {
    687     return () => {
    688         if (lastSelectedNode.value) {
    689             emitFn(lastSelectedNode.value.id);
    690         }
    691     };
    692 }
    693
    694 /**
    695  * View
    696  */
    697
    698 const defaultZoom = 1;
    699 const isPaneMoving = ref(false);
    700
    701 useViewportAutoAdjust(viewportRef, viewport, setViewport);
    702
    703 function getProjectedPosition(event?: MouseEvent | TouchEvent) {
    704     const bounds = viewportRef.value?.getBoundingClientRect() ?? { left: 0, top: 0 };
    705     const [offsetX, offsetY] = event ? getMousePosition(event) : [0, 0];
    706
    707     return project({
    708         x: offsetX - bounds.left,
    709         y: offsetY - bounds.top,
    710     });
    711 }
    712
    713 function onClickPane(event: MouseEvent) {
    714     emit('click:pane', getProjectedPosition(event));
    715 }
    716
    717 async function onFitBounds(nodes: GraphNode[]) {
    718     await fitBounds(getRectOfNodes(nodes), { padding: 2 });
    719 }
    720
    721 async function onFitView() {
    722     await fitView({ maxZoom: defaultZoom, padding: 0.2 });
    723 }
    724
    725 async function onZoomTo(zoomLevel: number) {
    726     await zoomTo(zoomLevel);
    727 }
    728
    729 async function onZoomIn() {
    730     await zoomIn();
    731 }
    732
    733 async function onZoomOut() {
    734     await zoomOut();
    735 }
    736
    737 async function onResetZoom() {
    738     await onZoomTo(defaultZoom);
    739 }
    740
    741 function onPaneMove({ event }: { event: unknown }) {
    742     // The event object is either D3ZoomEvent or WheelEvent.
    743     // Here I'm ignoring D3ZoomEvent because it's not necessarily followed by a moveEnd event.
    744     // This can be simplified once https://github.com/bcakmakoglu/vue-flow/issues/1908 is resolved
    745     if (isInPanningMode.value || event instanceof WheelEvent) {
    746         isPaneMoving.value = true;
    747     }
    748 }
    749
    750 function onPaneMoveEnd() {
    751     isPaneMoving.value = false;
    752 }
    753
    754 function onViewportChange() {
    755     emit('viewport:change', viewport.value, dimensions.value);
    756 }
    757
    758 // #AI-716: Due to a bug in vue-flow reactivity, the node data is not updated when the node is added
    759 // resulting in outdated data. We use this computed property as a workaround to get the latest node data.
    760 const nodeDataById = computed(() => {
    761     return props.nodes.reduce<Record<string, CanvasNodeData>>((acc, node) => {
    762         acc[node.id] = node.data as CanvasNodeData;
    763         return acc;
    764     }, {});
    765 });
    766
    767 /**
    768  * Context menu
    769  */
    770
    771 const contextMenu = useContextMenu();
    772
    773 function onOpenContextMenu(event: MouseEvent, target?: Pick<ContextMenuTarget, 'nodeId'>) {
    774     contextMenu.open(event, {
    775         source: 'canvas',
    776         nodeIds: selectedNodeIds.value,
    777         ...target,
    778     });
    779 }
    780
    781 function onOpenSelectionContextMenu({ event }: { event: MouseEvent }) {
    782     onOpenContextMenu(event);
    783 }
    784
    785 function onOpenNodeContextMenu(
    786     id: string,
    787     event: MouseEvent,
    788     source: 'node-button' | 'node-right-click',
    789 ) {
    790     if (source === 'node-button') {
    791         contextMenu.open(event, { source, nodeId: id });
    792     } else if (selectedNodeIds.value.length > 1 && selectedNodeIds.value.includes(id)) {
    793         onOpenContextMenu(event, { nodeId: id });
    794     } else {
    795         onSelectNodes({ ids: [id] });
    796         contextMenu.open(event, { source, nodeId: id });
    797     }
    798 }
    799
    800 async function onContextMenuAction(action: ContextMenuAction, nodeIds: string[]) {
    801     switch (action) {
    802         case 'add_node':
    803             return emit('create:node', 'context_menu');
    804         case 'add_sticky':
    805             return emit('create:sticky');
    806         case 'copy':
    807             return emit('copy:nodes', nodeIds);
    808         case 'delete':
    809             return emit('delete:nodes', nodeIds);
    810         case 'select_all':
    811             return addSelectedNodes(graphNodes.value);
    812         case 'deselect_all':
    813             return clearSelectedNodes();
    814         case 'duplicate':
    815             return emit('duplicate:nodes', nodeIds);
    816         case 'toggle_pin':
    817             return emit('update:nodes:pin', nodeIds, 'context-menu');
    818         case 'execute':
    819             return emit('run:node', nodeIds[0]);
    820         case 'copy_production_url':
    821             return emit('copy:production:url', nodeIds[0]);
    822         case 'copy_test_url':
    823             return emit('copy:test:url', nodeIds[0]);
    824         case 'toggle_activation':
    825             return emit('update:nodes:enabled', nodeIds);
    826         case 'open':
    827             return onSetNodeActivated(nodeIds[0]);
    828         case 'rename':
    829             return emit('update:node:name', nodeIds[0]);
    830         case 'replace':
    831             return emit('replace:node', nodeIds[0]);
    832         case 'change_color':
    833             return props.eventBus.emit('nodes:action', { ids: nodeIds, action: 'update:sticky:color' });
    834         case 'tidy_up':
    835             return await onTidyUp({ source: 'context-menu' });
    836         case 'extract_sub_workflow':
    837             return emit('extract-workflow', nodeIds);
    838         case 'open_sub_workflow': {
    839             return emit('open:sub-workflow', nodeIds[0]);
    840         }
    841         case 'focus_ai_on_selected': {
    842             focusedNodesStore.confirmNodes(nodeIds, 'context_menu');
    843             void chatPanelStore.open({ mode: 'builder' });
    844             return;
    845         }
    846     }
    847 }
    848
    849 async function onTidyUp(payload: CanvasEventBusEvents['tidyUp']) {
    850     if (payload.nodeIdsFilter && payload.nodeIdsFilter.length > 0) {
    851         clearSelectedNodes();
    852         addSelectedNodes(payload.nodeIdsFilter.map(findNode).filter(isPresent));
    853     }
    854     const applyOnSelection = selectedNodes.value.length > 1;
    855     const target = applyOnSelection ? 'selection' : 'all';
    856     const result = layout(target);
    857
    858     emit(
    859         'tidy-up',
    860         { result, target, source: payload.source },
    861         {
    862             trackEvents: payload.trackEvents,
    863             trackHistory: payload.trackHistory,
    864             trackBulk: payload.trackBulk,
    865         },
    866     );
    867
    868     await nextTick();
    869     if (applyOnSelection) {
    870         await onFitBounds(selectedNodes.value);
    871     } else {
    872         await onFitView();
    873     }
    874 }
    875
    876 /**
    877  * Drag and drop
    878  */
    879
    880 function onDragOver(event: DragEvent) {
    881     event.preventDefault();
    882 }
    883
    884 function onDrop(event: DragEvent) {
    885     const position = getProjectedPosition(event);
    886
    887     emit('drag-and-drop', position, event);
    888 }
    889
    890 /**
    891  * Minimap
    892  */
    893
    894 const minimapVisibilityDelay = 1000;
    895 const minimapHideTimeout = ref<NodeJS.Timeout | null>(null);
    896 const isMinimapVisible = ref(false);
    897
    898 function minimapNodeClassnameFn(node: CanvasNode) {
    899     return `minimap-node-${node.data?.render.type.replace(/\./g, '-') ?? 'default'}`;
    900 }
    901
    902 watch(isPaneMoving, (value) => {
    903     if (value) {
    904         showMinimap();
    905     } else {
    906         hideMinimap();
    907     }
    908 });
    909
    910 function showMinimap() {
    911     if (minimapHideTimeout.value) {
    912         clearTimeout(minimapHideTimeout.value);
    913         minimapHideTimeout.value = null;
    914     }
    915
    916     isMinimapVisible.value = true;
    917 }
    918
    919 function hideMinimap() {
    920     minimapHideTimeout.value = setTimeout(() => {
    921         isMinimapVisible.value = false;
    922     }, minimapVisibilityDelay);
    923 }
    924
    925 function onMinimapMouseEnter() {
    926     showMinimap();
    927 }
    928
    929 function onMinimapMouseLeave() {
    930     hideMinimap();
    931 }
    932
    933 /**
    934  * Window Events
    935  */
    936
    937 function onWindowBlur() {
    938     switchToSelectionMode();
    939 }
    940
    941 /**
    942  * Lifecycle
    943  */
    944
    945 const initialized = ref(false);
    946
    947 onMounted(() => {
    948     props.eventBus.on('fitView', onFitView);
    949     props.eventBus.on('nodes:select', onSelectNodes);
    950     props.eventBus.on('nodes:selectAll', () => addSelectedNodes(graphNodes.value));
    951     props.eventBus.on('tidyUp', onTidyUp);
    952     window.addEventListener('blur', onWindowBlur);
    953 });
    954
    955 onUnmounted(() => {
    956     props.eventBus.off('fitView', onFitView);
    957     props.eventBus.off('nodes:select', onSelectNodes);
    958     props.eventBus.off('tidyUp', onTidyUp);
    959     window.removeEventListener('blur', onWindowBlur);
    960 });
    961
    962 onPaneReady(async () => {
    963     if (props.initialViewport) {
    964         await setViewport(props.initialViewport);
    965     } else {
    966         await onFitView();
    967     }
    968     isPaneReady.value = true;
    969 });
    970
    971 onNodesInitialized(() => {
    972     initialized.value = true;
    973 });
    974
    975 watch(
    976     [() => props.readOnly, () => props.suppressInteraction],
    977     ([readOnly, suppressInteraction]) => {
    978         setInteractive(!readOnly && !suppressInteraction);
    979         elementsSelectable.value = !suppressInteraction;
    980     },
    981     {
    982         immediate: true,
    983     },
    984 );
    985
    986 watch([nodesSelectionActive, userSelectionRect], ([isActive, rect]) =>
    987     emit('update:has-range-selection', isActive || (rect?.width ?? 0) > 0 || (rect?.height ?? 0) > 0),
    988 );
    989
    990 watch([vueFlow.nodes, () => experimentalNdvStore.nodeNameToBeFocused], ([nodes, toFocusName]) => {
    991     const toFocusNode =
    992         toFocusName &&
    993         (nodes as Array<GraphNode<CanvasNodeData>>).find((n) => n.data.name === toFocusName);
    994
    995     if (!toFocusNode) {
    996         return;
    997     }
    998
    999     // setTimeout() so that this happens after layout recalculation with the node to be focused
   1000     setTimeout(() => {
   1001         experimentalNdvStore.focusNode(toFocusNode, {
   1002             canvasViewport: viewport.value,
   1003             canvasDimensions: dimensions.value,
   1004             setCenter,
   1005         });
   1006     });
   1007 });
   1008
   1009 /**
   1010  * Provide
   1011  */
   1012
   1013 const isExecuting = toRef(props, 'executing');
   1014
   1015 provide(CanvasKey, {
   1016     connectingHandle,
   1017     isExecuting,
   1018     initialized,
   1019     viewport,
   1020     isExperimentalNdvActive,
   1021     isPaneMoving,
   1022 });
   1023
   1024 defineExpose({
   1025     executeContextMenuAction: onContextMenuAction,
   1026 });
   1027 </script>
   1028
   1029 <template>
   1030     <VueFlow
   1031         :id="id"
   1032         :nodes="nodes"
   1033         :edges="connections"
   1034         :class="classes"
   1035         :apply-changes="false"
   1036         :connection-line-options="{ markerEnd: MarkerType.ArrowClosed }"
   1037         :connection-radius="60"
   1038         :pan-on-drag="panningMouseButton"
   1039         pan-on-scroll
   1040         snap-to-grid
   1041         :snap-grid="[GRID_SIZE, GRID_SIZE]"
   1042         :min-zoom="0"
   1043         :max-zoom="experimentalNdvStore.isZoomedViewEnabled ? experimentalNdvStore.maxCanvasZoom : 4"
   1044         :selection-key-code="selectionKeyCode"
   1045         :zoom-activation-key-code="panningKeyCode"
   1046         :pan-activation-key-code="panningKeyCode"
   1047         :disable-keyboard-a11y="true"
   1048         :delete-key-code="null"
   1049         data-test-id="canvas"
   1050         @connect-start="onConnectStart"
   1051         @connect="onConnect"
   1052         @connect-end="onConnectEnd"
   1053         @pane-click="onClickPane"
   1054         @pane-context-menu="onOpenContextMenu"
   1055         @move="onPaneMove"
   1056         @move-end="onPaneMoveEnd"
   1057         @node-drag-stop="onNodeDragStop"
   1058         @node-click="onNodeClick"
   1059         @selection-drag-stop="onSelectionDragStop"
   1060         @selection-end="onSelectionEnd"
   1061         @selection-context-menu="onOpenSelectionContextMenu"
   1062         @dragover="onDragOver"
   1063         @drop="onDrop"
   1064         @viewport-change="onViewportChange"
   1065     >
   1066         <template #node-canvas-node="nodeProps">
   1067             <slot name="node" v-bind="{ nodeProps }">
   1068                 <Node
   1069                     v-bind="nodeProps"
   1070                     :data="nodeDataById[nodeProps.id]"
   1071                     :read-only="readOnly"
   1072                     :event-bus="eventBus"
   1073                     :hovered="nodesHoveredById[nodeProps.id]"
   1074                     :nearby-hovered="nodeProps.id === hoveredTriggerNode.id.value"
   1075                     :highlighted="setupPanelStore.highlightedNodeIds.has(nodeProps.id)"
   1076                     @delete="onDeleteNode"
   1077                     @run="onRunNode"
   1078                     @select="onSelectNode"
   1079                     @toggle="onToggleNodeEnabled"
   1080                     @activate="onSetNodeActivated"
   1081                     @deactivate="onSetNodeDeactivated"
   1082                     @open:contextmenu="onOpenNodeContextMenu"
   1083                     @update="onUpdateNodeParameters"
   1084                     @update:inputs="onUpdateNodeInputs"
   1085                     @update:outputs="onUpdateNodeOutputs"
   1086                     @move="onUpdateNodePosition"
   1087                     @add="onClickNodeAdd"
   1088                     @focus="onFocusNode"
   1089                     @replace:node="onReplaceNode"
   1090                     @add:ai="onAddToAi"
   1091                 >
   1092                     <template v-if="$slots.nodeToolbar" #toolbar="toolbarProps">
   1093                         <slot name="nodeToolbar" v-bind="toolbarProps" />
   1094                     </template>
   1095                 </Node>
   1096             </slot>
   1097         </template>
   1098
   1099         <template #edge-canvas-edge="edgeProps">
   1100             <slot name="edge" v-bind="{ edgeProps, arrowHeadMarkerId }">
   1101                 <Edge
   1102                     v-bind="edgeProps"
   1103                     :marker-end="`url(#${arrowHeadMarkerId})`"
   1104                     :read-only="readOnly"
   1105                     :hovered="edgesHoveredById[edgeProps.id]"
   1106                     :bring-to-front="edgesBringToFrontById[edgeProps.id]"
   1107                     @add="onClickConnectionAdd"
   1108                     @delete="onDeleteConnection"
   1109                     @update:label:hovered="onUpdateEdgeLabelHovered(edgeProps.id, $event)"
   1110                 />
   1111             </slot>
   1112         </template>
   1113
   1114         <template #connection-line="connectionLineProps">
   1115             <CanvasConnectionLine v-bind="connectionLineProps" />
   1116         </template>
   1117
   1118         <CanvasArrowHeadMarker :id="arrowHeadMarkerId" />
   1119
   1120         <slot name="canvas-background" v-bind="{ viewport }">
   1121             <CanvasBackground :viewport="viewport" :striped="readOnly" />
   1122         </slot>
   1123
   1124         <Transition name="minimap">
   1125             <MiniMap
   1126                 v-show="isMinimapVisible"
   1127                 data-test-id="canvas-minimap"
   1128                 aria-label="n8n Minimap"
   1129                 :height="120"
   1130                 :width="200"
   1131                 :position="PanelPosition.BottomLeft"
   1132                 pannable
   1133                 zoomable
   1134                 :node-class-name="minimapNodeClassnameFn"
   1135                 :node-border-radius="16"
   1136                 @mouseenter="onMinimapMouseEnter"
   1137                 @mouseleave="onMinimapMouseLeave"
   1138             />
   1139         </Transition>
   1140
   1141         <CanvasControlButtons
   1142             v-if="!hideControls"
   1143             data-test-id="canvas-controls"
   1144             :class="$style.canvasControls"
   1145             :position="controlsPosition"
   1146             :show-interactive="false"
   1147             :zoom="viewport.zoom"
   1148             :read-only="readOnly"
   1149             :is-experimental-ndv-active="isExperimentalNdvActive"
   1150             @zoom-to-fit="onFitView"
   1151             @zoom-in="onZoomIn"
   1152             @zoom-out="onZoomOut"
   1153             @reset-zoom="onResetZoom"
   1154             @tidy-up="onTidyUp({ source: 'canvas-button' })"
   1155             @toggle-zoom-mode="onToggleZoomMode"
   1156         />
   1157
   1158         <Suspense>
   1159             <ContextMenu @action="onContextMenuAction" />
   1160         </Suspense>
   1161     </VueFlow>
   1162 </template>
   1163
   1164 <style lang="scss" module>
   1165 .canvas {
   1166     width: 100%;
   1167     height: 100%;
   1168     opacity: 0;
   1169     transition: opacity 300ms ease;
   1170
   1171     &.ready {
   1172         opacity: 1;
   1173     }
   1174
   1175     &.isExperimentalNdvActive {
   1176         /* stylelint-disable-next-line @n8n/css-var-naming */
   1177         --canvas-zoom-compensation-factor: 0.5;
   1178     }
   1179 }
   1180 </style>
   1181
   1182 <style lang="scss" scoped>
   1183 .minimap-enter-active,
   1184 .minimap-leave-active {
   1185     transition: opacity 0.3s ease;
   1186 }
   1187
   1188 .minimap-enter-from,
   1189 .minimap-leave-to {
   1190     opacity: 0;
   1191 }
   1192
   1193 .spotlightActive {
   1194     :deep(.vue-flow__edges) {
   1195         opacity: 0.2;
   1196         transition: opacity 0.5s ease;
   1197     }
   1198
   1199     :deep(.vue-flow__node) {
   1200         opacity: 0.4;
   1201         transition: opacity 0.5s ease;
   1202     }
   1203
   1204     :deep(.vue-flow__node:has(.highlighted)) {
   1205         opacity: 1;
   1206     }
   1207 }

