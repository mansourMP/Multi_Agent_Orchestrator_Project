# UX Reference Taxonomy

Date: 2026-04-09  
Repository root: `/Users/mansur/Multi_Agent_Orchestrator_Project`  
Study scope: reference-library analysis only. No Empyralis source code changes.

## 1. Reference Library Created

Created root-level directory:

- `/Users/mansur/Multi_Agent_Orchestrator_Project/references`

Reference repositories cloned into it:

- `/Users/mansur/Multi_Agent_Orchestrator_Project/references/dub`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/references/shadcn-ui`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/references/cal-com`

## 2. Exact Files Studied

### Dub

- `/Users/mansur/Multi_Agent_Orchestrator_Project/references/dub/packages/tailwind-config/tailwind.config.ts`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/references/dub/packages/ui/src/modal.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/references/dub/packages/ui/src/popover.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/references/dub/packages/ui/src/button.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/references/dub/packages/ui/src/form.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/references/dub/apps/web/ui/webhooks/add-edit-webhook-form.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/references/dub/apps/web/ui/oauth-apps/add-edit-app-form.tsx`

### shadcn-ui

- `/Users/mansur/Multi_Agent_Orchestrator_Project/references/shadcn-ui/apps/v4/registry/new-york-v4/ui/dialog.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/references/shadcn-ui/apps/v4/registry/new-york-v4/ui/sheet.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/references/shadcn-ui/apps/v4/registry/new-york-v4/ui/popover.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/references/shadcn-ui/apps/v4/registry/new-york-v4/ui/drawer.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/references/shadcn-ui/apps/v4/registry/new-york-v4/ui/button.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/references/shadcn-ui/apps/v4/registry/new-york-v4/ui/field.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/references/shadcn-ui/apps/v4/registry/new-york-v4/ui/card.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/references/shadcn-ui/apps/v4/app/(app)/create/components/project-form.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/references/shadcn-ui/apps/v4/components/theme-customizer.tsx`

### Cal.com

- `/Users/mansur/Multi_Agent_Orchestrator_Project/references/cal-com/packages/platform/atoms/src/components/ui/dialog.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/references/cal-com/packages/ui/components/form/wizard/WizardForm.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/references/cal-com/packages/app-store-cli/src/components/AppCreateUpdateForm.tsx`
- `/Users/mansur/Multi_Agent_Orchestrator_Project/references/cal-com/packages/embeds/embed-core/src/ModalBox/ModalBoxHtml.ts`

## 3. Executive Summary

The three codebases do not stay clean by reducing capability. They stay clean by enforcing a few strong anatomical rules:

1. They use a very small number of **semantic layers** instead of ad hoc component styling.
2. They keep overlay math simple. Either:
   - everything floating lives on one high layer, or
   - there is a short, explicit ladder: nav, dialog, popover, mobile drawer.
3. They separate **surface identity** from **interaction identity**:
   - surface tokens define what something is
   - button variants define what the user should do
4. Complex configuration is broken into:
   - grouped fields
   - separators
   - one or two dominant actions
   - small supporting controls
5. Mobile and desktop are not visually forced into one primitive. The best systems switch:
   - dialog on desktop
   - drawer/sheet on mobile

## 4. Layering and Z-Index Taxonomy

## 4.1 Dub

### Raw findings

From `/references/dub/packages/ui/src/modal.tsx`:

- desktop dialog overlay uses `z-40`
- desktop dialog content uses `z-40`
- mobile drawer overlay uses `z-50`
- mobile drawer content uses `z-50`
- internal sticky drawer island uses `z-20`

From `/references/dub/packages/ui/src/popover.tsx`:

- mobile drawer fallback overlay/content use `z-50`
- popover content uses `z-50`
- mobile sticky drawer header uses `z-20`

From `/references/dub/packages/ui/src/nav/nav-mobile.tsx` and related grep hits:

- mobile top controls appear around `z-40`
- mobile nav trigger around `z-30`
- full-screen mobile nav panel around `z-20`

### Anatomical rule

Dub does not use a huge z-index ladder. It uses a short system:

- `z-20`: internal sticky affordances inside overlays
- `z-30`: sticky/top chrome
- `z-40`: desktop modal plane
- `z-50`: popovers, drawers, mobile overlays

### Why it stays clean

- They do not chase micro-layer precision for every component.
- They only escalate when crossing a real surface boundary.
- Mobile fallbacks become drawers rather than trying to keep tiny popovers usable on small screens.

## 4.2 shadcn-ui

### Raw findings

From the v4 primitives:

- dialog overlay: `z-50`
- dialog content: `z-50`
- sheet overlay: `z-50`
- sheet content: `z-50`
- drawer overlay: `z-50`
- drawer content: `z-50`
- popover content: `z-50`
- tooltip content: `z-50`
- menubar/context menu/popover variants: `z-50`

### Anatomical rule

shadcn-ui intentionally collapses nearly all floating UI into the same top layer.

That means it solves complexity through:

- portal ordering
- semantic slots
- consistent animations

not through a long z-index scale.

### Why it stays clean

- the primitive system is predictable
- every overlay feels like it belongs to one family
- the design does not expose implementation anxiety through random z-index numbers

## 4.3 Cal.com

### Raw findings

From `/references/cal-com/packages/platform/atoms/src/components/ui/dialog.tsx`:

- dialog overlay uses `z-50`
- dialog content uses `z-50`
- primitives are wrapped centrally so the whole monorepo can be changed from one place

From `/references/cal-com/packages/embeds/embed-core/src/ModalBox/ModalBoxHtml.ts`:

- embed modal uses an extreme z-index `999999999999`

### Anatomical rule

Cal.com splits layering into two worlds:

1. internal app primitives:
   - conventional dialog layering
   - centrally wrapped Radix primitives
2. external embeds:
   - extremely defensive layering
   - guaranteed dominance over unknown host page CSS

### Why it stays clean

- platform atoms centralize the behavior
- the exceptional case is isolated to embeds, not spread across the app

## 4.4 Extracted rule for Empyralis

Tier-1 products do not invent many layers. They do one of these:

- one main overlay plane for all floating UI
- or a short ladder with 3-4 steps

They do not let page components define their own stacking politics.

## 5. Semantic UI Naming Conventions

## 5.1 Dub naming system

### Surface tokens

From `/references/dub/packages/tailwind-config/tailwind.config.ts`:

- `bg-default`
- `bg-subtle`
- `bg-muted`
- `bg-inverted`
- `border-subtle`
- `border-default`
- `border-emphasis`
- `content-subtle`
- `content-default`
- `content-emphasis`
- `content-inverted`

### Interaction tokens

From `/references/dub/packages/ui/src/button.tsx`:

- `primary`
- `secondary`
- `outline`
- `success`
- `danger`
- `danger-outline`

### Meaning

Dub names UI in terms of:

- surface depth
- border importance
- content intensity
- action intent

This is not aesthetic naming. It is semantic naming.

## 5.2 shadcn-ui naming system

### Surface tokens

From the registry primitives:

- `bg-background`
- `bg-card`
- `bg-popover`
- `bg-secondary`
- `bg-muted`
- `text-foreground`
- `text-muted-foreground`
- `text-popover-foreground`
- `text-card-foreground`

### Structural naming

From many files:

- `data-slot="dialog-content"`
- `data-slot="card-header"`
- `data-slot="field-group"`
- `data-slot="tabs-trigger"`
- `data-slot="sidebar-content"`

### Interaction naming

From `/references/shadcn-ui/apps/v4/registry/new-york-v4/ui/button.tsx`:

- `default`
- `destructive`
- `outline`
- `secondary`
- `ghost`
- `link`

### Meaning

shadcn-ui separates:

- what the thing is
- where the thing sits
- how the thing behaves

through `data-slot`, semantic colors, and narrow interaction variants.

## 5.3 Cal.com naming system

### Surface tokens

From `/references/cal-com/packages/ui/components/form/wizard/WizardForm.tsx` and atoms:

- `bg-default`
- `border-subtle`
- `text-emphasis`
- `text-subtle`
- `bg-background`
- `text-muted-foreground`

### Structural naming

From atoms and form system:

- `WizardForm`
- `Steps`
- `DialogHeader`
- `DialogFooter`
- `DialogTitle`
- `DialogDescription`

### Meaning

Cal.com uses a semantic naming model close to Dub:

- default vs subtle background
- emphasis vs subtle text
- wizard, step, header, footer, content as role labels

This keeps large scheduling and setup flows readable.

## 5.4 Extracted rule for Empyralis

Tier-1 systems do not name classes by decoration. They name them by:

- depth
- emphasis
- role
- intent

The winning vocabulary looks like:

- background, card, popover, muted, subtle
- foreground, muted-foreground, emphasis
- header, footer, content, title, description
- primary, secondary, ghost, destructive

## 6. Template and Configuration Flow Anatomy

## 6.1 shadcn-ui: Project creation flow

File:
- `/references/shadcn-ui/apps/v4/app/(app)/create/components/project-form.tsx`

### Raw anatomy

- entry point is one button: `Create Project`
- configuration lives in a dialog
- choices are grouped using:
  - `FieldGroup`
  - `Field`
  - `FieldSet`
  - `FieldSeparator`
  - `FieldLegend`
- high-level choice controls are:
  - template grid
  - base grid
  - monorepo switch
  - RTL switch
  - package manager tabs
- output is one concrete command string
- footer is not cluttered with many actions:
  - copy button inside the tab rail
  - one full-width `Copy Command` CTA

### Rule

When a flow is complex, shadcn-ui:

- keeps the number of actions very small
- lets the user configure many things through structured sections
- turns the result into one obvious outcome

## 6.2 shadcn-ui: Device-adaptive overlays

File:
- `/references/shadcn-ui/apps/v4/components/theme-customizer.tsx`

### Raw anatomy

- mobile uses `Drawer`
- desktop uses `Dialog`
- the content is the same conceptually
- only the shell changes

### Rule

Do not force popovers or dialogs to survive unchanged across device classes.
Preserve the information model; swap the container.

## 6.3 Dub: configuration forms

Files:
- `/references/dub/apps/web/ui/webhooks/add-edit-webhook-form.tsx`
- `/references/dub/apps/web/ui/oauth-apps/add-edit-app-form.tsx`

### Raw anatomy

The Dub forms stay readable because they use:

- plain section labels with short nouns
  - `Name`
  - `URL`
  - `Signing secret`
  - `Workspace level events`
  - `Link level events`
- one dominant action
- bordered group boxes for long checkbox sets
- inline helper affordances:
  - `InfoTooltip`
  - `CopyButton`
  - file upload
  - switches
- disabled states with explanation
- success/failure feedback via toast, not giant instructional text blocks

### Rule

Dense forms remain clean when:

- each section has a clear noun
- each section has one primary control family
- helper actions stay small and adjacent
- explanation is localized to the field, not repeated in page prose

## 6.4 Dub: simple form wrapper

File:
- `/references/dub/packages/ui/src/form.tsx`

### Raw anatomy

The generic form shell is:

- title
- description
- one input zone
- bottom action rail
- optional help text
- one save button

### Rule

Even when the system can do more, the default form wrapper should assume:

- one intent
- one save action
- one help area

## 6.5 Cal.com: wizard flow

File:
- `/references/cal-com/packages/ui/components/form/wizard/WizardForm.tsx`

### Raw anatomy

- step title
- step description
- explicit stepper
- one rounded bordered content container
- navigation footer with only:
  - `Back`
  - `Next`
  - `Finish`

### Rule

Cal.com keeps multi-step complexity calm by using:

- explicit sequence
- one content box per step
- no extra actions in the footer unless the step owns them

## 6.6 Cal.com: create-template flow

File:
- `/references/cal-com/packages/app-store-cli/src/components/AppCreateUpdateForm.tsx`

### Raw anatomy

- fields asked one at a time
- strong field labels and explainers
- conditional extra fields only when needed
- terminal summary after completion

### Rule

A template flow can stay clean even if the underlying configuration is rich, as long as:

- only the currently relevant field is foregrounded
- optional fields are conditional
- the user is not shown every configuration branch at once

## 7. Tier-1 Anatomical Rules

These are the exact reusable rules extracted from the reference set.

## 7.1 Overlay rules

1. Use one floating plane by default.
2. Add a second plane only for app chrome or embedded edge cases.
3. Mobile should prefer drawers/sheets for dense controls.
4. Internal sticky subheaders inside overlays can sit on a lower local layer.
5. Centralize overlay primitives so every dialog/popover/sheet does not reinvent structure.

## 7.2 Surface rules

1. Name surfaces by semantic role:
   - background
   - card
   - popover
   - muted
   - subtle
2. Name text by intensity:
   - foreground
   - muted-foreground
   - emphasis
   - subtle
3. Name borders by hierarchy:
   - subtle
   - default
   - emphasis

## 7.3 Component anatomy rules

1. Every complex component should expose stable semantic parts:
   - header
   - title
   - description
   - content
   - footer
2. `data-slot` or equivalent semantic markers make styling systems scale better.
3. Action variants should be small and strict:
   - primary/default
   - secondary
   - ghost
   - outline
   - destructive

## 7.4 Configuration-flow rules

1. Use grouped fields, not giant undifferentiated forms.
2. Separate sections with real spatial separators, not extra prose.
3. Keep one dominant submit action.
4. Localize help to the field or section.
5. Only reveal advanced fields when they are contextually necessary.
6. Make the final output or consequence obvious:
   - copied command
   - saved webhook
   - created app
   - completed step

## 7.5 Density rules

1. Density comes from strong grouping, not from shrinking everything.
2. Dense surfaces still preserve:
   - one visual headline
   - one primary action
   - one or two secondary controls
3. Secondary affordances belong inside the relevant section, not sprayed across the page.

## 8. What These References Have in Common

Despite different products, all three references share the same deeper pattern:

- semantic tokens over decorative class naming
- centralized overlay primitives
- controlled action vocabulary
- small number of surface roles
- mobile/desktop container swaps
- structured configuration sections
- visible but restrained micro-animation

None of them rely on:

- many bespoke z-index values
- endless button variants
- giant explanatory paragraphs to compensate for weak structure
- every page inventing its own layout language

## 9. Practical Taxonomy Summary

If reduced to one compact rulebook, the reference-library answer is:

### Layering

- App chrome
- Floating UI
- Embedded hard-override only when necessary

### Surface naming

- background
- card
- popover
- muted
- subtle
- foreground
- muted-foreground
- emphasis

### Action naming

- primary
- secondary
- ghost
- outline
- destructive

### Configuration anatomy

- header
- short description
- grouped sections
- separators
- one primary action
- device-appropriate overlay shell

## 10. Final Conclusion

Tier-1 density is not achieved by making everything smaller or more complex.
It is achieved by making the UI anatomically consistent.

The references show that a premium, dense system is built from:

- a narrow overlay taxonomy
- semantic surface tokens
- stable component slots
- sparse action hierarchy
- structured configuration blocks

That is the actual design infrastructure behind the “clean but powerful” feeling.
