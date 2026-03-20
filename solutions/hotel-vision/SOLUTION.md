# Hotel Vision

Hotel Vision packages the reusable `vision-monitor` skill into a hotel operations solution.

It provides:

- a dashboard for monitored spaces
- an alerts workflow for occupancy and confidence issues
- demo data for sales and local testing
- a namespaced solution route under `/solutions/hotel-vision`

This solution does not own provider secrets. It expects runtime-level AI providers and Telegram connectivity to already exist in the core platform.
