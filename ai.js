/* ================================================================
FIVE NIGHTS AT LUX VANGUARDS — ai.js
All game logic: AI movement (1-20 system), power drain, timing.
No Three.js dependency — pure vanilla JS logic module.
================================================================ */

‘use strict’;

/* ––––––––––––––––––––––––––––––––
CAMERA NODE DEFINITIONS
Maps camera index → room metadata including which characters
belong there and what position index means “here” for each.
—————————————————————– */
const CAMERAS = [
// index 0
{ id: ‘CAM 1-1’, label: ‘Show Stage’,
benPos: 0, pandaPos: 0, notnoobPos: 0 },
// index 1
{ id: ‘CAM 1-2’, label: ‘Dining Area’,
pandaPos: 1, notnoobPos: 1 },
// index 2 — Pirate Cove: random guy only
{ id: ‘CAM 1-3’, label: ‘Pirate Cove’,
isRandomGuyCam: true },
// index 3
{ id: ‘CAM 2-1’, label: ‘West Hall’,
benPos: 3 },
// index 4 — contains the Lux poster
{ id: ‘CAM 2-2’, label: ‘West Hall Corner’,
benPos: 4, hasLuxPoster: true },
// index 5
{ id: ‘CAM 3-1’, label: ‘East Hall’,
notnoobPos: 4 },
// index 6
{ id: ‘CAM 3-2’, label: ‘East Hall Corner’,
pandaPos: 4, notnoobPos: 5 },
// index 7
{ id: ‘CAM 4-1’, label: ‘Supply Closet’,
benPos: 2 },
// index 8
{ id: ‘CAM 4-2’, label: ‘Backstage’,
benPos: 1, notnoobPos: 2 },
// index 9
{ id: ‘CAM 5-1’, label: ‘Parts/Service’,
notnoobPos: 3 },
];

/* ––––––––––––––––––––––––––––––––
GAME STATE  (single source of truth)
—————————————————————– */
const GameState = {
/* — Timing — */
nightStart:          null,
NIGHT_DURATION_MS:   360000,  // 6 real seconds per hour × 60 real seconds = 6 min
currentHour:         12,      // display hour (12 AM = start)

/* — Power — */
power:               100.0,
isPowerOut:          false,

/* — Active devices (each = 1 usage bar) — */
cameraUp:            false,
leftDoorClosed:      false,
rightDoorClosed:     false,
leftLightOn:         false,
rightLightOn:        false,

/* — AI levels (1-20). Overwritten by initGame() per night. — */
aiLevels: {
ben:       1,
panda:     0,
notnoob:   0,
randomGuy: 1,
lux:       0,
},

/* — AI positions —
ben      path: 0=ShowStage → 1=Backstage → 2=SupplyCloset → 3=WestHall
→ 4=WestHallCorner → 5=LeftDoor (ATTACK)
panda    path: 0=ShowStage → 1=DiningArea → 2=Restrooms  → 3=Kitchen
→ 4=EastHallCorner → 5=RightDoor (ATTACK)
notnoob  path: 0=ShowStage → 1=DiningArea → 2=Backstage  → 3=Parts/Service
→ 4=EastHall → 5=EastHallCorner → 6=RightDoor (ATTACK)
randomGuy: phase 0-3 in Pirate Cove; phase 4 = sprint
lux: -1=absent, 0=inOffice
–––––––––––––––––––––––––––––––– */
benPos:              0,
pandaPos:            0,
notnoobPos:          0,
randomGuyPhase:      0,
luxState:           -1,  // -1 = not present

/* — random guy sprint — */
randomGuyRunning:    false,
randomGuyRunStart:   null,
RANDOM_GUY_SPRINT_MS: 2500,   // player has 2.5 s to close left door

/* — Lux — */
luxAppearTime:       null,
LUX_APPEAR_WINDOW_MS: 2000,
luxPosterViewed:     false,   // set when viewing CAM 2-2; consumed on camera drop

/* — Camera state — */
currentCam:          0,

/* — Movement timers — */
lastBenMove:         0,
lastPandaMove:       0,
lastNotnoobMove:     0,
lastRandomGuyTick:   0,
lastPirateCoveCheck: 0,

/* — Movement intervals (ms) — */
BEN_INTERVAL:        4970,
PANDA_INTERVAL:      4980,
NOTNOOB_INTERVAL:    5010,
RANDOM_GUY_INTERVAL: 5000,

/* — Pirate Cove: max gap before random guy advances freely — */
PIRATE_COVE_MAX_GAP_MS: 12000,

/* — Status flags — */
gameRunning:         false,
gameOver:            false,
night:               1,

/* — Callbacks injected by game.js — */
onJumpscare:         null,  // fn(charName)
onPowerOut:          null,  // fn()
onLuxAppear:         null,  // fn()
onLuxDisappear:      null,  // fn()
onLuxCrash:          null,  // fn()
onRandomGuySprint:   null,  // fn()
onRandomGuyBlocked:  null,  // fn()
onWin:               null,  // fn()
onPositionsChanged:  null,  // fn() — called after any AI move
};

