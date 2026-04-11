/* ================================================================
FIVE NIGHTS AT LUX VANGUARDS — game.js
Three.js scene setup, rendering loop, input handling, UI layer.
Requires: Three.js r128 (CDN), ai.js loaded first.
================================================================ */

‘use strict’;

/* ================================================================
SCENE CONSTANTS  (metres — adjust to taste)
================================================================ */
const SCENE = {
// Office dimensions
OFFICE_W:  10,
OFFICE_H:   4,
OFFICE_D:  12,

// Player camera sits here in office view
PLAYER_POS:   new THREE.Vector3(0, 1.6, 4.5),

// Max horizontal pan from center (radians)
PAN_MAX:      Math.PI / 2.5,  // ~72 degrees total (±36°)

// Camera FOV
FOV: 75,
};

/* ================================================================
3D POSITIONS for each AI node
Used to place the coloured-cube placeholders in the Three.js scene
and to position security cameras.

REPLACE: swap out the placeholder geometry for loaded .glTF models.
================================================================ */
const NODE_POSITIONS = {
// Ben path nodes (world coords)
ben: [
new THREE.Vector3(  0,  0, -14 ),   // 0 Show Stage (centre-back)
new THREE.Vector3( -3,  0, -14 ),   // 1 Backstage
new THREE.Vector3( -4,  0, -10 ),   // 2 Supply Closet
new THREE.Vector3( -5,  0,  -4 ),   // 3 West Hall
new THREE.Vector3( -5,  0,   0 ),   // 4 West Hall Corner
new THREE.Vector3( -5,  0,   3.5),  // 5 Left Door (attack pos)
],
// Panda path nodes
panda: [
new THREE.Vector3(  2,  0, -14 ),   // 0 Show Stage (right side)
new THREE.Vector3(  3,  0, -10 ),   // 1 Dining Area
new THREE.Vector3(  4,  0,  -7 ),   // 2 Restrooms
new THREE.Vector3(  5,  0,  -4 ),   // 3 Kitchen
new THREE.Vector3(  5,  0,   0 ),   // 4 East Hall Corner
new THREE.Vector3(  5,  0,   3.5),  // 5 Right Door (attack pos)
],
// notnoob path nodes
notnoob: [
new THREE.Vector3(  1,  0, -14 ),   // 0 Show Stage
new THREE.Vector3(  3,  0, -10 ),   // 1 Dining Area
new THREE.Vector3( -3,  0, -14 ),   // 2 Backstage
new THREE.Vector3(  4,  0, -12 ),   // 3 Parts/Service
new THREE.Vector3(  5,  0,  -4 ),   // 4 East Hall
new THREE.Vector3(  5,  0,   0 ),   // 5 East Hall Corner
new THREE.Vector3(  5,  0,   3.5),  // 6 Right Door (attack pos)
],
// random guy phase positions (Pirate Cove area, left side)
randomGuy: [
new THREE.Vector3( -7,  0, -12 ),   // phase 0 — hidden in cove
new THREE.Vector3( -7,  0, -10 ),   // phase 1 — peeking
new THREE.Vector3( -6,  0,  -7 ),   // phase 2 — standing
new THREE.Vector3( -5,  0,  -3 ),   // phase 3 — at cove exit
new THREE.Vector3( -5,  0,   2 ),   // phase 4 — sprinting (near left door)
],
// Lux appears at centre of office
lux: new THREE.Vector3( 0, 1, 2 ),
};

/* ================================================================
SECURITY CAMERA VIEWPOINTS
Each entry maps to a CAMERAS[] index in ai.js.
The Three.js PerspectiveCamera is moved here when viewing that feed.
================================================================ */
const CAM_VIEWPOINTS = [
// CAM 0: Show Stage (looking at back of room)
{ pos: new THREE.Vector3(  0,  2, -10), target: new THREE.Vector3(  0,  1, -15) },
// CAM 1: Dining Area
{ pos: new THREE.Vector3(  3,  2,  -8), target: new THREE.Vector3(  3,  1, -12) },
// CAM 2: Pirate Cove
{ pos: new THREE.Vector3( -7,  2,  -8), target: new THREE.Vector3( -7,  1, -14) },
// CAM 3: West Hall
{ pos: new THREE.Vector3( -5,  2,  -1), target: new THREE.Vector3( -5,  1,  -6) },
// CAM 4: West Hall Corner
{ pos: new THREE.Vector3( -5,  2,   2), target: new THREE.Vector3( -5,  1,  -2) },
// CAM 5: East Hall
{ pos: new THREE.Vector3(  5,  2,  -1), target: new THREE.Vector3(  5,  1,  -6) },
// CAM 6: East Hall Corner
{ pos: new THREE.Vector3(  5,  2,   2), target: new THREE.Vector3(  5,  1,  -2) },
// CAM 7: Supply Closet
{ pos: new THREE.Vector3( -4,  2,  -9), target: new THREE.Vector3( -4,  1, -12) },
// CAM 8: Backstage
{ pos: new THREE.Vector3( -3,  2, -12), target: new THREE.Vector3( -3,  1, -16) },
// CAM 9: Parts/Service
{ pos: new THREE.Vector3(  4,  2, -11), target: new THREE.Vector3(  4,  1, -15) },
];

