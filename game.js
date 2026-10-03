import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

/* =========================================================
   QUANTUM RACING  (H = Hadamard, X = Pauli-X, Z = Pauli-Z)
   Simplified qubit model: |ψ> = α|0> + β|1>
   ========================================================= */

/* GLOBAL GAME STATE */
let gameStarted = false;
let measured = false;
let raceFinished = false;
let raceTime = 0;
let raceStart = 0;
let currentPath = 0;
let gateCount = 12;
let quantumEnergy = 100;
let gateHistory = [];     // every gate played, so it can be rewound
let storyHook = null;     // tutorial listens to gate events through this

/* QUANTUM STATE */
let q = { alpha: 1, beta: 0, phaseA: 0, phaseB: 0 };

/* RACING PATHS */
const paths = [
    { name: "PATH α", speed: 1.00, difficulty: 1.0, color: 0x00eaff, hex: "#00eaff" },
    { name: "PATH β", speed: 1.15, difficulty: 1.2, color: 0xa855f7, hex: "#a855f7" },
    { name: "PATH γ", speed: 1.32, difficulty: 1.5, color: 0x00ff9d, hex: "#00ff9d" }
];

/* LANE POSITIONS */
const laneX = [-5, 0, 5];

/* Neon intensity control (1 = original, lower = softer) */
const NEON = 0.55;

function dim(hex) {
    return new THREE.Color(hex).multiplyScalar(NEON);
}

/* Car colours: white body, slight self-glow so it stays visible at night */
const CAR_COLOR = 0xffffff;
const CAR_EMISSIVE = 0x2a2a2a;

/* How strongly interference feeds Path γ (was 1.5).
   With 30, pressing H then X gives γ about 87%. */
const GAMMA_BOOST = 30;

/* THREE.JS SCENE */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02040a);
scene.fog = new THREE.FogExp2(0x02040a, 0.007);

/* CAMERA */
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5.5, 20);

/* RENDERER */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;          // was 1.25
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

/* POST PROCESSING */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.6,     // strength  (was 1.3)
    0.5,     // radius    (was 0.7)
    0.25     // threshold (was 0.15)
);
composer.addPass(bloom);

/* LIGHTING */
scene.add(new THREE.HemisphereLight(0x507090, 0x03040a, 1.3));

const sun = new THREE.DirectionalLight(0xffffff, 4);
sun.position.set(-20, 40, 20);
sun.castShadow = true;
sun.shadow.mapSize.width = 2048;
sun.shadow.mapSize.height = 2048;
scene.add(sun);

const cyanLight = new THREE.PointLight(0x00eaff, 60, 80);    // was 120
cyanLight.position.set(0, 6, -30);
scene.add(cyanLight);

const purpleLight = new THREE.PointLight(0x8b5cf6, 45, 70);  // was 90
purpleLight.position.set(15, 4, -80);
scene.add(purpleLight);

/* TRACK */
const trackGroup = new THREE.Group();
scene.add(trackGroup);

const track = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 600),
    new THREE.MeshStandardMaterial({ color: 0x080d17, metalness: 0.9, roughness: 0.32 })
);
track.rotation.x = -Math.PI / 2;
track.position.z = -250;
track.receiveShadow = true;
trackGroup.add(track);

/* LANE GLOW LINES */
for (let i = 0; i < 3; i++) {
    const line = new THREE.Mesh(
        new THREE.BoxGeometry(0.045, 0.035, 600),
        new THREE.MeshBasicMaterial({ color: dim(paths[i].color) })
    );
    line.position.set(laneX[i], 0.04, -250);
    trackGroup.add(line);
}

/* ROAD EDGE */
for (const x of [-11, 11]) {
    const edge = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.15, 600),
        new THREE.MeshBasicMaterial({ color: dim(0x00eaff) })
    );
    edge.position.set(x, 0.08, -250);
    trackGroup.add(edge);
}

/* ROAD DASHES */
const roadDashGroup = new THREE.Group();
scene.add(roadDashGroup);

for (let z = 10; z > -580; z -= 12) {
    for (let i = 0; i < 3; i++) {
        const dash = new THREE.Mesh(
            new THREE.BoxGeometry(0.12, 0.025, 5),
            new THREE.MeshBasicMaterial({ color: dim(paths[i].color) })
        );
        dash.position.set(laneX[i], 0.06, z);
        dash.userData.roadDash = true;
        roadDashGroup.add(dash);
    }
}

/* BUILDINGS */
const buildingGroup = new THREE.Group();
scene.add(buildingGroup);

const buildingMaterial = new THREE.MeshStandardMaterial({ color: 0x07101f, metalness: 0.7, roughness: 0.4 });

