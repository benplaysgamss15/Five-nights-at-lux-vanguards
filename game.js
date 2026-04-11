// --- 1. CORE MECHANICS MATH & VARIABLES ---
let power = 100.0;
let usage = 1;
let timeHour = 0; 
let frames = 0;
let isMonitorUp = false;
let isDead = false;

let doors = { left: false, right: false };

// AI Levels (1-20). Increase these to make the game harder.
let ai = {
    notnoob: { level: 3, location: 1 },    // Freddy
    panda: { level: 4, location: 1 },      // Chica
    Ben: { level: 5, location: 1 },        // Bonnie
    random_guy: { level: 2, stage: 0 },    // Foxy
    Lux: { level: 1, active: false }       // Golden Freddy
};

// --- 2. THREE.JS 3D ENGINE SETUP ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505); // Dark room

// Camera setup (Player perspective)
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.5, 0); // Sitting at desk

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0x222222); 
scene.add(ambientLight);
const deskLight = new THREE.PointLight(0xffddaa, 0.8, 10);
deskLight.position.set(0, 2, -2);
scene.add(deskLight);

// --- 3. BUILD THE 3D OFFICE ---
// Note: In a full game, you'd load GLTF models here. For now, we construct the office with math & geometries.
const materialWall = new THREE.MeshLambertMaterial({ color: 0x333333 });
const materialDoor = new THREE.MeshLambertMaterial({ color: 0x555555 });
const materialBtnRed = new THREE.MeshBasicMaterial({ color: 0xaa0000 });
const materialBtnGreen = new THREE.MeshBasicMaterial({ color: 0x00aa00 });

// Desk
const deskGeom = new THREE.BoxGeometry(4, 1, 1);
const desk = new THREE.Mesh(deskGeom, new THREE.MeshLambertMaterial({ color: 0x4d3319 }));
desk.position.set(0, 0.5, -3);
scene.add(desk);

// Left Door & Button
const doorGeom = new THREE.BoxGeometry(0.2, 4, 2);
const leftDoor = new THREE.Mesh(doorGeom, materialDoor);
leftDoor.position.set(-3, 2, 0); // Y=2 means open (up), Y=0 means closed (down)
scene.add(leftDoor);

const leftBtn = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.5), materialBtnRed);
leftBtn.position.set(-2.8, 1.5, 1);
leftBtn.userData = { action: 'door', side: 'left' }; // Tag for interaction
scene.add(leftBtn);

// Right Door & Button
const rightDoor = new THREE.Mesh(doorGeom, materialDoor);
rightDoor.position.set(3, 2, 0);
scene.add(rightDoor);

const rightBtn = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.5), materialBtnRed);
rightBtn.position.set(2.8, 1.5, 1);
rightBtn.userData = { action: 'door', side: 'right' };
scene.add(rightBtn);

// --- 4. MOBILE & DESKTOP INTERACTIONS (Raycasting Math) ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// 'pointerdown' works for both Mouse Clicks and Mobile Touches automatically!
window.addEventListener('pointerdown', (event) => {
    if(isMonitorUp || isDead) return;

    // Convert screen taps to 3D Math coordinates (-1 to +1)
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children);

    if (intersects.length > 0) {
        let clickedObj = intersects[0].object;
        
        // Door Logic
        if (clickedObj.userData.action === 'door') {
            let side = clickedObj.userData.side;
            doors[side] = !doors[side];
            
            // Animate door moving up/down mathematically
            if (side === 'left') {
                leftDoor.position.y = doors.left ? 0 : 2; 
                leftBtn.material = doors.left ? materialBtnGreen : materialBtnRed;
            } else {
                rightDoor.position.y = doors.right ? 0 : 2;
                rightBtn.material = doors.right ? materialBtnGreen : materialBtnRed;
            }
            updateUsage();
        }
    }
});

// Camera Monitor Toggle
document.getElementById('camera-toggle').addEventListener('click', () => {
    isMonitorUp = !isMonitorUp;
    document.getElementById('camera-system').style.display = isMonitorUp ? 'block' : 'none';
    updateUsage();
});

// --- 5. GAME LOOPS & AI LOGIC ---

function updateUsage() {
    usage = 1; // Base power usage
    if (doors.left) usage++;
    if (doors.right) usage++;
    if (isMonitorUp) usage++;
    
    let batteryUI = "";
    for(let i=0; i<usage; i++) batteryUI += "🔋";
    document.getElementById('usage-text').innerText = batteryUI;
}

// AI Movement Core Math
setInterval(() => {
    if(isDead) return;

    // 1. Roll Random Numbers for AI
    if (Math.floor(Math.random() * 20) + 1 <= ai.Ben.level) {
        ai.Ben.location++; 
        if (ai.Ben.location > 3) checkDoor('Ben', 'left'); // Ben attacks Left
    }

    if (Math.floor(Math.random() * 20) + 1 <= ai.panda.level) {
        ai.panda.location++;
        if (ai.panda.location > 3) checkDoor('panda', 'right'); // Panda attacks Right
    }

    // Foxy (random guy) Math: Increments stages before attacking
    if (Math.floor(Math.random() * 20) + 1 <= ai.random_guy.level) {
        if (!isMonitorUp) ai.random_guy.stage++; 
        if (ai.random_guy.stage >= 4) {
            // Sprint initiated
            setTimeout(() => {
                checkDoor('random guy', 'left');
                ai.random_guy.stage = 0; // Resets if door was closed
            }, 3000); // 3 seconds to close the door!
        }
    }

}, 5000); // AI computes every 5 seconds

function checkDoor(animatronic, doorSide) {
    if (doors[doorSide] === false) {
        triggerJumpscare(animatronic);
    } else {
        // Door blocked them! Drain power slightly as a penalty (optional) and reset them
        power -= 1.0; 
        if(animatronic === 'Ben') ai.Ben.location = 1;
        if(animatronic === 'panda') ai.panda.location = 1;
    }
}

function triggerJumpscare(name) {
    isDead = true;
    document.getElementById('jumpscare-screen').style.display = 'block';
    document.getElementById('jumpscare-screen').innerHTML = `<h1 style="color:white; text-align:center; margin-top:40vh;">${name} JUMPSCARE!</h1>`;
    // Here you would play a loud audio file
}

// 60FPS Render Loop & Time/Power Engines
function animate() {
    requestAnimationFrame(animate);
    
    if(!isDead) {
        frames++;
        
        // Power Math: Base drain is ~0.1% per second at Usage 1 (Adjustable)
        let drainRate = (0.002 * usage); 
        power -= drainRate;
        if(power <= 0) {
            power = 0;
            triggerJumpscare("notnoob"); // Power outage = Freddy (notnoob) attacks
        }
        document.getElementById('power-text').innerText = Math.max(0, power).toFixed(1);

        // Time Math (60 FPS * 60 seconds = 3600 frames = 1 In-Game Hour)
        if (frames % 3600 === 0) {
            timeHour++;
            if (timeHour === 6) {
                alert("6 AM! YOU SURVIVED!");
                window.location.reload();
            }
            document.getElementById('time-display').innerText = (timeHour === 0 ? 12 : timeHour) + ":00 AM";
        }
    }

    renderer.render(scene, camera);
}

// Window resizing fix for desktop/mobile rotation
window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
});

// Start Game
animate();

// Dummy function for Camera Buttons
function switchCam(id) {
    document.getElementById('cam-name').innerText = "CAM " + id;
    document.getElementById('cam-content').innerText = "Signal lost...";
}