/* ================================================================
THREE.JS GLOBALS
================================================================ */
let renderer, scene, camera;
let leftDoorMesh, rightDoorMesh;
let leftLightSpot, rightLightSpot, officeLights;
let charMeshes = {};      // id → THREE.Mesh (placeholder cubes)
let luxMesh;
let doorAnims = { left: null, right: null }; // animation targets

// Office view pan state
let panYaw       = 0;     // current horizontal rotation (radians)
let panTarget    = 0;     // target (smoothly lerped)
let isTouching   = false;
let touchStartX  = 0;
let touchLastX   = 0;
let isMouseDown  = false;
let mouseLastX   = 0;

// Game loop timing
let lastFrameMs  = 0;
let clockSecAccum = 0;    // accumulates seconds for clock updates

// UI clock update throttle
let lastClockUpdate = 0;

/* ================================================================
BUILD THREE.JS SCENE
================================================================ */
function buildScene() {
scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);
scene.fog = new THREE.Fog(0x050505, 8, 28);

_buildOffice();
_buildHallways();
_buildStage();
_buildPirateCove();
_buildCharPlaceholders();
_buildDoors();
_buildLighting();
}

/* –– Office room –– */
function _buildOffice() {
const mat = {
floor:   new THREE.MeshLambertMaterial({ color: 0x1a1208 }),
ceiling: new THREE.MeshLambertMaterial({ color: 0x111111 }),
wall:    new THREE.MeshLambertMaterial({ color: 0x1c1c1c }),
desk:    new THREE.MeshLambertMaterial({ color: 0x2a1a08 }),
};

const W = SCENE.OFFICE_W, H = SCENE.OFFICE_H, D = SCENE.OFFICE_D;

// Floor
_addBox(W, 0.1, D, 0, -0.05, 0, mat.floor);
// Ceiling
_addBox(W, 0.1, D, 0, H, 0, mat.ceiling);
// Back wall
_addBox(W, H, 0.2, 0, H/2, -D/2, mat.wall);
// Left wall (solid upper + lower, gap for door)
_addBox(0.2, H/2 - 0.5, D, -W/2, H/4, 0, mat.wall);
_addBox(0.2, 0.3,        D, -W/2, H - 0.15, 0, mat.wall);
// Right wall
_addBox(0.2, H/2 - 0.5, D, W/2,  H/4, 0, mat.wall);
_addBox(0.2, 0.3,        D, W/2,  H - 0.15, 0, mat.wall);

// Desk (placeholder) — REPLACE with desk.glb
_addBox(3, 0.7, 1.2, 0, 0.35, 3.8, mat.desk);
// Desk top surface
_addBox(3.2, 0.08, 1.3, 0, 0.72, 3.8, mat.desk);
}

/* –– Left & right hallways –– */
function _buildHallways() {
const wallMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
const floorMat = new THREE.MeshLambertMaterial({ color: 0x0d0d0d });

// Left hallway — extends from -5 to the left
_addBox(4, 3, 0.2,  -7, 1.5, 3.2, wallMat);   // back wall
_addBox(0.2, 3, 6,  -9, 1.5, 0,   wallMat);   // far wall
_addBox(4, 0.1, 6,  -7, 0,   0,   floorMat);  // floor
_addBox(4, 0.1, 6,  -7, 3,   0,   wallMat);   // ceiling

// Right hallway
_addBox(4, 3, 0.2,   7, 1.5, 3.2, wallMat);
_addBox(0.2, 3, 6,   9, 1.5, 0,   wallMat);
_addBox(4, 0.1, 6,   7, 0,   0,   floorMat);
_addBox(4, 0.1, 6,   7, 3,   0,   wallMat);

// Back corridor (connects to stage area)
const corrMat = new THREE.MeshLambertMaterial({ color: 0x0f0f0f });
_addBox(12, 0.1, 10,  0, 0,   -9, corrMat);  // floor
_addBox(12, 0.1, 10,  0, 3.5, -9, corrMat);  // ceiling
_addBox(0.2, 3.5, 10, -6, 1.75, -9, corrMat);
_addBox(0.2, 3.5, 10,  6, 1.75, -9, corrMat);
}