for (let z = 0; z > -560; z -= 13) {
    for (const side of [-1, 1]) {
        const height = 5 + Math.random() * 30;
        const width = 3 + Math.random() * 7;

        const building = new THREE.Mesh(new THREE.BoxGeometry(width, height, 7), buildingMaterial);
        building.position.set(side * (17 + Math.random() * 18), height / 2, z);
        building.castShadow = true;
        building.userData.building = true;
        buildingGroup.add(building);

        /* Windows */
        for (let y = 3; y < height - 1; y += 3) {
            const windowMesh = new THREE.Mesh(
                new THREE.BoxGeometry(width * 0.6, 0.12, 0.04),
                new THREE.MeshBasicMaterial({
                    color: Math.random() > 0.45 ? dim(0x00eaff) : 0x101a30
                })
            );
            windowMesh.position.set(0, y - height / 2, -3.53);
            building.add(windowMesh);
        }
    }
}

/* DISTANT CITY LIGHTS */
const cityLights = new THREE.Group();
scene.add(cityLights);

for (let i = 0; i < 120; i++) {
    const light = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.15, 0.15),
        new THREE.MeshBasicMaterial({
            color: Math.random() > 0.5 ? dim(0x00eaff) : dim(0xa855f7)
        })
    );
    light.position.set(
        (Math.random() > 0.5 ? 1 : -1) * (15 + Math.random() * 35),
        1 + Math.random() * 15,
        -Math.random() * 550
    );
    cityLights.add(light);
}

/* QUANTUM GATE ARCHES */
const gateObjects = [];

function createQuantumGate(z, color, label) {
    const group = new THREE.Group();
    group.position.z = z;
    group.userData.gate = true;
    group.userData.label = label;
    scene.add(group);

    const material = new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 1.5,    // was 4
        metalness: 0.5,
        roughness: 0.2
    });

    const left = new THREE.Mesh(new THREE.BoxGeometry(0.3, 7, 0.3), material);
    left.position.x = -10;
    group.add(left);

    const right = left.clone();
    right.position.x = 10;
    group.add(right);

    const top = new THREE.Mesh(new THREE.BoxGeometry(20, 0.3, 0.3), material);
    top.position.y = 7;
    group.add(top);

    const ring = new THREE.Mesh(
        new THREE.TorusGeometry(4, 0.06, 16, 80),
        new THREE.MeshBasicMaterial({ color: dim(color) })
    );
    ring.position.y = 3.5;
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    gateObjects.push(group);
}

createQuantumGate(-50, 0x00eaff, "H");
createQuantumGate(-160, 0xa855f7, "X");
createQuantumGate(-280, 0x00ff9d, "Z");

/* FINISH LINE */
const finishGroup = new THREE.Group();
finishGroup.position.z = -420;
scene.add(finishGroup);

const finishMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

for (let x = -10; x <= 10; x += 2) {
    const block = new THREE.Mesh(
        new THREE.BoxGeometry(2, 0.08, 4),
        new THREE.MeshBasicMaterial({
            color: (Math.round(x) / 2) % 2 === 0 ? 0xffffff : 0x111111
        })
    );
    block.position.set(x, 0.1, 0);
    finishGroup.add(block);
}

/* Finish arch */
const finishLeft = new THREE.Mesh(new THREE.BoxGeometry(0.5, 9, 0.5), finishMaterial);
finishLeft.position.set(-10, 4.5, 0);
finishGroup.add(finishLeft);

const finishRight = finishLeft.clone();
finishRight.position.x = 10;
finishGroup.add(finishRight);

const finishTop = new THREE.Mesh(new THREE.BoxGeometry(20, 0.5, 0.5), finishMaterial);
finishTop.position.y = 9;
finishGroup.add(finishTop);

/* CAR CREATION FUNCTION */
function createCar() {
    const group = new THREE.Group();

    const bodyMaterial = new THREE.MeshPhysicalMaterial({
        color: CAR_COLOR,
        metalness: 0.95,
        roughness: 0.18,
        clearcoat: 1,
        clearcoatRoughness: 0.08
    });

    /* Main body */
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.45, 4.2), bodyMaterial);
    body.castShadow = true;
    group.add(body);

    /* Cockpit */
    const cockpit = new THREE.Mesh(
        new THREE.SphereGeometry(1, 32, 16),
        new THREE.MeshPhysicalMaterial({
            color: 0x031827,
            metalness: 0.3,
            roughness: 0.05,
            transparent: true,
            opacity: 0.82
        })
    );
    cockpit.scale.set(0.75, 0.35, 1.1);
    cockpit.position.set(0, 0.4, -0.2);
    group.add(cockpit);

    /* Nose */
    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.05, 2, 4), bodyMaterial);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = -2.2;
    group.add(nose);

    /* Wheels */
    for (const x of [-1.15, 1.15]) {
        for (const z of [-1.35, 1.35]) {
            const wheel = new THREE.Mesh(
                new THREE.CylinderGeometry(0.38, 0.38, 0.3, 24),
                new THREE.MeshStandardMaterial({ color: 0x020204, metalness: 0.9, roughness: 0.2 })
            );
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(x, -0.25, z);
            wheel.castShadow = true;
            group.add(wheel);
        }
    }

    /* Quantum glow */
    const glow = new THREE.PointLight(0xffffff, 2.5, 10);   // soft white (was 0x00eaff, 18)
    glow.position.y = 0.5;
    group.add(glow);

    return group;
}

