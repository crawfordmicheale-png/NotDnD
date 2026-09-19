# ASHFALL — Wasteland Reckoning

[![CI](https://github.com/crawfordmicheale-png/NotDnD/actions/workflows/ci.yml/badge.svg)](https://github.com/crawfordmicheale-png/NotDnD/actions/workflows/ci.yml)

**[Play it in your browser](https://crawfordmicheale-png.github.io/NotDnD/)**

A top-down hack and slash RPG set on Earth three hundred years after the Collapse. The old world is rust and rumor; something bled out of the machines when they died, and the wastelanders call it the Glow. It twists what it touches — and it answers, if you learn to ask.

Cross the wastes from the Hearth in the west to the bone-ringed den of the **Ash Warden** in the east. Clear scav camps, hound dens and husk gatherings on the way, scavenge gear, level up, and kill the Warden.

Built with Vite + TypeScript on a raw HTML5 canvas. No game engine, no binary assets: every tile, sprite and sound effect is generated procedurally at runtime.

## Running

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm test           # unit tests (vitest)
```

Add `?seed=anything` to the URL to play a specific wasteland. Press `N` on the title screen to roll a new one.

Every push runs the type-checker, the unit tests and a production build; pushes to `main` publish the built game to GitHub Pages.

## Controls

| Input | Action |
| --- | --- |
| `WASD` / arrows | Move |
| Mouse | Aim (your wanderer faces the cursor) |
| Left click (hold) | Light attack |
| Right click / `Shift`+click | Heavy attack — slower, ~2x damage, big knockback, staggers |
| `Space` | Dodge roll (invulnerable during the roll) |
| `Q` | **Ember Bolt** — Glow projectile with a splash |
| `R` | **Ashen Nova** — Glow blast around you that stuns |
| `1` / `2` | Eat canned food (heal 40%) / use a glow shard (refill glow & stamina) |
| `E` | Interact: rest at the campfire, talk to the trader, take gear |
| `F` | Salvage gear on the ground for scrap |
| `Tab` / `C` | Character sheet — spend stat points with `1`–`4` |
| `Esc` / `P` | Pause (`R` while paused abandons the run) |
| `M` | Mute |

## What's in the wasteland

**World.** Each seed generates a ~150×130 tile map: ash flats, cracked earth, old highways lined with wrecks, collapsed buildings with stashes, dead forests, glow-sludge pools (slow you and burn), bonefields and glow-crystal fields. A flood fill from the Hearth seals off anything unreachable, so the Warden's den, every camp and every chest is always reachable. Twelve enemy camps are tiered by distance from the Hearth; roaming packs keep the roads dangerous between them.

**Combat.** Stamina gates attacks and dodges. Weapons differ in damage, reach, swing arc and speed — a rebar spear pokes far and narrow, a wrecking sledge is slow and hits everything in front of you. Hitting things builds Glow for spells.

**Enemies.**
- *Scav Raider* — the wasteland's baseline: quick, weak, numerous.
- *Ash Hound* — fast, lunges from range.
- *Glow Husk* — slow, tanky, hits hard; glows in the dark.
- *Bile Spitter* — kites you and spits acid.
- *Rustknight* — armored old-world exo-suit; blunt hits spark off its plating.
- *The Ash Warden* — the boss. Slams, charges, hurls crystal volleys and summons husks; gets faster with every third of its health you take.

**Loot & progression.** Seven weapon bases and five armor bases roll in four rarities (Scrap, Worn, Tempered, Relic). Standing on a drop shows whether it's an upgrade; take it with `E` or salvage it with `F`. XP levels you up and grants stat points for Vigor, Might, Agility and Attunement. Scrap buys food, shards, tempering and gear crates from Marrow at the Hearth.

**Death.** You wake at the Hearth with a third of your scrap gone. The world stays as you left it — mostly.

## Project layout

```
src/
  core/        rng, value noise, math, input, camera, synthesized audio
  world/       tile definitions, procedural map generation, chunk-cached tile renderer, collision
  entities/    player, enemy definitions + AI (incl. boss), particles, shared types
  items/       weapons, armor, rarity, loot rolls
  render/      procedural sprite drawing for every entity
  game/        the Game class: loop, combat resolution, spawning, interactions, lighting
  ui/          HUD (bars, minimap with fog of war, prompts, toasts) and overlay screens
tests/         vitest unit tests for map connectivity, collision, camera projection, items and progression
```
