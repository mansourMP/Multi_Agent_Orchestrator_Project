# Hekor Runtime Scaffold

This folder defines the execution-runtime boundary for Hekor.

It does not choose the runtime implementation language yet.

The purpose of this folder is to make one architectural rule explicit:

- the web app is the control plane
- the runtime is the execution plane

## Scope

The runtime should eventually support:

- local machine execution
- headless server execution
- cloud-side execution where appropriate

All of those should speak the same task lifecycle.

## First artifacts in this folder

- `contracts/runtime-manifest.v1.example.json`
- `contracts/task-envelope.v1.example.json`

These files are examples only.
They are here to define the boundary before implementation choices are locked.

## What this folder is not

This is not a desktop shell.

It is also not a replacement for the current frontend.

It is the place where Hekor's runtime contract starts to become explicit.