/* MAIN CAR */
const car = createCar();
scene.add(car);
car.position.set(0, 0.8, 5);

/* QUANTUM GHOST CARS */
const ghostCars = [];

for (let i = 0; i < 3; i++) {
    const ghost = createCar();
    ghost.position.set(laneX[i], 0.8, 5);
    ghost.scale.setScalar(0.92);

    ghost.traverse(object => {
        if (object.isLight) {
            object.intensity = 0;            // no glow blobs from ghost cars
        }
        if (object.isMesh) {
            object.material = object.material.clone();
            object.material.transparent = true;
            object.material.opacity = 0.35;
            object.material.color = new THREE.Color(CAR_COLOR);
            if (object.material.emissive) {
                object.material.emissive = new THREE.Color(CAR_EMISSIVE);
                object.material.emissiveIntensity = 0.35;
            }
        }
    });

    scene.add(ghost);
    ghostCars.push(ghost);
}

/* PARTICLE SYSTEM */
const particleCount = 1200;
const particleGeometry = new THREE.BufferGeometry();
const particlePositions = new Float32Array(particleCount * 3);

for (let i = 0; i < particleCount; i++) {
    particlePositions[i * 3] = (Math.random() - 0.5) * 40;
    particlePositions[i * 3 + 1] = Math.random() * 15;
    particlePositions[i * 3 + 2] = -Math.random() * 500;
}

particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));

const particles = new THREE.Points(
    particleGeometry,
    new THREE.PointsMaterial({
        color: 0x00eaff,
        size: 0.08,
        transparent: true,
        opacity: 0.45,    // was 0.7
        blending: THREE.AdditiveBlending
    })
);
scene.add(particles);

/* QUANTUM MATHEMATICS */
function normalize() {
    const magnitude = Math.sqrt(q.alpha * q.alpha + q.beta * q.beta);
    if (magnitude === 0) {
        q.alpha = 1;
        q.beta = 0;
        return;
    }
    q.alpha /= magnitude;
    q.beta /= magnitude;
}

/* HADAMARD GATE */
function hadamard() {
    if (!consumeGate()) return;

    const a = q.alpha;
    const b = q.beta;

    q.alpha = (a + b) / Math.sqrt(2);
    q.beta = (a - b) / Math.sqrt(2);
    q.phaseA += Math.PI / 4;
    q.phaseB -= Math.PI / 4;

    normalize();
    gateHistory.push("H");
    if (storyHook) storyHook("H");
    notify("H GATE — SUPERPOSITION CREATED");
    quantumPulse(0x00eaff);
    updateHUD();
}

/* PAULI-X GATE */
function pauliX() {
    if (!consumeGate()) return;

    const temp = q.alpha;
    q.alpha = q.beta;
    q.beta = temp;
    q.phaseA += Math.PI / 2;

    gateHistory.push("X");
    if (storyHook) storyHook("X");
    notify("X GATE — STATE FLIPPED");
    quantumPulse(0xa855f7);
    updateHUD();
}

/* PAULI-Z GATE */
function pauliZ() {
    if (!consumeGate()) return;

    q.beta *= -1;
    q.phaseB += Math.PI;

    gateHistory.push("Z");
    if (storyHook) storyHook("Z");
    notify("Z GATE — PHASE SHIFTED");
    quantumPulse(0x00ff9d);
    updateHUD();
}

/* INTERFERENCE */
function calculateProbabilities() {
    const phase = Math.cos(q.phaseA - q.phaseB);

    let pA = q.alpha * q.alpha;
    let pB = q.beta * q.beta;

    /* Constructive/destructive interference */
    const interference = 0.45 * q.alpha * q.beta * phase;

    pA += interference;
    pB -= interference;

    pA = Math.max(0.02, pA);
    pB = Math.max(0.02, pB);

    /* Emergent third path */
    let pC = Math.abs(interference) * GAMMA_BOOST;

    const total = pA + pB + pC;

    return [pA / total, pB / total, pC / total];
}

/* RESOURCE SYSTEM */
function consumeGate() {
    if (gateCount <= 0) {
        notify("NO QUANTUM GATES REMAIN");
        return false;
    }

    if (quantumEnergy <= 0) {
        notify("QUANTUM ENERGY DEPLETED");
        return false;
    }

    gateCount--;
    quantumEnergy -= 8;
    quantumEnergy = Math.max(0, quantumEnergy);

    updateHUD();
    return true;
}

/* QUANTUM PULSE */
function quantumPulse(color) {
    const pulse = new THREE.PointLight(color, 100, 40);   // was 250
    pulse.position.copy(car.position);
    scene.add(pulse);

    let intensity = 100;                                  // was 250

    function animatePulse() {
        intensity *= 0.91;
        pulse.intensity = intensity;

        if (intensity > 1) {
            requestAnimationFrame(animatePulse);
        } else {
            scene.remove(pulse);
        }
    }

    animatePulse();
}