/* ––––––––––––––––––––––––––––––––
NIGHT DIFFICULTY TABLE
Index 0 = Night 1 … Index 5 = Night 6
—————————————————————– */
const NIGHT_CONFIGS = [
{ ben: 1,  panda: 0,  notnoob: 0,  randomGuy: 1,  lux: 0 }, // N1
{ ben: 3,  panda: 1,  notnoob: 1,  randomGuy: 2,  lux: 0 }, // N2
{ ben: 5,  panda: 3,  notnoob: 2,  randomGuy: 5,  lux: 0 }, // N3
{ ben: 9,  panda: 7,  notnoob: 4,  randomGuy: 10, lux: 0 }, // N4
{ ben: 10, panda: 10, notnoob: 7,  randomGuy: 16, lux: 0 }, // N5
{ ben: 20, panda: 15, notnoob: 10, randomGuy: 20, lux: 1 }, // N6
];

/* ================================================================
CORE MATH HELPERS
================================================================ */

/**

- Standard 1-20 AI roll.
- Returns true if the character should move.
- @param {number} level  AI level 1-20
  */
  function aiRoll(level) {
  if (level <= 0) return false;
  const roll = Math.floor(Math.random() * 20) + 1;  // 1..20
  return roll <= level;
  }

/**

- Calculate current power drain in % per second.
- Base: 0.15%/s. Each usage bar adds according to the stepped table.
- 0 bars → 0.15  (office lights only)
- 1 bar  → 0.35
- 2 bars → 0.60
- 3 bars → 1.00
- 4 bars → 1.50
- 5 bars → 2.00
  */
  function getPowerDrainPerSecond() {
  const DRAIN_TABLE = [0.15, 0.35, 0.60, 1.00, 1.50, 2.00];
  const bars = getUsageBars();
  return DRAIN_TABLE[Math.min(bars, DRAIN_TABLE.length - 1)];
  }

/** Count active usage bars (0-5). */
function getUsageBars() {
let bars = 0;
if (GameState.cameraUp)       bars++;
if (GameState.leftDoorClosed) bars++;
if (GameState.rightDoorClosed)bars++;
if (GameState.leftLightOn)    bars++;
if (GameState.rightLightOn)   bars++;
return bars;
}

/** Drain power by deltaSeconds. Triggers power-out if reaches 0. */
function drainPower(deltaSeconds) {
if (GameState.isPowerOut || GameState.gameOver) return;
const drain = getPowerDrainPerSecond() * deltaSeconds;
GameState.power = Math.max(0, GameState.power - drain);
if (GameState.power <= 0) _triggerPowerOut();
}

/* ================================================================
TIME
================================================================ */

/**

- Call every real-time second from game loop.
- Maps elapsed ms → in-game hour.
- 0   ms → 12 AM
- 60s  → 1 AM
- 120s → 2 AM  …  360s → 6 AM (win)
  */
  function updateTime() {
  if (!GameState.nightStart || GameState.gameOver) return;
  const elapsed = Date.now() - GameState.nightStart;
  // hour 0-5 maps to “12 AM – 5 AM”; at hour 6 we win
  const hourIndex = Math.floor(elapsed / 60000); // 0..5
  GameState.currentHour = hourIndex;
  if (elapsed >= GameState.NIGHT_DURATION_MS) {
  _winGame();
  }
  }

/** Returns a human-readable clock string, e.g. “3 AM”. */
function getClockString() {
const h = GameState.currentHour; // 0..5
const display = h === 0 ? 12 : h;
return `${display} AM`;
}

/* ================================================================
AI MOVEMENT — BEN (BONNIE)
Path: 0 Show Stage → 1 Backstage → 2 Supply Closet →
3 West Hall → 4 West Hall Corner → 5 LEFT DOOR
================================================================ */
function _moveBen() {
if (!aiRoll(GameState.aiLevels.ben)) return;
if (GameState.benPos < 5) {
GameState.benPos++;
_log(‘BEN’, `→ position ${GameState.benPos}`);
if (GameState.onPositionsChanged) GameState.onPositionsChanged();
}
if (GameState.benPos >= 5) _tryAttack(‘left’, ‘ben’);
}

