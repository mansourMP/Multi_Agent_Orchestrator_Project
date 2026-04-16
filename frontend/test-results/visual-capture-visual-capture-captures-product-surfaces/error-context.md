# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: visual-capture.spec.ts >> visual capture >> captures product surfaces
- Location: tests/e2e/visual-capture.spec.ts:42:7

# Error details

```
Test timeout of 90000ms exceeded.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - complementary [ref=e4]:
      - complementary [ref=e5]:
        - img [ref=e7]
        - navigation "Primary destinations" [ref=e9]:
          - link "Sage" [ref=e10] [cursor=pointer]:
            - /url: /w/ws-1/sage
            - img [ref=e11]
          - link "Studio" [ref=e13] [cursor=pointer]:
            - /url: /w/ws-1/studio
            - img [ref=e14]
          - link "Settings" [ref=e19] [cursor=pointer]:
            - /url: /w/ws-1/settings
            - img [ref=e20]
        - button "Switch workspace from E2E Workspace" [ref=e24] [cursor=pointer]:
          - img [ref=e25]
    - generic [ref=e30]:
      - banner [ref=e31]:
        - generic [ref=e32]:
          - generic [ref=e33]: Empyralis
          - generic [ref=e35]: Settings
        - generic [ref=e37]:
          - button "Workspace" [ref=e38] [cursor=pointer]
          - button "Details" [ref=e39] [cursor=pointer]
      - generic [ref=e44]:
        - generic [ref=e46]:
          - heading "Settings" [level=1] [ref=e47]
          - paragraph [ref=e48]: A clean hub for profile, workspace defaults, channels, billing, and safety controls.
        - generic [ref=e49]:
          - generic [ref=e50]:
            - strong [ref=e53]: Your workspace settings are ready
            - generic [ref=e54]: Settings are grouped by customer-facing workflows so core updates are easy to find.
          - generic [ref=e55]:
            - generic [ref=e57]:
              - generic [ref=e58]: Configuration hub
              - strong [ref=e59]: Choose what you want to update
              - generic [ref=e60]: Each section keeps key actions close at hand with plain-language guidance.
            - generic [ref=e62]:
              - article "Profile & identity settings section" [ref=e63]:
                - generic [ref=e64]:
                  - generic [ref=e65]:
                    - strong [ref=e66]: Profile & identity
                    - paragraph [ref=e67]: Update your profile name, account details, and how your identity appears in this workspace.
                  - generic [ref=e68]: Owner
                - button "Manage profile" [ref=e71] [cursor=pointer]
              - article "Connections settings section" [ref=e72]:
                - generic [ref=e73]:
                  - generic [ref=e74]:
                    - strong [ref=e75]: Connections
                    - paragraph [ref=e76]: Connect customer channels and keep linked identities in sync with your workspace.
                  - generic [ref=e77]: Ready to connect channels
                - button "Manage channels" [ref=e80] [cursor=pointer]
              - article "Billing & plan settings section" [ref=e81]:
                - generic [ref=e82]:
                  - generic [ref=e83]:
                    - strong [ref=e84]: Billing & plan
                    - paragraph [ref=e85]: Review subscription details, billing preferences, and plan coverage for your workspace.
                  - generic [ref=e86]: Free plan
                - button "Open billing & plan" [ref=e89] [cursor=pointer]
              - article "Workspace defaults settings section" [ref=e90]:
                - generic [ref=e91]:
                  - generic [ref=e92]:
                    - strong [ref=e93]: Workspace defaults
                    - paragraph [ref=e94]: Set guided defaults for onboarding, workspace behavior, and day-to-day setup preferences.
                  - generic [ref=e95]: Workspace defaults are configured
                - generic [ref=e96]:
                  - button "Run guided setup" [ref=e98] [cursor=pointer]
                  - button "Workspace defaults" [ref=e100] [cursor=pointer]
              - article "Privacy & safety settings section" [ref=e101]:
                - generic [ref=e102]:
                  - generic [ref=e103]:
                    - strong [ref=e104]: Privacy & safety
                    - paragraph [ref=e105]: Adjust safety controls, data handling preferences, and policy settings for trusted operation.
                  - generic [ref=e106]: Safety settings are available
                - button "Open privacy & safety" [ref=e109] [cursor=pointer]
              - article "Team access settings section" [ref=e110]:
                - generic [ref=e111]:
                  - generic [ref=e112]:
                    - strong [ref=e113]: Team access
                    - paragraph [ref=e114]: Manage member access, responsibilities, and team controls for shared workspace management.
                  - generic [ref=e115]: Team controls are available
                - generic [ref=e116]:
                  - button "Manage team access" [ref=e118] [cursor=pointer]
                  - button "Conversation routing" [ref=e120] [cursor=pointer]
          - generic [ref=e121]:
            - generic [ref=e123]:
              - generic [ref=e124]: Overview
              - strong [ref=e125]: E2E Workspace
              - generic [ref=e126]: Personal and workspace preferences in one place.
            - generic [ref=e128]:
              - generic [ref=e129]:
                - generic [ref=e130]: Signed in as
                - generic [ref=e131]: owner@example.com
              - generic [ref=e132]:
                - generic [ref=e133]: Display name
                - generic [ref=e134]: Owner
              - generic [ref=e135]:
                - generic [ref=e136]: Plan
                - generic [ref=e137]: Free
              - generic [ref=e138]:
                - generic [ref=e139]: Workspace type
                - generic [ref=e140]: personal
              - generic [ref=e141]:
                - generic [ref=e142]: Setup status
                - generic [ref=e143]: Setup complete
  - button "Open Next.js Dev Tools" [ref=e149] [cursor=pointer]:
    - img [ref=e150]
  - alert [ref=e153]
```