/* MEASUREMENT */
function measure() {
    if (!gameStarted) {
        notify("START THE QUANTUM CIRCUIT FIRST");
        return;
    }

    if (measured) {
        notify("WAVEFUNCTION ALREADY COLLAPSED");
        return;
    }

    const probabilities = calculateProbabilities();
    const random = Math.random();

    let cumulative = 0;
    let selected = 0;

    for (let i = 0; i < probabilities.length; i++) {
        cumulative += probabilities[i];
        if (random <= cumulative) {
            selected = i;
            break;
        }
    }

    currentPath = selected;
    measured = true;

    notify("⚡ WAVEFUNCTION COLLAPSED");

    /* Hide the losing ghost cars */
    for (let i = 0; i < 3; i++) {
        ghostCars[i].visible = i === selected;
    }

    /* Main car changes to selected lane */
    car.userData.targetX = laneX[selected];

    /* Score */
    const probability = probabilities[selected];
    const baseScore = probability * 1000;
    const speedBonus = paths[selected].speed * 1000;
    const timePenalty = raceTime * 10;

    const score = Math.max(0, Math.round(baseScore + speedBonus - timePenalty));

    /* Show result after continuing to race */
    setTimeout(() => {
        showResult(selected, probability, score);
    }, 5000);
}

/* HUD */
function updateHUD() {
    const p = calculateProbabilities();

    document.getElementById("probA").style.width = `${p[0] * 100}%`;
    document.getElementById("probB").style.width = `${p[1] * 100}%`;
    document.getElementById("probC").style.width = `${p[2] * 100}%`;

    document.getElementById("probAText").innerText = `${Math.round(p[0] * 100)}%`;
    document.getElementById("probBText").innerText = `${Math.round(p[1] * 100)}%`;
    document.getElementById("probCText").innerText = `${Math.round(p[2] * 100)}%`;

    document.getElementById("energyFill").style.width = `${quantumEnergy}%`;
    document.getElementById("energyText").innerText = quantumEnergy;
    document.getElementById("gatesRemaining").innerText = gateCount;
}

/* NOTIFICATIONS */
let notificationTimeout;

function notify(message) {
    const element = document.getElementById("notification");
    element.innerText = message;
    element.style.opacity = 1;

    clearTimeout(notificationTimeout);
    notificationTimeout = setTimeout(() => {
        element.style.opacity = 0;
    }, 2000);
}

/* START GAME */
function startGame() {
    document.getElementById("startScreen").style.display = "none";

    gameStarted = true;
    measured = false;
    raceFinished = false;
    raceTime = 0;
    raceStart = performance.now();

    /* Reset quantum state */
    q.alpha = 1;
    q.beta = 0;
    q.phaseA = 0;
    q.phaseB = 0;

    /* Reset resources */
    gateCount = 12;
    quantumEnergy = 100;

    gateHistory.length = 0;

    /* Reset car */
    car.position.set(0, 0.8, 5);
    car.userData.targetX = undefined;

    /* Reset camera */
    camera.position.set(0, 5.5, 20);
    camera.lookAt(0, 1, -25);

    /* Reset ghosts */
    for (let i = 0; i < 3; i++) {
        ghostCars[i].visible = true;
        ghostCars[i].position.set(laneX[i], 0.8, 5);
    }

    notify("🏁 QUANTUM CIRCUIT ACTIVE — GO!");
    updateHUD();
}

/* RESULT SCREEN */
function showResult(selected, probability, score) {
    document.getElementById("resultScreen").style.display = "flex";
    document.getElementById("resultPath").innerText = paths[selected].name;
    document.getElementById("finalTime").innerText = formatTime(raceTime);
    document.getElementById("finalScore").innerText = score;
    document.getElementById("finalProbability").innerText = `${Math.round(probability * 100)}%`;
}

/* TIME FORMAT */
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return String(minutes).padStart(2, "0") + ":" + secs.toFixed(2).padStart(5, "0");
}

/* RESTART */
function restart() {
    window.location.reload();
}

/* WAVEFUNCTION GRAPH */
const waveCanvas = document.getElementById("waveCanvas");
const waveContext = waveCanvas.getContext("2d");

function drawWave() {
    const width = waveCanvas.width = waveCanvas.clientWidth * devicePixelRatio;
    const height = waveCanvas.height = waveCanvas.clientHeight * devicePixelRatio;

    waveContext.clearRect(0, 0, width, height);
    waveContext.lineWidth = 2 * devicePixelRatio;

    const probabilities = calculateProbabilities();

    for (let path = 0; path < 3; path++) {
        waveContext.strokeStyle = paths[path].hex;
        waveContext.beginPath();

        for (let x = 0; x < width; x += 3) {
            const normalized = x / width;
            const amplitude = 10 + probabilities[path] * 35;
            const y = height / 2 +
                Math.sin(normalized * Math.PI * 12 + performance.now() * 0.003 + path) * amplitude;

            if (x === 0) {
                waveContext.moveTo(x, y);
            } else {
                waveContext.lineTo(x, y);
            }
        }

        waveContext.stroke();
    }
}