/* –– Show stage –– */
function _buildStage() {
const stageMat  = new THREE.MeshLambertMaterial({ color: 0x220a0a });
const curtainMat = new THREE.MeshLambertMaterial({ color: 0x4a0a0a });

// Stage platform
_addBox(8, 0.4, 4, 0, 0.2, -14, stageMat);
// Left curtain
_addBox(0.2, 3.5, 4, -4, 1.75, -14, curtainMat);
// Right curtain
_addBox(0.2, 3.5, 4,  4, 1.75, -14, curtainMat);

// Lux poster on west hall corner wall (CAM 2-2)
const posterMat = new THREE.MeshBasicMaterial({ color: 0xcccc00 });
const poster = _addBox(0.8, 1.2, 0.05, -4.9, 2, 0.5, posterMat);
poster.userData.isLuxPoster = true;
}

/* –– Pirate Cove –– */
function _buildPirateCove() {
const curtainMat = new THREE.MeshLambertMaterial({ color: 0x0a2244 });
const signMat    = new THREE.MeshBasicMaterial({ color: 0x003366 });

// Cove enclosure
_addBox(4, 3.5, 0.2,  -7, 1.75, -13,  curtainMat);
_addBox(4, 3.5, 4,    -9, 1.75, -11,  curtainMat);
_addBox(0.2, 3.5, 4,  -7, 1.75, -11,  curtainMat);

// “PIRATE COVE” sign placeholder
_addBox(2, 0.5, 0.1,  -7, 3.2, -12.9, signMat);
}

/* –– Character placeholder cubes ––
REPLACE: Load your .glTF models here using THREE.GLTFLoader.
Each character needs an update function to set position/visibility.

Color guide:
ben       → purple  (Bonnie)
panda     → orange  (Chica)
notnoob   → blue    (Freddy) — slightly transparent to simulate hiding
randomGuy → green   (Foxy)
lux       → gold    (Golden Freddy)
—————————————————————– */
function _buildCharPlaceholders() {
const MATS = {
ben:       new THREE.MeshLambertMaterial({ color: 0x5500aa }),
panda:     new THREE.MeshLambertMaterial({ color: 0xcc5500 }),
notnoob:   new THREE.MeshLambertMaterial({ color: 0x0033aa, transparent: true, opacity: 0.6 }),
randomGuy: new THREE.MeshLambertMaterial({ color: 0x005500 }),
lux:       new THREE.MeshLambertMaterial({ color: 0xdddd00, transparent: true, opacity: 0.85 }),
};

// Body geometry — 0.6w × 1.5h × 0.4d
const bodyGeo  = new THREE.BoxGeometry(0.6, 1.5, 0.4);
// Head geometry — 0.5 cube
const headGeo  = new THREE.BoxGeometry(0.5, 0.5, 0.5);

function makeCharMesh(mat) {
const group = new THREE.Group();
const body  = new THREE.Mesh(bodyGeo, mat);
body.position.y = 0.75;
const head  = new THREE.Mesh(headGeo, mat);
head.position.y = 1.75;
group.add(body, head);
/* REPLACE ABOVE with:
const loader = new THREE.GLTFLoader();
loader.load(‘assets/models/ben.glb’, (gltf) => {
group.add(gltf.scene);
});
*/
scene.add(group);
return group;
}

charMeshes.ben       = makeCharMesh(MATS.ben);
charMeshes.panda     = makeCharMesh(MATS.panda);
charMeshes.notnoob   = makeCharMesh(MATS.notnoob);
charMeshes.randomGuy = makeCharMesh(MATS.randomGuy);

// Lux — slightly larger + gold
const luxGeo = new THREE.BoxGeometry(0.8, 2, 0.6);
luxMesh = new THREE.Group();
const luxBody = new THREE.Mesh(luxGeo, MATS.lux);
luxBody.position.y = 1;
luxMesh.add(luxBody);
luxMesh.visible = false;
scene.add(luxMesh);
}

/* –– Door meshes –– */
function _buildDoors() {
const doorMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
const openMat = new THREE.MeshLambertMaterial({ color: 0x0a0a0a });

// Left door — sits in the left doorway
// Closed: slides down from ceiling. Open: raised up (invisible above doorframe).
const doorGeo = new THREE.BoxGeometry(1.6, 3, 0.2);

leftDoorMesh = new THREE.Mesh(doorGeo, doorMat);
leftDoorMesh.position.set(-4.2, -2, 3.0); // starts ABOVE the frame (open)
scene.add(leftDoorMesh);

rightDoorMesh = new THREE.Mesh(doorGeo, doorMat);
rightDoorMesh.position.set(4.2, -2, 3.0);
scene.add(rightDoorMesh);
}

