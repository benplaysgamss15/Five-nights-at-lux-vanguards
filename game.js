// Get DOM Elements
const leftDoorBtn = document.getElementById('btn-left-door');
const rightDoorBtn = document.getElementById('btn-right-door');
const leftLightBtn = document.getElementById('btn-left-light');
const rightLightBtn = document.getElementById('btn-right-light');

const leftDoorVisual = document.getElementById('left-door');
const rightDoorVisual = document.getElementById('right-door');
const leftHallwayLight = document.getElementById('left-hallway');
const rightHallwayLight = document.getElementById('right-hallway');

const exitBtn = document.getElementById('btn-exit');
const monitorBtn = document.getElementById('btn-monitor');

// Game State Variables
let power = 100;
let isLeftDoorClosed = false;
let isRightDoorClosed = false;

// --- EXIT BUTTON LOGIC ---
exitBtn.addEventListener('click', () => {
    let confirmExit = confirm("Are you sure you want to quit to the main menu?");
    if (confirmExit) {
        alert("Returning to main menu...");
        // Later, we will redirect to menu.html or hide the game screen here
    }
});

// --- LEFT DOOR LOGIC ---
leftDoorBtn.addEventListener('click', () => {
    isLeftDoorClosed = !isLeftDoorClosed; // Toggle state
    if (isLeftDoorClosed) {
        leftDoorVisual.classList.add('closed');
        leftDoorBtn.classList.add('active-door');
    } else {
        leftDoorVisual.classList.remove('closed');
        leftDoorBtn.classList.remove('active-door');
    }
});

// --- RIGHT DOOR LOGIC ---
rightDoorBtn.addEventListener('click', () => {
    isRightDoorClosed = !isRightDoorClosed;
    if (isRightDoorClosed) {
        rightDoorVisual.classList.add('closed');
        rightDoorBtn.classList.add('active-door');
    } else {
        rightDoorVisual.classList.remove('closed');
        rightDoorBtn.classList.remove('active-door');
    }
});

// --- LIGHTS LOGIC (Mobile Friendly: Hold or Toggle) ---
// We will make them toggle on/off when clicked for easier mobile play
let isLeftLightOn = false;
let isRightLightOn = false;

leftLightBtn.addEventListener('click', () => {
    // Turn off right light if left is clicked (like the real game)
    isRightLightOn = false;
    rightHallwayLight.classList.remove('on');
    rightLightBtn.classList.remove('active-light');

    isLeftLightOn = !isLeftLightOn;
    if (isLeftLightOn) {
        leftHallwayLight.classList.add('on');
        leftLightBtn.classList.add('active-light');
    } else {
        leftHallwayLight.classList.remove('on');
        leftLightBtn.classList.remove('active-light');
    }
});

rightLightBtn.addEventListener('click', () => {
    // Turn off left light if right is clicked
    isLeftLightOn = false;
    leftHallwayLight.classList.remove('on');
    leftLightBtn.classList.remove('active-light');

    isRightLightOn = !isRightLightOn;
    if (isRightLightOn) {
        rightHallwayLight.classList.add('on');
        rightLightBtn.classList.add('active-light');
    } else {
        rightHallwayLight.classList.remove('on');
        rightLightBtn.classList.remove('active-light');
    }
});

// Monitor Placeholder
monitorBtn.addEventListener('click', () => {
    alert("Camera Monitor will open here!");
});