/* ================================================================
AI MOVEMENT — PANDA (CHICA)
Path: 0 Show Stage → 1 Dining Area → 2 Restrooms →
3 Kitchen → 4 East Hall Corner → 5 RIGHT DOOR
================================================================ */
function _movePanda() {
if (!aiRoll(GameState.aiLevels.panda)) return;
if (GameState.pandaPos < 5) {
GameState.pandaPos++;
_log(‘PANDA’, `→ position ${GameState.pandaPos}`);
if (GameState.onPositionsChanged) GameState.onPositionsChanged();
}
if (GameState.pandaPos >= 5) _tryAttack(‘right’, ‘panda’);
}

/* ================================================================
AI MOVEMENT — NOTNOOB (FREDDY)
Path: 0 Show Stage → 1 Dining → 2 Backstage → 3 Parts/Service
→ 4 East Hall → 5 East Hall Corner → 6 RIGHT DOOR
Special: only moves when camera is NOT on him.
Appears dark/hidden on cameras.
================================================================ */
function _moveNotnoob() {
// Is camera currently watching notnoob’s position?
if (GameState.cameraUp && _isNotnoobWatched()) {
_log(‘NOTNOOB’, ‘being watched — frozen’);
return;
}
if (!aiRoll(GameState.aiLevels.notnoob)) return;
if (GameState.notnoobPos < 6) {
GameState.notnoobPos++;
_log(‘NOTNOOB’, `→ position ${GameState.notnoobPos}`);
if (GameState.onPositionsChanged) GameState.onPositionsChanged();
}
if (GameState.notnoobPos >= 6) _tryAttack(‘right’, ‘notnoob’);
}

/** Returns true if the active camera can see notnoob’s current position node. */
function _isNotnoobWatched() {
const cam = CAMERAS[GameState.currentCam];
if (!cam) return false;
// Check if this camera’s notnoobPos matches current position
return (cam.notnoobPos !== undefined && cam.notnoobPos === GameState.notnoobPos);
}

/* ================================================================
AI MOVEMENT — RANDOM GUY (FOXY)
Phase system: 0 → 1 → 2 → 3 in Pirate Cove → SPRINT
Advances faster the less often the player checks CAM 1-3.
Phase 4 = sprinting; player has RANDOM_GUY_SPRINT_MS to close left door.
================================================================ */
function _tickRandomGuy(now) {
if (GameState.aiLevels.randomGuy <= 0) return;

// — Handle active sprint —
if (GameState.randomGuyRunning) {
const elapsed = now - GameState.randomGuyRunStart;
if (elapsed >= GameState.RANDOM_GUY_SPRINT_MS) {
if (!GameState.leftDoorClosed) {
_log(‘RANDOM GUY’, ‘SPRINT EXPIRED — door open — JUMPSCARE!’);
_triggerJumpscare(‘randomGuy’);
} else {
// Door was closed in time — penalty + reset
_log(‘RANDOM GUY’, ‘blocked by door — power penalty’);
GameState.power = Math.max(0, GameState.power - 6);
GameState.randomGuyPhase = 0;
GameState.randomGuyRunning = false;
GameState.lastPirateCoveCheck = now;
if (GameState.onRandomGuyBlocked) GameState.onRandomGuyBlocked();
if (GameState.onPositionsChanged) GameState.onPositionsChanged();
}
}
return; // don’t process phase ticks while sprinting
}

if (GameState.randomGuyPhase >= 4) return; // already sprinting

// — Phase advancement tick —
if (now - GameState.lastRandomGuyTick < GameState.RANDOM_GUY_INTERVAL) return;
GameState.lastRandomGuyTick = now;

// Probability scales with how long since Pirate Cove was last checked
const gap      = now - GameState.lastPirateCoveCheck;  // ms since last check
const ratio    = Math.min(3.0, gap / GameState.PIRATE_COVE_MAX_GAP_MS);
const chance   = (GameState.aiLevels.randomGuy / 20) * ratio;

if (Math.random() < chance) {
GameState.randomGuyPhase++;
_log(‘RANDOM GUY’, `phase → ${GameState.randomGuyPhase}`);

```
if (GameState.randomGuyPhase >= 4) {
  // SPRINT!
  GameState.randomGuyRunning  = true;
  GameState.randomGuyRunStart = now;
  _log('RANDOM GUY', 'SPRINTING DOWN LEFT HALL!');
  if (GameState.onRandomGuySprint) GameState.onRandomGuySprint();
}

if (GameState.onPositionsChanged) GameState.onPositionsChanged();
```

}
}

