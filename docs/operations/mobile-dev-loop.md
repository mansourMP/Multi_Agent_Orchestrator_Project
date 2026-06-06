# Empyralis Mobile Development Loop

Use three different loops depending on what changed.

## JS-only UI work

Run:

```sh
npm run mobile:go --prefix mobile
```

This updates `mobile/.env.local`, stops duplicate Metro processes on port `8082`, and starts Expo in LAN mode for Expo Go.

## Development-client work

Run:

```sh
npm run mobile:dev --prefix mobile
```

Use this when the installed native development build exists on the phone and you need dev-client behavior.

## Native rebuild/install

Run:

```sh
npm run mobile:ios --prefix mobile -- --device "Mansur阿龙"
```

Use this only after native config, pods, entitlements, native modules, or iOS project files change.

## Xcode rule

Do not run Xcode GUI builds and CLI builds at the same time. Xcode and `expo run:ios` share DerivedData and can lock `build.db`, causing `database is locked` failures.