/* –– Lighting –– */
function _buildLighting() {
// Ambient (dim office)
const ambient = new THREE.AmbientLight(0x111111, 0.8);
scene.add(ambient);

// Main office overhead (dim)
const overhead = new THREE.PointLight(0x442200, 0.6, 12);
overhead.position.set(0, 3.5, 1);
scene.add(overhead);

// Left hallway spot (off by default — lights toggle it)
leftLightSpot = new THREE.SpotLight(0xffeeaa, 0, 8, Math.PI / 6, 0.3);
leftLightSpot.position.set(-4.2, 3, 2);
leftLightSpot.target.position.set(-5, 0, -2);
scene.add(leftLightSpot);
scene.add(leftLightSpot.target);

// Right hallway spot
rightLightSpot = new THREE.SpotLight(0xffeeaa, 0, 8, Math.PI / 6, 0.3);
rightLightSpot.position.set(4.2, 3, 2);
rightLightSpot.target.position.set(5, 0, -2);
scene.add(rightLightSpot);
scene.add(rightLightSpot.target);

// Stage area light (always dim red)
const stageLight = new THREE.PointLight(0x330000, 1.2, 10);
stageLight.position.set(0, 3, -13);
scene.add(stageLight);

// Keep a reference for power-out
officeLights = [overhead, ambient];
}

/* ================================================================
THREE.JS RENDERER & CAMERA SETUP
================================================================ */
function initRenderer() {
renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = false; // keep mobile perf high

document.getElementById(‘canvas-container’).appendChild(renderer.domElement);

camera = new THREE.PerspectiveCamera(SCENE.FOV, window.innerWidth / window.innerHeight, 0.1, 60);
_resetOfficeCamera();

window.addEventListener(‘resize’, _onResize);
}

function _resetOfficeCamera() {
camera.position.copy(SCENE.PLAYER_POS);
panYaw    = 0;
panTarget = 0;
_applyPan();
}

function _applyPan() {
camera.rotation.order = ‘YXZ’;
camera.rotation.y = panYaw;
camera.rotation.x = 0;
}

function _onResize() {
camera.aspect = window.innerWidth / window.innerHeight;
camera.updateProjectionMatrix();
renderer.setSize(window.innerWidth, window.innerHeight);
}

/* ================================================================
SCENE UPDATE PER FRAME
================================================================ */
function updateScene(deltaSeconds) {
if (!window.GameLogic) return;
const GS = GameLogic.GameState;

// Smooth pan lerp
panYaw = THREE.MathUtils.lerp(panYaw, panTarget, Math.min(1, deltaSeconds * 10));
if (!GS.cameraUp) _applyPan();

// Animate doors
_animateDoor(‘left’,  leftDoorMesh,  GS.leftDoorClosed);
_animateDoor(‘right’, rightDoorMesh, GS.rightDoorClosed);

// Hallway lights
leftLightSpot.intensity  = GS.leftLightOn  ? 1.8 : 0;
rightLightSpot.intensity = GS.rightLightOn ? 1.8 : 0;

// Update character mesh positions
_updateCharMeshes();
}

/* Door slide animation — closed = y:1.5 (down), open = y:-2 (up/hidden) */
function _animateDoor(side, mesh, shouldBeClosed) {
const TARGET_Y = shouldBeClosed ? 1.5 : -2.0;
mesh.position.y = THREE.MathUtils.lerp(mesh.position.y, TARGET_Y, 0.15);
}

function _updateCharMeshes() {
const GS = GameLogic.GameState;

// Ben
if (GS.benPos < NODE_POSITIONS.ben.length) {
charMeshes.ben.position.copy(NODE_POSITIONS.ben[GS.benPos]);
charMeshes.ben.visible = true;
}

// Panda
if (GS.pandaPos < NODE_POSITIONS.panda.length) {
charMeshes.panda.position.copy(NODE_POSITIONS.panda[GS.pandaPos]);
charMeshes.panda.visible = true;
}

// notnoob — slightly harder to see (lower opacity on material; handled at build time)
if (GS.notnoobPos < NODE_POSITIONS.notnoob.length) {
charMeshes.notnoob.position.copy(NODE_POSITIONS.notnoob[GS.notnoobPos]);
charMeshes.notnoob.visible = true;
}

// random guy — only visible on relevant cameras; hidden from office view
const rgPos = Math.min(GS.randomGuyPhase, NODE_POSITIONS.randomGuy.length - 1);
charMeshes.randomGuy.position.copy(NODE_POSITIONS.randomGuy[rgPos]);
charMeshes.randomGuy.visible = (GS.randomGuyPhase < 4);

// Lux
luxMesh.visible = (GS.luxState === 0);
if (GS.luxState === 0) {
luxMesh.position.copy(NODE_POSITIONS.lux);
}
}

/* ================================================================
CAMERA MONITOR — switch Three.js camera to security viewpoint
================================================================ */
function switchToSecurityCam(index) {
const vp = CAM_VIEWPOINTS[index];
if (!vp) return;
camera.position.copy(vp.pos);
camera.lookAt(vp.target);
}

function switchToOfficeView() {
_resetOfficeCamera();
}

/* ================================================================
GAME LOOP
================================================================ */
function startGameLoop() {
lastFrameMs = Date.now();
requestAnimationFrame(_loop);
}