/* ANIMATION */
let previousTime = performance.now();

function animate(now) {
    requestAnimationFrame(animate);

    const dt = Math.min(0.05, (now - previousTime) / 1000);
    previousTime = now;

    drawWave();
    drawBloch();

    /* RACE RUNNING */
    if (gameStarted && !raceFinished) {

        /* Timer */
        raceTime = (now - raceStart) / 1000;
        document.getElementById("time").innerText = formatTime(raceTime);

        /* Current quantum probabilities */
        const probabilities = calculateProbabilities();

        /* Effective speed depends on quantum state */
        const effectiveSpeed =
            0.8 +
            probabilities[0] * 0.3 +
            probabilities[1] * 0.5 +
            probabilities[2] * 0.9;

        /* MAIN CAR MOVEMENT */
        car.position.z -= effectiveSpeed * 12 * dt;

        /* QUANTUM GHOST CARS */
        for (let i = 0; i < 3; i++) {
            const ghost = ghostCars[i];

            if (!measured) {
                ghost.visible = true;
                ghost.position.x = laneX[i];
                ghost.position.z = car.position.z;
                ghost.position.y = car.position.y;

                ghost.traverse(object => {
                    if (object.isMesh) {
                        object.material.opacity = 0.35 + probabilities[i] * 0.55;   // floor keeps every car visible
                    }
                });
            } else {
                /* After measurement only selected path remains */
                ghost.visible = i === currentPath;
            }
        }

        /* AFTER MEASUREMENT */
        if (measured) {
            const targetX = laneX[currentPath];

            car.position.x += (targetX - car.position.x) * dt * 4;

            /* Selected path gets a speed boost */
            car.position.z -= (paths[currentPath].speed - effectiveSpeed) * 10 * dt;
        }

        /* CAMERA (stays behind the car so the environment visibly moves) */
        const desiredCameraZ = car.position.z + 17;
        camera.position.z += (desiredCameraZ - camera.position.z) * dt * 4;

        const desiredCameraX = car.position.x * 0.35;
        camera.position.x += (desiredCameraX - camera.position.x) * dt * 4;

        camera.position.y = 5.5 + Math.sin(now * 0.025) * 0.025;

        camera.lookAt(car.position.x, 1, car.position.z - 30);

        /* SPEEDOMETER */
        let displayedSpeed = effectiveSpeed * 280;

        if (measured) {
            displayedSpeed = paths[currentPath].speed * 300;
        }

        document.getElementById("speed").innerText = Math.round(displayedSpeed);

        /* CAR VIBRATION */
        car.rotation.z = Math.sin(now * 0.012) * 0.012;
        car.position.y = 0.8 + Math.sin(now * 0.018) * 0.025;

        /* PARTICLES */
        const particleArray = particleGeometry.attributes.position.array;

        for (let i = 0; i < particleCount; i++) {
            const index = i * 3 + 2;

            particleArray[index] += effectiveSpeed * 25 * dt;

            if (particleArray[index] > car.position.z + 25) {
                particleArray[index] = car.position.z - 450;
            }
        }

        particleGeometry.attributes.position.needsUpdate = true;

        /* BUILDINGS MOVEMENT */
        buildingGroup.children.forEach(building => {
            building.position.z += effectiveSpeed * 9 * dt;

            if (building.position.z > car.position.z + 40) {
                building.position.z -= 560;
            }
        });

        /* CITY LIGHT MOVEMENT */
        cityLights.children.forEach(light => {
            light.position.z += effectiveSpeed * 7 * dt;

            if (light.position.z > car.position.z + 40) {
                light.position.z -= 560;
            }
        });

        /* ROAD DASH MOVEMENT */
        roadDashGroup.children.forEach(dash => {
            dash.position.z += effectiveSpeed * 12 * dt;

            if (dash.position.z > car.position.z + 30) {
                dash.position.z -= 600;
            }
        });

        /* GATE ANIMATION */
        gateObjects.forEach(gate => {
            const ring = gate.children[3];

            if (ring) {
                ring.rotation.z += dt * 2;
                ring.scale.setScalar(1 + Math.sin(now * 0.003) * 0.08);
            }
        });

        /* FINISH DETECTION */
        if (car.position.z <= finishGroup.position.z) {
            finishRace();
        }
    }

    /* RENDER */
    updateHUD();
    composer.render();
}

/* FINISH RACE */
function finishRace() {
    if (raceFinished) return;

    raceFinished = true;
    notify("🏁 FINISH LINE REACHED");

    /* If measurement hasn't happened, automatically measure */
    if (!measured) {
        measure();
        return;
    }
}

