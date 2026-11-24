# CROWNFALL

**Rise to power. Fight to remain.**

Crownfall is a work-in-progress strategic expansion of [OpenFront](https://github.com/openfrontio/OpenFrontIO), an online, browser-based real-time strategy game. The goal is to preserve the fast, map-focused gameplay of OpenFront while adding a lightweight layer of national development, decision-making and cooperation.

> **Development status:** Early development and planning. The features described below are goals, not claims about features that are already implemented.

## The idea

In Crownfall, territory makes a nation powerful, but good leadership helps it stay powerful. Players will still expand, attack, defend and compete on the map. They will also make decisions about how their country develops and how it handles internal problems.

The aim is to make the middle and late game more interesting without turning the game into a complicated grand-strategy simulator.

## Planned features

- **National development paths** — specialise in Military, Politics or Research, with meaningful strengths and trade-offs.
- **National augments** — choose from three upgrade options when offered. Each player can select a maximum of **five augments per match**.
- **National management** — manage gold, civilian population, science and a simple national stability system.
- **Civilian buildings** — invest in housing, public services and research centres.
- **Internal crises** — neglecting national stability may lead to unrest, migration or rebellions.
- **Meaningful alliances** — request allied attacks, reinforcements and defensive assistance. Allies choose whether to accept.
- **New technologies** — unlock additional military, defensive and research capabilities.
- **A more strategic endgame** — territorial dominance should also require a country to remain stable.

These systems will be introduced gradually and tested individually. The existing map, real-time multiplayer, territorial expansion and core attack mechanics are intended to remain central to the experience.

## Design principles

1. **Keep the game approachable.** New systems should be easy to understand and quick to use.
2. **Make choices matter.** Upgrades and policies should have clear benefits and drawbacks.
3. **Preserve the OpenFront core.** The map and real-time territorial gameplay remain the centre of the game.
4. **Reward cooperation.** Alliances should offer useful ways to coordinate and help one another.
5. **Avoid unnecessary complexity.** National management should add interesting decisions, not constant micromanagement.
6. **Build incrementally.** Implement one system at a time, test it, and fix regressions before moving on.

## Development

Crownfall is being developed from the OpenFront source repository. The commands below follow the upstream project's current setup instructions; check the upstream README and this repository's package files if the requirements change.

### Prerequisites

- Node.js **24.15.0 or newer in the Node 24 release line**
- npm **12.1.0 or newer in the npm 12 release line**
- A modern web browser

### Get the code

```bash
git clone <your-crownfall-repository-url>
cd <your-repository-folder>
```

### Install dependencies

```bash
npm run inst
```

Use the repository's `npm run inst` script rather than `npm install` or `npm i`, as specified by the upstream project.

### Run in development mode

```bash
npm run dev
```

This starts the development client and game server using the upstream development workflow.

### Useful checks

```bash
npm run lint
npm test
```

Refer to the root `package.json` and the upstream documentation for the complete set of available scripts.

## Project structure

The upstream project separates the browser client, server and shared game simulation into different packages. The exact structure may evolve, so consult the repository itself before making architectural changes. Important areas in the upstream project include:

- `src/client` — browser game client
- `src/server` — game server
- `packages/engine` — deterministic game simulation
- `packages/engine-api` — engine types, schemas and update contracts
- `packages/engine-lib` — shared engine utilities
- `packages/shared` — code shared between client and server
- `resources` — game resources and assets, subject to their applicable licences

## Contributing and development approach

This project is being developed incrementally. Before changing an existing system:

1. Understand how the original implementation works.
2. Identify the correct client, server or engine location for the change.
3. Make one focused change at a time.
4. Run the relevant checks and test multiplayer behaviour where possible.
5. Confirm that existing gameplay still works.

Do not commit secrets, local environment files, dependency folders or generated build output. Keep the source files, configuration, lockfiles and game assets required for another developer to clone and run the project.

## Credits and licensing

Crownfall is based on **OpenFrontIO**. The original OpenFront project credits **WarFront.io** as its predecessor.

- Original project: https://github.com/openfrontio/OpenFrontIO
- Original source code licence: **GNU Affero General Public License v3.0 (AGPL-3.0)**
- Original asset terms: see the upstream `LICENSE-ASSETS` file.

This repository must retain the upstream copyright and attribution notices and comply with the applicable source-code and asset licences. The upstream asset terms distinguish between assets under open licences and assets with restricted use. Check `LICENSE`, `LICENSE-ASSETS`, `LICENSING.md` and any asset-specific licence files in this repository before redistributing or replacing assets.

Crownfall is an independent, community development project and is not presented as an official OpenFront release.