function _loop() {
requestAnimationFrame(_loop);

const now       = Date.now();
const deltaMs   = Math.min(now - lastFrameMs, 100); // cap at 100ms to avoid spiral
const deltaSec  = deltaMs / 1000;
lastFrameMs     = now;

const GS = GameLogic.GameState;

if (GS.gameRunning && !GS.gameOver) {
// Core AI + power + time tick
GameLogic.aiUpdate(now, deltaSec);

```
// Scene visuals
updateScene(deltaSec);

// Update UI elements
_updateHUD();
_updateCamUI(now);
_updateLightIndicators();
_updateSprintWarning(now);
_updateLuxWarning();
```

}

renderer.render(scene, camera);
}

/* ================================================================
HUD UPDATES
================================================================ */
function _updateHUD() {
const GS = GameLogic.GameState;

// Power bar
const pct = GS.power;
document.getElementById(‘power-value’).textContent = pct.toFixed(1) + ‘%’;
const fill = document.getElementById(‘power-bar-fill’);
fill.style.width = pct + ‘%’;
fill.className = pct > 50 ? ‘’ : pct > 25 ? ‘warn’ : ‘danger’;

// Usage bars  (show as | chars, one per bar)
const bars = GameLogic.getUsageBars();
const barStr = bars === 0 ? ‘|’ : ‘|’.repeat(bars + 1); // 1 bar = base, +1 per usage
document.getElementById(‘usage-bars’).textContent = barStr;

// Clock (throttle to every real second)
const now = Date.now();
if (now - lastClockUpdate > 999) {
lastClockUpdate = now;
GameLogic.updateTime();
document.getElementById(‘clock-display’).textContent = GameLogic.getClockString();
}
}

/* Camera UI: update the character label on the feed */
function _updateCamUI() {
const GS = GameLogic.GameState;
if (!GS.cameraUp) return;

const info    = GameLogic.getCamVisibilityInfo(GS.currentCam);
const camData = info.cam;
const chars   = info.chars;

// Label
document.getElementById(‘cam-label-display’).textContent =
`${camData.id} — ${camData.label}`;

// Character indicator
const charEl = document.getElementById(‘cam-char-display’);
if (chars.length > 0) {
charEl.textContent = chars.map(c => c.dim ? `(${c.label})` : c.label).join(’  ’);
charEl.style.opacity = chars[0].dim ? ‘0.4’ : ‘1’;
} else {
charEl.textContent = ‘’;
}

// Render camera view
if (GS.currentCam < CAM_VIEWPOINTS.length) {
const vp = CAM_VIEWPOINTS[GS.currentCam];
camera.position.copy(vp.pos);
camera.lookAt(vp.target);
}
}

/* Hallway light indicators */
function _updateLightIndicators() {
const GS = GameLogic.GameState;
if (GS.cameraUp) return;

const leftInd  = document.getElementById(‘left-hallway-indicator’);
const rightInd = document.getElementById(‘right-hallway-indicator’);

// Show left light hallway
if (GS.leftLightOn) {
leftInd.style.display = ‘block’;
const charLabel = document.getElementById(‘left-hall-char’);
// Check if Ben is at the left door position
const charHere = (GS.benPos >= 4) ? ‘BEN’
: (GS.randomGuyRunning) ? ‘R.GUY!’ : ‘’;
charLabel.textContent = charHere;
charLabel.style.color = charHere ? ‘#ff6666’ : ‘transparent’;
} else {
leftInd.style.display = ‘none’;
}

if (GS.rightLightOn) {
rightInd.style.display = ‘block’;
const charLabel = document.getElementById(‘right-hall-char’);
const charHere = (GS.pandaPos >= 4) ? ‘PANDA’
: (GS.notnoobPos >= 5) ? ‘???’ : ‘’;
charLabel.textContent = charHere;
charLabel.style.color = charHere ? ‘#ff6666’ : ‘transparent’;
} else {
rightInd.style.display = ‘none’;
}
}

/* Sprint warning bar */
function _updateSprintWarning(now) {
const GS = GameLogic.GameState;
const warningEl = document.getElementById(‘random-guy-warning’);

if (GS.randomGuyRunning) {
warningEl.style.display = ‘flex’;
const elapsed = now - GS.randomGuyRunStart;
const remaining = Math.max(0, 1 - elapsed / GS.RANDOM_GUY_SPRINT_MS);
document.getElementById(‘sprint-timer-fill’).style.width = (remaining * 100) + ‘%’;
document.getElementById(‘sprint-timer-fill’).style.transition =
`width ${GS.RANDOM_GUY_SPRINT_MS / 1000}s linear`;
} else {
warningEl.style.display = ‘none’;
}
}