/* KEYBOARD CONTROLS */
window.addEventListener("keydown", event => {
    if (event.key.toLowerCase() === "h") hadamard();
    if (event.key.toLowerCase() === "x") pauliX();
    if (event.key.toLowerCase() === "z") pauliZ();
    if (event.key.toLowerCase() === "u") undoGate();

    if (event.code === "Space") {
        event.preventDefault();
        measure();
    }
});

/* BUTTON CONTROLS */
document.getElementById("startButton").addEventListener("click", openStory);
document.getElementById("hGate").addEventListener("click", hadamard);
document.getElementById("xGate").addEventListener("click", pauliX);
document.getElementById("zGate").addEventListener("click", pauliZ);
document.getElementById("measure").addEventListener("click", measure);
document.getElementById("restartButton").addEventListener("click", restart);

/* WINDOW RESIZE */
window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

/* LOADING SCREEN */
setTimeout(() => {
    const loading = document.getElementById("loading");
    loading.style.opacity = "0";

    setTimeout(() => {
        loading.style.display = "none";
    }, 800);
}, 1200);

/* =========================================================
   REVERSIBILITY: every gate has an exact inverse (U†U = I)
   ========================================================= */
function undoGate() {
    if (measured) { notify("⛔ MEASUREMENT CANNOT BE UNDONE"); return false; }
    const g = gateHistory.pop();
    if (!g) { notify("NOTHING TO REWIND"); return false; }

    if (g === "H") {
        const a = q.alpha, b = q.beta;
        q.alpha = (a + b) / Math.SQRT2;
        q.beta = (a - b) / Math.SQRT2;
        q.phaseA -= Math.PI / 4;
        q.phaseB += Math.PI / 4;
        normalize();
    } else if (g === "X") {
        const t = q.alpha; q.alpha = q.beta; q.beta = t;
        q.phaseA -= Math.PI / 2;
    } else {
        q.beta *= -1;
        q.phaseB -= Math.PI;
    }

    gateCount++;                                        // reversible = free
    quantumEnergy = Math.min(100, quantumEnergy + 8);
    notify(`↶ ${g} UNDONE — GATE REFUNDED`);
    quantumPulse(0xffffff);
    updateHUD();
    if (storyHook) storyHook("U");
    return true;
}

/* =========================================================
   BLOCH SPHERE (state arrow + trajectory trail)
   For real amplitudes: x = 2αβ, z = α² − β²
   ========================================================= */
const blochBox = document.createElement("div");
blochBox.style.cssText = "box-sizing:border-box;width:100%;margin-top:14px;padding:16px;background:linear-gradient(160deg,rgba(6,16,34,.92),rgba(3,8,20,.92));border:1px solid rgba(0,234,255,.35);border-radius:6px;color:#bfefff;font-family:inherit;text-align:center;box-shadow:0 0 18px rgba(0,234,255,.08) inset";
blochBox.innerHTML =
    '<div id="blochHead" title="Drag to move" style="cursor:grab;letter-spacing:.3em;font-size:14px;color:#2fd8f0;text-align:left;margin-bottom:2px">BLOCH SPHERE</div>' +
    '<div style="font-size:11px;letter-spacing:.12em;color:#6f8aa0;text-align:left;margin-bottom:10px">STATE ARROW · DRAG TO MOVE</div>' +
    '<canvas id="blochCanvas" width="360" height="360" style="width:100%;max-width:230px;height:auto;aspect-ratio:1"></canvas>' +
    '<div style="display:flex;justify-content:space-around;margin:10px 0 12px;font-size:13px;letter-spacing:.08em"><span>PATH α <b id="blochA" style="color:#00eaff">100%</b></span><span>PATH β <b id="blochB" style="color:#a855f7">0%</b></span></div>' +
    '<button id="undoBtn" style="width:100%;padding:10px;border:1px solid #00eaff;background:rgba(0,234,255,.08);color:#00eaff;letter-spacing:.2em;cursor:pointer;font-family:inherit">↶ UNDO (U)</button>';

/* Floating card in the bottom-left corner (empty screen space). Drag the title to move it. */
blochBox.style.cssText += ";position:fixed;left:16px;bottom:16px;width:210px;margin:0;padding:12px;z-index:5";
document.body.appendChild(blochBox);

(function makeDraggable() {
    const head = blochBox.querySelector("#blochHead");
    let dx = 0, dy = 0, dragging = false;
    head.addEventListener("pointerdown", e => {
        const r = blochBox.getBoundingClientRect();
        dx = e.clientX - r.left; dy = e.clientY - r.top;
        dragging = true;
        head.setPointerCapture(e.pointerId);
        head.style.cursor = "grabbing";
    });
    head.addEventListener("pointermove", e => {
        if (!dragging) return;
        const x = Math.min(Math.max(0, e.clientX - dx), window.innerWidth - blochBox.offsetWidth);
        const y = Math.min(Math.max(0, e.clientY - dy), window.innerHeight - blochBox.offsetHeight);
        blochBox.style.left = x + "px";
        blochBox.style.top = y + "px";
        blochBox.style.bottom = "auto";
    });
    head.addEventListener("pointerup", () => { dragging = false; head.style.cursor = "grab"; });
})();
document.getElementById("undoBtn").addEventListener("click", undoGate);