/* ================================================================
AI — LUX (GOLDEN FREDDY)
1 % chance to appear when dropping camera after viewing CAM 2-2.
Player has LUX_APPEAR_WINDOW_MS to raise camera again.
================================================================ */

/** Called immediately when the player drops the monitor. */
function onCameraClose() {
// Consume the poster flag — only triggers the roll on this drop event
const posterWasSeen = GameState.luxPosterViewed;
GameState.luxPosterViewed = false;

if (posterWasSeen && GameState.luxState === -1) {
// 1% probability roll
if (Math.random() < 0.01) {
_log(‘LUX’, ‘Appearing in office!’);
GameState.luxState     = 0;
GameState.luxAppearTime = Date.now();
if (GameState.onLuxAppear) GameState.onLuxAppear();
}
}
}

/** Called when the player raises the monitor. */
function onCameraOpen() {
if (GameState.luxState === 0) {
_log(‘LUX’, ‘Camera raised in time — Lux disappears’);
GameState.luxState = -1;
if (GameState.onLuxDisappear) GameState.onLuxDisappear();
}
}

/** Called every frame while Lux may be present. */
function _tickLux(now) {
if (GameState.luxState !== 0) return;
const elapsed = now - GameState.luxAppearTime;
if (elapsed >= GameState.LUX_APPEAR_WINDOW_MS) {
_log(‘LUX’, ‘Timer expired — CRASH’);
_triggerLuxCrash();
}
}

/* ================================================================
DOOR ATTACKS
================================================================ */
function _tryAttack(side, who) {
const doorClosed = side === ‘left’
? GameState.leftDoorClosed
: GameState.rightDoorClosed;

if (doorClosed) {
_log(who.toUpperCase(), `${side} door closed — blocked`);
// Character stays at door position — will attack again on next interval
return;
}
_log(who.toUpperCase(), `${side} door OPEN — JUMPSCARE!`);
_triggerJumpscare(who);
}

/* ================================================================
EVENT TRIGGERS
================================================================ */
function _triggerJumpscare(who) {
if (GameState.gameOver) return;
GameState.gameOver    = true;
GameState.gameRunning = false;
_log(‘GAME’, `Jumpscare: ${who}`);
if (GameState.onJumpscare) GameState.onJumpscare(who);
}

function _triggerPowerOut() {
if (GameState.isPowerOut) return;
GameState.isPowerOut = true;
GameState.cameraUp   = false;
_log(‘POWER’, ‘OUTAGE — lights out’);
if (GameState.onPowerOut) GameState.onPowerOut();
// notnoob music plays; after 10-20 s he jumpscares
const delay = 10000 + Math.random() * 10000;
setTimeout(() => {
if (!GameState.gameOver) _triggerJumpscare(‘notnoob’);
}, delay);
}

function _triggerLuxCrash() {
if (GameState.gameOver) return;
GameState.gameOver    = true;
GameState.gameRunning = false;
if (GameState.onLuxCrash) GameState.onLuxCrash();
}

function _winGame() {
if (GameState.gameOver) return;
GameState.gameOver    = true;
GameState.gameRunning = false;
_log(‘GAME’, ‘6 AM — survived!’);
if (GameState.onWin) GameState.onWin();
}

/* ================================================================
CAMERA INTERACTIONS (called by game.js on tab/click)
================================================================ */

/** Called each time the player switches to a camera feed. */
function onCameraSwitch(camIndex) {
GameState.currentCam = camIndex;
const cam = CAMERAS[camIndex];
if (!cam) return;

if (cam.isRandomGuyCam) {
GameState.lastPirateCoveCheck = Date.now();
_log(‘RANDOM GUY’, `Pirate Cove checked — phase: ${GameState.randomGuyPhase}`);
}

if (cam.hasLuxPoster) {
GameState.luxPosterViewed = true;
_log(‘LUX’, ‘poster viewed’);
}
}