/* Lux warning */
function _updateLuxWarning() {
const GS = GameLogic.GameState;
const luxEl = document.getElementById(‘lux-warning’);
luxEl.style.display = (GS.luxState === 0) ? ‘flex’ : ‘none’;
}

/* ================================================================
UI EVENT HANDLERS
================================================================ */
function bindUIEvents() {
const GS = GameLogic.GameState;

/* –– Left door –– */
document.getElementById(‘btn-left-door’).addEventListener(‘click’, () => {
if (!GS.gameRunning || GS.gameOver || GS.isPowerOut) return;
GS.leftDoorClosed = !GS.leftDoorClosed;
_syncDoorBtn(‘left’, GS.leftDoorClosed);
});

/* –– Right door –– */
document.getElementById(‘btn-right-door’).addEventListener(‘click’, () => {
if (!GS.gameRunning || GS.gameOver || GS.isPowerOut) return;
GS.rightDoorClosed = !GS.rightDoorClosed;
_syncDoorBtn(‘right’, GS.rightDoorClosed);
});

/* –– Left light –– */
document.getElementById(‘btn-left-light’).addEventListener(‘click’, () => {
if (!GS.gameRunning || GS.gameOver || GS.isPowerOut) return;
GS.leftLightOn = !GS.leftLightOn;
_syncLightBtn(‘left’, GS.leftLightOn);
});

/* –– Right light –– */
document.getElementById(‘btn-right-light’).addEventListener(‘click’, () => {
if (!GS.gameRunning || GS.gameOver || GS.isPowerOut) return;
GS.rightLightOn = !GS.rightLightOn;
_syncLightBtn(‘right’, GS.rightLightOn);
});

/* –– Camera toggle –– */
document.getElementById(‘btn-camera-toggle’).addEventListener(‘click’, () => {
if (!GS.gameRunning || GS.gameOver || GS.isPowerOut) return;
_openMonitor();
});

document.getElementById(‘btn-close-monitor’).addEventListener(‘click’, () => {
_closeMonitor();
});

/* –– Pause –– */
document.getElementById(‘btn-pause-toggle’).addEventListener(‘click’, () => {
if (!GS.gameRunning && !GS.gameOver) return;
_showPauseMenu();
});
document.getElementById(‘btn-resume’).addEventListener(‘click’, () => {
_hidePauseMenu();
GS.gameRunning = true;
lastFrameMs = Date.now(); // reset delta to avoid spike
});
document.getElementById(‘btn-quit-night’).addEventListener(‘click’, () => {
_hidePauseMenu();
_endGame();
showMainMenu();
});

/* –– Win/Lose screen buttons –– */
document.getElementById(‘btn-win-menu’).addEventListener(‘click’, showMainMenu);
document.getElementById(‘btn-lose-menu’).addEventListener(‘click’, showMainMenu);
document.getElementById(‘btn-lose-retry’).addEventListener(‘click’, () => {
_hideAllGameScreens();
_startNight(GS.night);
});
document.getElementById(‘btn-next-night’).addEventListener(‘click’, () => {
_hideAllGameScreens();
_startNight(GS.night + 1);
});

/* –– Menu buttons –– */
document.getElementById(‘btn-new-game’).addEventListener(‘click’, () => {
document.getElementById(‘menu-screen’).style.display = ‘none’;
_startNight(1);
});
document.getElementById(‘btn-night-select’).addEventListener(‘click’, () => {
document.getElementById(‘menu-screen’).style.display   = ‘none’;
document.getElementById(‘night-select-screen’).style.display = ‘flex’;
});
document.getElementById(‘btn-back-menu’).addEventListener(‘click’, () => {
document.getElementById(‘night-select-screen’).style.display = ‘none’;
document.getElementById(‘menu-screen’).style.display          = ‘flex’;
});
document.querySelectorAll(’.night-btn’).forEach(btn => {
btn.addEventListener(‘click’, () => {
const night = parseInt(btn.dataset.night, 10);
document.getElementById(‘night-select-screen’).style.display = ‘none’;
_startNight(night);
});
});
document.getElementById(‘btn-exit’).addEventListener(‘click’, () => {
window.close(); // works when opened via script; otherwise redirects
window.location.href = ‘about:blank’;
});

/* –– Build camera selection buttons –– */
_buildCamButtons();
}

function _buildCamButtons() {
const grid = document.getElementById(‘cam-buttons-grid’);
grid.innerHTML = ‘’;
GameLogic.CAMERAS.forEach((cam, i) => {
const btn = document.createElement(‘button’);
btn.className = ‘cam-select-btn’;
btn.dataset.camIndex = i;
btn.innerHTML = `<span class="cam-id">${cam.id}</span><span class="cam-name">${cam.label}</span>`;
btn.addEventListener(‘click’, () => _switchCam(i));
grid.appendChild(btn);
});
}