const bc = document.getElementById("blochCanvas").getContext("2d");
let bx = 0, bz = 1;
const trail = [];

function drawBloch() {
    const cx = 180, cy = 180, R = 140;
    bx += (2 * q.alpha * q.beta - bx) * 0.15;
    bz += (q.alpha * q.alpha - q.beta * q.beta - bz) * 0.15;
    const px = cx + R * bx, py = cy - R * bz;

    const last = trail[trail.length - 1];
    if (!last || Math.hypot(last[0] - px, last[1] - py) > 2) {
        trail.push([px, py]);
        if (trail.length > 50) trail.shift();
    }

    bc.clearRect(0, 0, 360, 360);
    const sg = bc.createRadialGradient(cx - 40, cy - 50, 10, cx, cy, R);
    sg.addColorStop(0, "rgba(0,234,255,.20)");
    sg.addColorStop(1, "rgba(10,20,50,.10)");
    bc.fillStyle = sg;
    bc.beginPath(); bc.arc(cx, cy, R, 0, Math.PI * 2); bc.fill();
    bc.strokeStyle = "rgba(120,200,255,.5)";
    bc.lineWidth = 2;
    bc.beginPath(); bc.arc(cx, cy, R, 0, Math.PI * 2); bc.stroke();
    bc.beginPath(); bc.ellipse(cx, cy, R, R * 0.3, 0, 0, Math.PI * 2); bc.stroke();
    bc.beginPath(); bc.moveTo(cx, cy - R); bc.lineTo(cx, cy + R); bc.moveTo(cx - R, cy); bc.lineTo(cx + R, cy); bc.stroke();

    bc.font = "bold 24px system-ui";
    bc.fillStyle = "#00eaff"; bc.fillText("α", cx + 10, cy - R + 20);
    bc.fillStyle = "#a855f7"; bc.fillText("β", cx + 10, cy + R - 8);
    bc.fillStyle = "#cde"; bc.fillText("+", cx + R - 22, cy - 8); bc.fillText("−", cx - R + 8, cy - 8);

    trail.forEach((p, i) => {
        bc.fillStyle = `rgba(255,255,255,${(i / trail.length) * 0.5})`;
        bc.beginPath(); bc.arc(p[0], p[1], 3, 0, 7); bc.fill();
    });

    bc.shadowColor = "#00eaff"; bc.shadowBlur = 16;
    bc.strokeStyle = "#fff"; bc.lineWidth = 5;
    bc.beginPath(); bc.moveTo(cx, cy); bc.lineTo(px, py); bc.stroke();
    bc.fillStyle = "#fff";
    bc.beginPath(); bc.arc(px, py, 9, 0, 7); bc.fill();
    bc.shadowBlur = 0;

    const pr = calculateProbabilities();
    $("blochA").textContent = Math.round(pr[0] * 100) + "%";
    $("blochB").textContent = Math.round(pr[1] * 100) + "%";
}

/* =========================================================
   STORY MODE TUTORIAL (plays before the race)
   ========================================================= */
const C = '<b style="color:#00eaff">α</b>', P = '<b style="color:#a855f7">β</b>';

