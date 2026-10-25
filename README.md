# Merge Rush

A polished, mobile-first number-merging puzzle game inspired by the 2048
mechanic, with its own identity: chain bonuses, a combo streak, and **Rush
Mode** for double points. Built with React + TypeScript + Vite. No backend, no
accounts, no analytics. The web build makes no network requests and is fully
playable offline after the first load; the Android app adds Google AdMob ads
(see [Ads](#ads)) and still plays offline, just without ads.

## Prerequisites

- Node.js **18 or newer** (developed and verified on Node 24)
- npm 9 or newer

## Installation

```bash
npm install
```

## Running the game

```bash
npm run dev        # development server (http://localhost:5173)
npm run build      # production build into dist/
npm run preview    # serve the production build (http://localhost:4173)
```

The game installs as a PWA in production builds (`manifest.webmanifest`,
icons, and a cache-first service worker registered by `src/main.tsx`), but it
is fully playable without installing anything.

## Android app (APK / AAB)

The game ships as an Android app through [Capacitor](https://capacitorjs.com/)
(project in `android/`, config in `capacitor.config.ts`). It targets Android 16
(API 36) and runs on Android 8.0+ (API 26), portrait only.

Requirements: JDK 17 and the Android SDK (platform 36). Set `ANDROID_HOME`
(or create `android/local.properties` with `sdk.dir=...`).

**Rebuild the APK and the Play Store bundle** after any game change - from the
project root:

```bash
npm run build && npx cap sync android && cd android && ./gradlew assembleRelease bundleRelease
```

On Windows Command Prompt or PowerShell use `gradlew.bat` instead of
`./gradlew`. The outputs are:

| File | Use |
| ---- | --- |
| `android/app/build/outputs/apk/release/app-release.apk` | Install directly on a phone (sideload) |
| `android/app/build/outputs/bundle/release/app-release.aab` | Upload to Google Play |

To install the APK on a phone connected over USB (with USB debugging on):

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

**Before each Play upload,** raise `versionCode` (and `versionName`) in
`android/app/build.gradle`; Play rejects a bundle whose `versionCode` it has
already seen.

**Signing.** Release builds are signed with `android/merge-rush-release.jks`,
configured in `android/keystore.properties`. Both are git-ignored. Back them
up somewhere safe: every future update must be signed with the same key. If
`keystore.properties` is missing, Gradle produces an unsigned release build.

## Ads

The Android app is free with ads (Google AdMob). Ads are placed where they
cannot interrupt play:

| Placement | Type | When | Limit |
| --------- | ---- | ---- | ----- |
| Continue (revive) | Rewarded, opt-in | The game would end; offered before the final score | Once per game: +1 rescue, +1 Bomb |
| Between games | Interstitial | Play Again / New game after a finished game | Not in the first 2 games; ≥ 2 ad-free games and ≥ 4 min apart; skipped after games under 60 s or after a rewarded ad |

No banners, no ad on app open, nothing mid-move. If a rewarded ad fails to
play after the player tapped it, the revive is granted anyway. Game sound
mutes while an ad plays. EEA/UK players get Google's consent form on first
launch and a shield button in the header to change it.

Code: `src/ads/` (`adService.ts` for AdMob / dev mock / no-ads,
`adPolicy.ts` for interstitial spacing, `useAdFlows.ts` for the UI glue).
In the browser dev server a labelled fake "TEST AD" stands in so the flows can
be played; the web production build and tests show no ads.

**Ad IDs.** Builds use Google's test ads until you configure real IDs: the
AdMob app ID in `android/gradle.properties` (`ADMOB_APP_ID`) and the ad unit
IDs in `.env.production` (template: `.env.example`). Full release steps,
Data safety answers, privacy policy and app-ads.txt templates:
[docs/play-store-release.md](docs/play-store-release.md).

## Testing and checks

```bash
npm run test       # run the full Vitest suite once
npm run test:watch # watch mode
npm run typecheck  # tsc --noEmit with strict settings
```

## Game rules

- 4×4 board; swipe (touch/mouse drag) or press arrow keys / WASD to move all
  tiles in one direction.
- Adjacent equal tiles merge into their sum. Each tile merges at most once per
  move, and a tile produced by a merge cannot merge again in the same move.
- After every successful move one new tile spawns in a random empty cell:
  a **2 with 90% probability**, otherwise a **4**. The next spawn value is
  shown in the **Next** preview.
- A new game starts with two randomly placed 2s.
- An invalid move (nothing changes) does not spawn, score, or alter the combo
  streak or Rush Mode.

### Scoring

- **Base points:** every merge awards the value of the resulting tile
  (2+2→4 gives 4 points, 4+4→8 gives 8 points, …).
- **Chain bonus** for moves with two or more merges. Merges are ordered by
  resolution (lines scanned top-to-bottom / left-to-right, wall-outward) and
  get chain levels 1, 2, 3, … For each merge event at level **L ≥ 2**:

  ```
  bonus(L) = floor(10 × (L − 1) × highestMergedTileValue / 4)
  ```

  where `highestMergedTileValue` is the largest resulting tile of that move.
  The level-1 merge never earns a bonus.

  Example: one swipe producing merges into 8, 16, and 32 scores
  base 56 (8+16+32) + bonus 240 (floor(10·1·32/4) + floor(10·2·32/4) = 80+160)
  = **296 points**.

- **Total move score** = (base + chain bonus) × multiplier. Scores are never
  negative.

### Combo streak and Rush Mode

- A valid move containing at least one merge increments the streak; a valid
  move without a merge resets it to 0; invalid moves leave it untouched.
- At **3 consecutive merge moves**, Rush Mode activates for the next **3 valid
  moves** (merging or not). The move that triggers Rush is scored normally.
- While Rush is active, all merge and chain points are **doubled**. Invalid
  moves do not consume Rush moves. The streak is frozen at 0 during Rush, so
  Rush cannot retrigger itself. After the third valid move, Rush expires and
  normal scoring resumes.

### Power-ups

Four powers can be fired instead of a swipe (buttons under the board, or keys
1–4; Esc cancels a targeted power):

| Power   | Effect                                                         |
| ------- | -------------------------------------------------------------- |
| Bomb    | Tap a tile to destroy it.                                      |
| Upgrade | Tap a tile to double it.                                       |
| Shuffle | Scatter every tile to random cells.                            |
| Sweep   | Clear every tile of the smallest value (a bigger one must remain). |

Powers never spawn a tile, score points, or touch the combo / Rush state.

**Economy.** A game starts with 1 Bomb and 1 Upgrade; each power holds at most
3 charges. Every merge adds 1 energy (2 during Rush). The next charge costs
`min(10 + 20 × chargesEarned, 100)` energy - 10, 30, 50, 70, 90, 100, … - and
goes to the power you hold fewest of, so Shuffle and Sweep are introduced by
the first two earns. Values live in `src/game/constants.ts`.

**Rescues.** A power fired while the board is stuck counts as a *rescue*.
Each game allows **3 rescues** (the hearts beside the energy meter); powers
fired while you can still move are always free. When the board is stuck and
the rescues are used up, the game ends even with charges left, and every
unspent charge is cashed in for **+250 points** (shown on the game-over
panel). Saving powers is never wasted, and nobody has to burn charges on a
dead board just to reach game over.

The numbers were tuned with a bot that plays seeded games through the real
reducer (`npx vite-node scripts/simulate-balance.ts [games] [--hoard]`;
`--hoard` models a player who only fires powers as rescues). Over 200 games:

| Rescue limit | Median moves | Endgame drag¹ | Leftover bonus |
| ------------ | ------------ | ------------- | -------------- |
| no powers    | 241          | –             | –              |
| unlimited    | 445          | 187           | –              |
| 2            | 312          | 38            | 11% of score   |
| **3**        | **335**      | **78**        | **8% of score** |
| 4            | 358          | 109           | 6% of score    |

¹ Moves played after the board first got stuck. With unlimited rescues,
almost half the game was spent being dragged back from a dead board; 3
rescues keeps the comeback drama without the endless tail. Charges arrive
first at move ~12, then every ~40 moves early and ~75 late.

### Game over

The board is stuck when it is full and no two horizontally/vertically adjacent
tiles are equal. While charges and rescues remain, a stuck board shows how
many rescues are left and prompts you to fire a power.

Once neither can save the board, the game pauses on a **last chance**: once
per game you may revive it (in the app, by watching a rewarded ad) for +1
rescue (a gold heart) and +1 Bomb, which always frees the board. Declining,
or reaching another dead end after reviving, ends the game and cashes in any
unspent charges. Where no ad can play (web build, offline, no fill) the offer
is skipped and the game ends directly.

### Undo and restart

- **Undo** (one per game) restores the complete state from immediately before
  your last successful move: board, score, streak, Rush state, next tile
  preview, RNG state, and game-over flag. Restarting restores undo
  availability.

## Project structure

```
src/
  game/            Pure game logic (no React, fully unit-tested)
    types.ts         Board, tile, move outcome, state types
    constants.ts     Tunable rules (spawn odds, Rush length, chain formula)
    random.ts        Seeded mulberry32 PRNG with serializable state
    initializeGame.ts New-game creation (two starting 2s + first preview draw)
    moveBoard.ts     Movement/collision resolution for all four directions
    calculateScore.ts Base points, chain bonus, Rush multiplier
    rushMode.ts      Combo streak + Rush Mode state transitions
    gameOver.ts      Legal-move detection / game-over check
    reducer.ts       Immutable engine reducer (move, undo, restart, …)
  hooks/           useGameEngine (state+persistence+sounds+input lock),
                   useSwipeInput, useKeyboardInput, useReducedMotion
  audio/           soundEngine.ts — synthesized Web Audio effects, no assets
  persistence/     storage.ts (never-throwing localStorage facade),
                   saveGame.ts (versioned save + strict validation)
  components/      Header, ScoreBoard, StatusBar, Board, NextTilePreview,
                   Controls, GameOverOverlay, FloatingScores, SwipeHint
  styles/          tokens.css, global.css, hud.css, board.css, overlay.css
  test/            Vitest + React Testing Library suites
scripts/
  generate-icons.mjs  Dependency-free PNG icon generator (node:zlib)
public/            manifest.webmanifest, sw.js, favicon.svg, icons/
```

Game rules live in pure TypeScript modules; React only renders and dispatches.
State transitions are immutable, tiles carry stable ids so CSS transitions
animate movement, and animation timing never influences game logic (a short
input lock only *delays* dispatches; moves can never interleave).

Determinism: every game is driven by a seeded 32-bit PRNG whose state is part
of the game state, so a seed plus a move sequence reproduces a game exactly
(covered by tests).

## Local saves

- Saves live in `localStorage` under `merge-rush.save.v1` in a versioned
  envelope: `{ version, game, stats, prefs }`.
- Persisted: current board/tiles/score, combo + Rush state, RNG state, next
  tile preview, undo snapshot, best score, highest tile, games played, and the
  sound preference.
- On load, an unfinished game (including an undoable game-over state) is
  restored; a finished, undo-less game starts a fresh one.
- Every field is validated before use. Malformed JSON, wrong shapes, invalid
  boards, or an unsupported (future) save version safely fall back: the saved
  game is dropped, but still-valid stats and preferences are kept. If
  `localStorage` is unavailable or throws (private mode, quota), the game runs
  without persistence and never crashes. Only game data is stored — no
  personal information.

## Accessibility and input

- Touch swipes, mouse drags (Pointer Events), arrow keys, and WASD. Diagonal
  gestures without a dominant axis are ignored; a minimum swipe distance
  prevents accidental moves. `touch-action: none` is scoped to the board so
  the rest of the page scrolls normally.
- Gameplay keys are ignored while typing in an input/textarea/contenteditable
  host or while composing text.
- `prefers-reduced-motion` disables slides/pops/floats and shortens the input
  lock; all animations are CSS-only and respect the media query.
- Semantic buttons with labels and visible focus states, an aria-live region
  announces Rush and game over, and the layout respects safe-area insets.

## Performance and lite render mode

The game is tuned to hold 60 fps on low-end Android devices:

- **Compositor-driven animations.** All always-on effects (board rim, energy
  current, scrolling backdrop grid, Rush/armed pulses, high-tier tile glow)
  animate `transform` or `opacity` only. Nothing repaints per frame:
  `background-position`, animated `box-shadow`/`filter`, and the animated
  `@property` conic-gradient were all replaced with pre-rendered layers that
  the compositor moves or fades.
- **Lite render mode** (`useLiteMode`, `styles/lite.css`). Devices with
  ≤ 4 cores or ≤ 3 GB RAM start in lite mode automatically, and any device
  that misses the frame budget during the first seconds of play self-downgrades.
  Lite mode hides the animated starfield/aurora/grid backdrop, removes every
  `backdrop-filter` (glass becomes solid surfaces), stops all ambient loops,
  and skips decorative particles. Gameplay animations — slides, merge pops,
  floating scores — stay, because they are short and compositor-driven.
- **Save debouncing.** `localStorage` writes are synchronous disk I/O; they
  are debounced 250 ms off the interaction frame and flushed synchronously on
  `pagehide`/`visibilitychange`, so progress survives app kills without
  stalling animations.
- **Stable board size.** `--board-size` uses `svh` (with a `dvh` fallback), so
  the board no longer resizes and re-rasterizes when the Android URL bar
  hides or shows mid-swipe.

## Known limitations

- jsdom (unit tests) cannot perform real layout, so responsive sizing is
  verified via pinned CSS guards in tests plus real browser verification at
  390×844 and 1280×800; exotic viewports were not exhaustively tested.
- The service worker requires a secure context (https or localhost) and only
  registers in production web builds; offline support depends on the browser's
  storage policy.
- Sound effects are synthesized (Web Audio); autoplay policies require one
  user gesture before the first sound plays.
- One undo per game by design; there is no move history browser.
- Lite mode is chosen from device hints plus measured frame times; a few
  borderline devices may start in full mode and downgrade a few seconds in.
- The game targets modern evergreen browsers (flex/grid, CSS custom
  properties, Pointer Events, ES2020).