/* ================================================================
MAIN AI UPDATE TICK  (called from game.js game loop)
Pass deltaSeconds for power drain; now = Date.now() for timers.
================================================================ */
function aiUpdate(now, deltaSeconds) {
if (!GameState.gameRunning || GameState.gameOver) return;

// Power drain
drainPower(deltaSeconds);

// Time update (do this every frame; won’t spam — updateTime is cheap)
updateTime();

// Ben
if (now - GameState.lastBenMove >= GameState.BEN_INTERVAL) {
GameState.lastBenMove = now;
_moveBen();
}

// Panda
if (now - GameState.lastPandaMove >= GameState.PANDA_INTERVAL) {
GameState.lastPandaMove = now;
_movePanda();
}

// notnoob
if (now - GameState.lastNotnoobMove >= GameState.NOTNOOB_INTERVAL) {
GameState.lastNotnoobMove = now;
_moveNotnoob();
}

// random guy
_tickRandomGuy(now);

// Lux timeout
_tickLux(now);
}

/* ================================================================
INIT — reset all state for a new night
================================================================ */
function initGame(night) {
const n = night || 1;
const cfg = NIGHT_CONFIGS[Math.min(n - 1, NIGHT_CONFIGS.length - 1)];
const now = Date.now();

Object.assign(GameState, {
night:               n,
nightStart:          now,
power:               100.0,
isPowerOut:          false,
cameraUp:            false,
leftDoorClosed:      false,
rightDoorClosed:     false,
leftLightOn:         false,
rightLightOn:        false,
aiLevels:            { …cfg },
benPos:              0,
pandaPos:            0,
notnoobPos:          0,
randomGuyPhase:      0,
randomGuyRunning:    false,
randomGuyRunStart:   null,
luxState:           -1,
luxAppearTime:       null,
luxPosterViewed:     false,
currentCam:          0,
lastBenMove:         now,
lastPandaMove:       now,
lastNotnoobMove:     now,
lastRandomGuyTick:   now,
lastPirateCoveCheck: now,
currentHour:         0,
gameRunning:         true,
gameOver:            false,
});

_log(‘INIT’, `Night ${n} | AI: ben=${cfg.ben} panda=${cfg.panda} notnoob=${cfg.notnoob} randomGuy=${cfg.randomGuy} lux=${cfg.lux}`);
}

/* ================================================================
HELPERS
================================================================ */
function _log(tag, msg) {
console.log(`[${tag}] ${msg}`);
}

/**

- Returns an object describing what each character’s current position
- maps to (for Three.js scene placement).
- game.js reads this to position the placeholder cubes.
  */
  function getCharPositionData() {
  return {
  ben:       GameState.benPos,
  panda:     GameState.pandaPos,
  notnoob:   GameState.notnoobPos,
  randomGuy: GameState.randomGuyPhase,
  lux:       GameState.luxState,
  };
  }

/**

- Returns what should be shown on the current camera feed.
- Used by game.js to position the Three.js camera + update cam label.
  */
  function getCamVisibilityInfo(camIndex) {
  const cam   = CAMERAS[camIndex];
  const chars = [];
  if (!cam) return { cam, chars };

const s = GameState;

// Ben
if (cam.benPos !== undefined && cam.benPos === s.benPos) {
chars.push({ id: ‘ben’, label: ‘BEN’, dim: false });
}
// Panda
if (cam.pandaPos !== undefined && cam.pandaPos === s.pandaPos) {
chars.push({ id: ‘panda’, label: ‘PANDA’, dim: false });
}
// notnoob — intentionally harder to see (dim: true)
if (cam.notnoobPos !== undefined && cam.notnoobPos === s.notnoobPos) {
chars.push({ id: ‘notnoob’, label: ‘???’, dim: true });
}
// random guy — show phase on pirate cove cam
if (cam.isRandomGuyCam) {
const phaseLabel = [‘IN COVE’, ‘PEERING’, ‘STANDING’, ‘AT EXIT’, ‘—’][Math.min(s.randomGuyPhase, 4)];
chars.push({ id: ‘randomGuy’, label: `R.GUY: ${phaseLabel}`, dim: false });
}

return { cam, chars };
}

/* ================================================================
PUBLIC API  (exposed on window.GameLogic)
================================================================ */
window.GameLogic = {
// State (read-only from game.js; modify only via the functions below)
GameState,
CAMERAS,

// Init
initGame,

// Core tick (called every animation frame)
aiUpdate,

// Time helpers
updateTime,
getClockString,

// Power
getPowerDrainPerSecond,
getUsageBars,

// Camera interactions
onCameraSwitch,
onCameraOpen,
onCameraClose,

// Diagnostics
getCharPositionData,
getCamVisibilityInfo,
};