const STEPS = [
    { t: "The car that can't pick a lane",
      x: `Your car sits at a fork with three lanes, and until you look, it hasn't chosen one. Its "mood" is the glowing <b>arrow</b> in the ball on the right, called the <b>Bloch sphere</b>. Arrow up means lane ${C}. Arrow down means lane ${P}. It points up now: 100% ${C}. Your gates are moves that <b>rotate the arrow</b>.` },
    { t: "Gate H: tip the arrow", task: "Press <b>H</b> (or tap the H button).",
      done: ev => ev === "H",
      after: `The arrow tipped to the middle: 50% ${C}, 50% ${P}. H didn't pick a lane. It only rotated the arrow.` },
    { t: "Every move can be undone", reset: true,
      x: `This is the law behind the game. A quantum gate is <b>unitary</b>: it rotates the arrow but never shrinks or stretches it, so no information is lost. Prove it by undoing H.`,
      task: "Press <b>H</b> twice (or H, then <b>U</b>).",
      done: ev => (ev === "H" || ev === "U") && Math.abs(q.beta) < 0.001,
      after: "Back where you started, perfectly. H then H = nothing happened. Mathematicians write this <b>U†U = I</b>." },
    { t: "Gate X: flip the bit", reset: true,
      x: "X turns the arrow upside-down, so α becomes β. Think of flipping a coin over.",
      task: "Press <b>X</b>.", done: ev => ev === "X",
      after: "Top and bottom swapped. Press X again and it flips back: X undoes itself." },
    { t: "Gate Z: twist the phase", reset: true, setup: () => hadamard(),
      x: "The arrow now lies on the middle line, pointing right (+). <b>Z</b> spins it half a turn around the vertical axis.",
      task: "Press <b>Z</b> and watch the arrow.", done: ev => ev === "Z",
      after: `It swung to the left (−). The lane odds didn't change, but the hidden <b>phase</b> did. Phase is what powers interference, and that is how the γ lane gets its chance.` },
    { t: "Rewind the film", reset: true, setup: () => { hadamard(); pauliZ(); pauliX(); },
      x: "You just played three moves: H, Z, X. Because each one is reversible, you can walk the film <b>backwards</b>, undoing the last move first. Each undo even refunds your gate and energy.",
      task: "Press <b>U</b> three times.", done: ev => ev === "U" && gateHistory.length === 0,
      after: "Back at the very start, all gates refunded. Nothing was ever destroyed." },
    { t: "Why normal gates can't do this", reset: true,
      x: "A classical <b>AND</b> gate maps 0·0→0, 0·1→0 and 1·0→0. Three different inputs give one output, so you can't tell which one it was and the information is <b>thrown away</b>. A quantum gate is a one-to-one rotation. Every output comes from exactly one input, so it can always be run backwards. The arrow stays on the sphere's surface forever." },
    { t: "The one-way door", reset: true,
      x: `Only one thing can't be undone: <b>measuring</b> (Space). It collapses the arrow to a single lane at random, and after that U refuses to work.<br><br><b>Race plan:</b> press <b>H</b> then <b>X</b> to boost the green γ lane, measure with <b>Space</b>, and cross the line. Made a mistake? Undo with <b>U</b> before you measure.` }
];

const btnCss = "padding:8px 16px;border-radius:8px;border:1px solid #00eaff;background:rgba(0,234,255,.12);color:#e6f6ff;cursor:pointer;font:14px system-ui";
const story = document.createElement("div");
story.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);width:min(660px,92vw);padding:18px 22px;background:rgba(3,8,20,.92);border:1px solid rgba(0,234,255,.5);border-radius:16px;color:#e6f6ff;font:15px/1.5 system-ui,sans-serif;z-index:50;display:none;box-shadow:0 0 30px rgba(0,234,255,.15)";
story.innerHTML = '<div id="stTag" style="color:#00eaff;font-size:12px"></div>' +
    '<h2 id="stTitle" style="margin:4px 0 8px;font-size:22px"></h2><div id="stText"></div>' +
    '<div id="stTask" style="margin-top:10px;padding:8px 12px;border-radius:8px;background:rgba(0,234,255,.1)"></div>' +
    `<div style="display:flex;justify-content:space-between;margin-top:14px"><button id="stSkip" style="${btnCss}">Skip story</button><button id="stNext" style="${btnCss}">Next →</button></div>`;
document.body.appendChild(story);

const $ = id => document.getElementById(id);
let stepI = 0;

function setNext(on) {
    $("stNext").disabled = !on;
    $("stNext").style.opacity = on ? 1 : 0.35;
    $("stNext").style.cursor = on ? "pointer" : "not-allowed";
}

function enterStep(i) {
    stepI = i;
    const s = STEPS[i];
    storyHook = null;

    if (s.reset) {
        q.alpha = 1; q.beta = 0; q.phaseA = 0; q.phaseB = 0;
        gateHistory.length = 0; gateCount = 12; quantumEnergy = 100;
    }
    if (s.setup) s.setup();
    updateHUD();

    $("stTag").textContent = `Chapter ${i + 1} of ${STEPS.length}`;
    $("stTitle").textContent = s.t;
    $("stText").innerHTML = s.x || "";
    $("stNext").textContent = i === STEPS.length - 1 ? "🏁 Start the race" : "Next →";

    if (s.task) {
        $("stTask").style.display = "block";
        $("stTask").innerHTML = "🎯 " + s.task;
        setNext(false);
        storyHook = ev => {
            if (!s.done(ev)) return;
            storyHook = null;
            $("stTask").innerHTML = "✅ " + s.after;
            setNext(true);
        };
    } else {
        $("stTask").style.display = "none";
        setNext(true);
    }
    if (i === 1) $("stText").innerHTML = `Press <b>H</b> and watch the arrow in the sphere on the right.`;
}

function openStory() {
    $("startScreen").style.display = "none";
    story.style.display = "block";
    enterStep(0);
}

function finishStory() {
    storyHook = null;
    story.style.display = "none";
    startGame();
}

$("stNext").addEventListener("click", () => {
    if (stepI < STEPS.length - 1) enterStep(stepI + 1); else finishStory();
});
$("stSkip").addEventListener("click", finishStory);

/* INITIAL HUD */
updateHUD();

/* START ANIMATION */
animate(performance.now());