function _syncDoorBtn(side, closed) {
const btn = document.getElementById(`btn-${side}-door`);
btn.classList.toggle(‘door-closed’, closed);
btn.querySelector(’.btn-label’).textContent = closed ? ‘CLOSE’ : ‘DOOR’;
}

function _syncLightBtn(side, on) {
const btn = document.getElementById(`btn-${side}-light`);
btn.classList.toggle(‘light-on’, on);
}

function _openMonitor() {
const GS = GameLogic.GameState;
GS.cameraUp = true;
document.getElementById(‘camera-monitor’).style.display = ‘flex’;
document.getElementById(‘btn-camera-toggle’).classList.add(‘active’);
GameLogic.onCameraOpen();
_syncActiveCamBtn(GS.currentCam);
switchToSecurityCam(GS.currentCam);
}

function _closeMonitor() {
const GS = GameLogic.GameState;
GameLogic.onCameraClose();
GS.cameraUp = false;
document.getElementById(‘camera-monitor’).style.display = ‘none’;
document.getElementById(‘btn-camera-toggle’).classList.remove(‘active’);
switchToOfficeView();
}

function _switchCam(index) {
GameLogic.onCameraSwitch(index);
switchToSecurityCam(index);
_syncActiveCamBtn(index);
}

function _syncActiveCamBtn(index) {
document.querySelectorAll(’.cam-select-btn’).forEach((btn, i) => {
btn.classList.toggle(‘active’, i === index);
});
}

/* ================================================================
LOOK CONTROLS — Mouse & Touch
================================================================ */
function bindLookControls() {
const canvas = renderer.domElement;

/* Mouse drag */
canvas.addEventListener(‘mousedown’, (e) => {
isMouseDown = true;
mouseLastX  = e.clientX;
});
window.addEventListener(‘mouseup’, () => { isMouseDown = false; });
window.addEventListener(‘mousemove’, (e) => {
if (!isMouseDown || GameLogic.GameState.cameraUp) return;
const dx = e.clientX - mouseLastX;
mouseLastX = e.clientX;
panTarget = THREE.MathUtils.clamp(panTarget + dx * 0.003, -SCENE.PAN_MAX, SCENE.PAN_MAX);
});

/* Touch swipe */
canvas.addEventListener(‘touchstart’, (e) => {
if (GameLogic.GameState.cameraUp) return;
isTouching  = true;
touchStartX = e.touches[0].clientX;
touchLastX  = touchStartX;
}, { passive: true });

canvas.addEventListener(‘touchmove’, (e) => {
if (!isTouching || GameLogic.GameState.cameraUp) return;
const dx = e.touches[0].clientX - touchLastX;
touchLastX = e.touches[0].clientX;
panTarget = THREE.MathUtils.clamp(panTarget + dx * 0.003, -SCENE.PAN_MAX, SCENE.PAN_MAX);
}, { passive: true });

canvas.addEventListener(‘touchend’, () => { isTouching = false; });
}

/* ================================================================
GAME LIFECYCLE
================================================================ */
function _startNight(night) {
const GS = GameLogic.GameState;

// Reset UI
_hideAllGameScreens();
_syncDoorBtn(‘left’,  false);
_syncDoorBtn(‘right’, false);
_syncLightBtn(‘left’,  false);
_syncLightBtn(‘right’, false);
document.getElementById(‘btn-camera-toggle’).classList.remove(‘active’);
document.getElementById(‘night-display’).textContent = `Night ${night}`;
document.getElementById(‘left-hallway-indicator’).style.display  = ‘none’;
document.getElementById(‘right-hallway-indicator’).style.display = ‘none’;

// Reset scene lighting
officeLights.forEach(l => { if (l.intensity !== undefined) l.intensity = l === officeLights[1] ? 0.8 : 0.6; });
scene.background = new THREE.Color(0x050505);
scene.fog = new THREE.Fog(0x050505, 8, 28);
switchToOfficeView();

// Init AI
GameLogic.initGame(night);

// Wire callbacks
GS.onJumpscare        = _onJumpscare;
GS.onPowerOut         = _onPowerOut;
GS.onLuxAppear        = _onLuxAppear;
GS.onLuxDisappear     = _onLuxDisappear;
GS.onLuxCrash         = _onLuxCrash;
GS.onRandomGuySprint  = _onRandomGuySprint;
GS.onRandomGuyBlocked = _onRandomGuyBlocked;
GS.onWin              = _onWin;
GS.onPositionsChanged = _updateCharMeshes;

document.getElementById(‘game-container’).style.display = ‘block’;
lastFrameMs = Date.now();
}

function _endGame() {
GameLogic.GameState.gameRunning = false;
GameLogic.GameState.gameOver    = true;
}

