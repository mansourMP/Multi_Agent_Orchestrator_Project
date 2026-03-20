# Empyralis Product Design Brief

Date: 2026-03-08
Status: Active
Owner: Product + Frontend

## Product Vision

Empyralis should feel like a real operating system for agents.

It is not a developer dashboard.
It is not a graph toy.
It is not a chatbot with extra tabs.

It should feel:
- calm
- precise
- trustworthy
- easy to scan
- easy to operate
- consistent across every screen

The standard is closer to a native operating surface than to a startup admin panel.

## Product Positioning

Empyralis is a practical agent execution platform for normal people and serious operators.

It should support:
- personal use
- study and planning
- business operations
- execution with oversight
- local companion actions on a real computer

It should not require the user to think like a developer to use it.

## Target Users

Primary:
- founders
- operators
- solo business owners
- students with heavy planning/execution needs
- non-technical users who still want powerful automation

Secondary:
- technical users
- developers
- advanced operators

Design rule:
- the product must remain understandable to a non-technical user first
- advanced power should exist without dominating the default UI

## Product Mental Model

The user should understand the product in plain language:

- `Workbench`: do something now
- `Automations`: reusable systems
- `Runs`: what happened
- `Approvals`: what needs permission
- `Agents`: who owns the work
- `Artifacts`: outputs and files
- `Integrations`: connected channels/accounts
- `Settings`: advanced/system

This model must stay stable.

## UX North Star

The experience should feel like:
- one system
- one visual language
- one action model

Every page should answer three questions fast:
1. where am I
2. what can I do here
3. what needs my attention

## Design Principles

### 1. OS, not dashboard
- avoid card soup
- avoid giant decorative containers
- prefer panels, rows, dividers, toolbars, inspectors

### 2. Object-first navigation
- left rail is for durable product objects only
- no vague AI button
- no feature dump in navigation

### 3. One primary action
- each screen gets one obvious main action
- secondary actions are ghost/minor
- destructive actions stay contextual

### 4. Simple for normal people
- short labels
- no internal jargon in primary UI
- no raw runtime/debug text in default views

### 5. Power without noise
- advanced features live in context, drawers, inspect, or settings
- default views should stay clean

### 6. Truthful system state
- if something is connected, assigned, pending, failed, or blocked, say it clearly
- do not hide failure behind optimistic UI

### 7. Same design language everywhere
- same header structure
- same metric strip
- same toolbar rules
- same empty-state behavior
- same chip/button/status rules

## Visual Direction

The design should be:
- minimalist
- serious
- premium
- restrained

Not:
- playful
- neon
- over-decorated
- full of colored pills
- over-explained

## Tonal Reference

The target mood is closer to Anthropic's product quality than to a black startup dashboard.

That means:
- dark mode should feel charcoal, not pure black
- light mode should feel warm and calm, not stark white
- contrast should feel deliberate, not harsh
- surfaces should feel layered through tone and spacing, not by stacking borders everywhere

Practical direction:
- dark surfaces: deep charcoal / graphite neutrals
- light surfaces: warm paper / cream neutrals
- brand violet should stay controlled and intentional
- accent color should not flood the interface

## Color System

Canonical brand tokens:
- Primary: `#6D28D9`
- Highlight: `#8B5CF6`
- Warning: `#F59E0B`

Usage rules:
- primary only for high-value active states and primary actions
- highlight for focus/hover/accent, not general decoration
- warning only for attention-needed states
- semantic success/error/warning must remain readable in light mode and dark mode
- most of the interface should remain neutral

## Layout Rules

Every first-class page should follow:
1. Header
2. Metric strip when needed
3. Toolbar/filter row when needed
4. Primary content

Do not invent page-specific header systems unless there is a strong reason.

## Button Rules

- Primary action: top-right
- Refresh: ghost/secondary
- Row actions: inline or trailing
- Tabs: switch one content region only
- Buttons should not change shape unexpectedly between states
- Active/inactive styles must stay visually related

### Button Governance

Every button must pass these checks:
1. does it represent a real action users need often
2. does it already exist somewhere else on the same screen
3. is this the correct layer for that action
4. is it primary, secondary, or contextual

Rules:
- if an action already has a clear home, do not duplicate it
- do not place the same action in both a page header and a panel unless there is a strong reason
- avoid floating utility buttons that do not map to a clear object
- tabs are not substitutes for buttons
- buttons should feel predictable across screens

Action placement model:
- page-level actions: top-right of header
- filter/search actions: toolbar row
- object actions: inside row/card/detail context
- dangerous actions: contextual only, never promoted as a default CTA

## Layering Rules

Use these layers only:
- shell
- page
- panel
- list/table/timeline
- drawer/modal

Avoid:
- panel inside panel inside card
- giant rounded wrappers around whole pages
- mixed button systems on one screen

## Copy Rules

- titles: 1-2 words
- subtitle: one short line
- buttons: verb-first, 1-2 words
- no long explainer paragraphs in primary views
- system/debug explanation belongs in advanced or inspect

## Anti-Goals

Do not make Empyralis:
- look like a hackathon admin dashboard
- look like a graph-builder product by default
- feel developer-only
- fill screens with badges, pills, and low-value stats
- depend on users understanding runtime internals

## Mobile / Desktop Relationship

Desktop is the main operating surface.
Mobile should be a remote cockpit.

That means:
- desktop gets deeper execution surfaces
- mobile gets chat, approvals, status, and notifications

## Design Questions Every Screen Must Pass

1. Does this screen feel like the same product as the others?
2. Is the primary action obvious?
3. Are there any buttons that do not deserve to exist?
4. Would a non-technical user understand what this page is for?
5. Is the screen readable without long explanations?
6. Is status shown clearly without turning the UI into a dashboard?
7. Is the tonal quality calm and premium, or is it too black, too white, or too noisy?

## Current Direction

Empyralis should move toward:
- consistent OS-like shell
- fewer visual surprises
- fewer button types
- stronger content hierarchy
- clearer ownership and inspectability

The goal is not novelty.
The goal is a product that feels inevitable and dependable.