/* ================================================================
AI EVENT CALLBACKS
================================================================ */
function _onJumpscare(who) {
const names = {
ben:       ‘BEN’,
panda:     ‘PANDA’,
notnoob:   ‘NOTNOOB’,
randomGuy: ‘RANDOM GUY’,
lux:       ‘LUX’,
};
const jsScreen = document.getElementById(‘jumpscare-screen’);
jsScreen.dataset.char = who;
document.getElementById(‘jumpscare-char-name’).textContent = names[who] || ‘!’;
jsScreen.style.display = ‘flex’;

// After jumpscare plays (1.8 s), show lose screen
setTimeout(() => {
jsScreen.style.display = ‘none’;
document.getElementById(‘lose-message’).textContent =
`You were got by ${names[who] || 'something'}.`;
document.getElementById(‘lose-screen’).style.display = ‘flex’;
}, 1800);
}

function _onPowerOut() {
// Lights out
officeLights.forEach(l => { l.intensity = 0; });
leftLightSpot.intensity  = 0;
rightLightSpot.intensity = 0;
scene.background = new THREE.Color(0x000000);
document.getElementById(‘power-out-screen’).style.display = ‘flex’;
document.getElementById(‘camera-monitor’).style.display = ‘none’;
document.getElementById(‘hud’).style.display = ‘none’;
// Close buttons during outage
document.getElementById(‘left-controls’).style.display  = ‘none’;
document.getElementById(‘right-controls’).style.display = ‘none’;
document.getElementById(‘camera-toggle-area’).style.display = ‘none’;
}

function _onLuxAppear() {
// Lux mesh visibility is handled by _updateCharMeshes
// Flash screen
const luxEl = document.getElementById(‘lux-warning’);
luxEl.style.display = ‘flex’;
}

function _onLuxDisappear() {
document.getElementById(‘lux-warning’).style.display = ‘none’;
}

function _onLuxCrash() {
document.getElementById(‘lux-warning’).style.display = ‘none’;
const crashEl = document.getElementById(‘lux-crash-screen’);
crashEl.style.display = ‘flex’;

let count = 5;
const cd = document.getElementById(‘crash-countdown’);
const interval = setInterval(() => {
count–;
cd.textContent = `Restarting in ${count}...`;
if (count <= 0) {
clearInterval(interval);
crashEl.style.display = ‘none’;
showMainMenu();
}
}, 1000);
}

function _onRandomGuySprint() {
// Warning shown in _updateSprintWarning
}

function _onRandomGuyBlocked() {
// Power penalty applied in ai.js; visual feedback via HUD
}

function _onWin() {
const GS = GameLogic.GameState;
document.getElementById(‘win-stats’).innerHTML =
`Night ${GS.night} complete<br>Power remaining: ${GS.power.toFixed(1)}%`;
document.getElementById(‘win-screen’).style.display = ‘flex’;
// Hide next night btn on night 6
document.getElementById(‘btn-next-night’).style.display =
GS.night >= 6 ? ‘none’ : ‘block’;
}

/* ================================================================
PAUSE
================================================================ */
function _showPauseMenu() {
GameLogic.GameState.gameRunning = false;
document.getElementById(‘pause-menu’).style.display = ‘flex’;
}
function _hidePauseMenu() {
document.getElementById(‘pause-menu’).style.display = ‘none’;
}

/* ================================================================
SCREEN MANAGEMENT
================================================================ */
function _hideAllGameScreens() {
[
‘camera-monitor’, ‘power-out-screen’, ‘jumpscare-screen’,
‘lux-crash-screen’, ‘win-screen’, ‘lose-screen’,
‘pause-menu’, ‘random-guy-warning’, ‘lux-warning’,
‘left-hallway-indicator’, ‘right-hallway-indicator’,
].forEach(id => {
const el = document.getElementById(id);
if (el) el.style.display = ‘none’;
});

// Restore HUD + controls
document.getElementById(‘hud’).style.display             = ‘flex’;
document.getElementById(‘left-controls’).style.display   = ‘flex’;
document.getElementById(‘right-controls’).style.display  = ‘flex’;
document.getElementById(‘camera-toggle-area’).style.display = ‘block’;
}

function showMainMenu() {
_endGame();
document.getElementById(‘game-container’).style.display  = ‘none’;
document.getElementById(‘night-select-screen’).style.display = ‘none’;
document.getElementById(‘menu-screen’).style.display     = ‘flex’;
}

/* ================================================================
HELPER: add a box to the scene, returns the mesh
================================================================ */
function _addBox(w, h, d, x, y, z, mat) {
const geo  = new THREE.BoxGeometry(w, h, d);
const mesh = new THREE.Mesh(geo, mat);
mesh.position.set(x, y, z);
scene.add(mesh);
return mesh;
}

/* ================================================================
ENTRY POINT
================================================================ */
window.addEventListener(‘DOMContentLoaded’, () => {
initRenderer();
buildScene();
bindUIEvents();
bindLookControls();
startGameLoop();

// Start rendering before game begins (show static scene on menu)
// Render once to warm up
renderer.render(scene, camera);
});
