const socket = io();
let scene, camera, renderer;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false, isSprinting = false, isCrouching = false;
let prevTime = performance.now();

let yawObject, pitchObject;
let myHp = 100;
let flashbangsCount = 2;
let prevKills = 0;
let myNickname = "Hráč";

let yVelocity = 0;
let isGrounded = true;
const standingHeight = 1.6;
const crouchingHeight = 0.9;
let targetEyeHeight = standingHeight;

const WEAPONS = {
    m4: { name: 'M4A1 Custom', maxAmmo: 30, damage: 18, fireRate: 90, auto: true, zoomFov: 45, bodyPos: [0.2, -0.2, -0.4], aimPos: [0, -0.118, -0.22] },
    sniper: { name: 'Sniperka', maxAmmo: 5, damage: 65, fireRate: 850, auto: false, zoomFov: 18, bodyPos: [0.24, -0.24, -0.48], aimPos: [0, -0.145, -0.22] }
};

let currentWeaponKey = 'm4';
let ammoState = { m4: 30, sniper: 5 };
let isReloading = false;
let isAiming = false;
let isMouseDown = false;
let lastShotTime = 0;

let stamina = 100;
const maxStamina = 100;

let otherPlayers = {};
let obstacles = [];
let bullets = [];
let activeGrenades = [];
let medkits = [];
let m4Group, sniperGroup, currentGunGroup, muzzleFlash;
let flashTimer = 0;
let hitmarkTimeout = null, killNotifyTimeout = null;
let isLocked = false;

let swayX = 0, swayY = 0;
let bobTimer = 0;
let recoilOffset = 0;

// Definice Spawn Pointů pro zamezení spawn killu
const SPAWN_POINTS = [
    { x: -35, z: -35 }, { x: 35, z: -35 },
    { x: -35, z: 35 },  { x: 35, z: 35 },
    { x: 0, z: -30 },    { x: 0, z: 30 },
    { x: -30, z: 0 },    { x: 30, z: 0 }
];

function getRandomSpawn() {
    return SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
}

function initUI() {
    const overlay = document.createElement('div');
    overlay.id = 'nick-overlay';
    overlay.className = 'fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/95 backdrop-blur-md text-white';
    overlay.innerHTML = `
        <div class="bg-slate-900 p-8 rounded-2xl border border-slate-700 shadow-2xl flex flex-col items-center max-w-md w-full">
            <h2 class="text-2xl font-black text-emerald-400 mb-2 uppercase tracking-wider">Vstup do Lesní Arény</h2>
            <p class="text-slate-400 text-sm mb-6">Zadej svou přezdívku pro zobrazení v tabulce a nad postavou.</p>
            <input type="text" id="nick-input" maxlength="12" placeholder="Tvoje přezdívka" class="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-xl text-white font-bold mb-6 focus:outline-none focus:border-emerald-400 text-center">
            <button id="start-btn" class="w-full py-3 bg-emerald-500 hover:bg-emerald-400 font-bold text-slate-950 rounded-xl shadow-lg transition cursor-pointer">VSTOUPIT DO HRY</button>
        </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('start-btn').addEventListener('click', () => {
        const val = document.getElementById('nick-input').value.trim();
        if (val.length > 0) myNickname = val;
        overlay.remove();
        document.body.requestPointerLock();
        init();
    });
}

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    scene.fog = new THREE.FogExp2(0x0f172a, 0.015);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 1000);

    pitchObject = new THREE.Object3D();
    pitchObject.add(camera);

    yawObject = new THREE.Object3D();
    const spawn = getRandomSpawn();
    yawObject.position.set(spawn.x, standingHeight, spawn.z);
    yawObject.add(pitchObject);
    scene.add(yawObject);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('game-container').appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xdcfce7, 0.6);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xfef08a, 0.9);
    dirLight.position.set(20, 40, 20);
    scene.add(dirLight);

    createPlayerGuns();
    buildForestMap();
    initMedkits();
    setupSocketListeners();

    document.body.addEventListener('click', (e) => { 
        if (!isLocked && myHp > 0 && e.target.id !== 'respawn-btn') {
            document.body.requestPointerLock();
        }
    });
    document.addEventListener('pointerlockchange', () => isLocked = document.pointerLockElement === document.body);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('keydown', (e) => handleKey(e.code, true));
    document.addEventListener('keyup', (e) => handleKey(e.code, false));
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('wheel', onWheel);
    window.addEventListener('resize', onWindowResize);

    document.getElementById('respawn-btn').addEventListener('click', respawn);

    animate();
}

function createForestFloorTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1e3a1e'; ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#142814';
    for (let i = 0; i < 300; i++) {
        ctx.fillRect(Math.random() * 256, Math.random() * 256, 4, 4);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

function createTree(x, z) {
    const group = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3f2e1e, roughness: 0.9 });
    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.6 });

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 4), trunkMat);
    trunk.position.y = 2;
    group.add(trunk);

    const leaves1 = new THREE.Mesh(new THREE.ConeGeometry(2.5, 4, 6), leavesMat);
    leaves1.position.y = 4.5;
    const leaves2 = new THREE.Mesh(new THREE.ConeGeometry(2, 3.5, 6), leavesMat);
    leaves2.position.y = 6;
    group.add(leaves1, leaves2);

    group.position.set(x, 0, z);
    scene.add(group);

    const box = new THREE.Box3().setFromObject(trunk);
    obstacles.push(box);
}

function createRock(x, z, scale) {
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8 });
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(scale), rockMat);
    rock.position.set(x, scale * 0.7, z);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    scene.add(rock);

    const box = new THREE.Box3().setFromObject(rock);
    obstacles.push(box);
}

function buildForestMap() {
    const floorTex = createForestFloorTexture();
    floorTex.repeat.set(40, 40);
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), floorMat);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 1 });
    createObstacle(0, 4, -50, 100, 8, 1, wallMat);
    createObstacle(0, 4, 50, 100, 8, 1, wallMat);
    createObstacle(-50, 4, 0, 1, 8, 100, wallMat);
    createObstacle(50, 4, 0, 1, 8, 100, wallMat);

    // Generování stromů po mapě
    for (let i = 0; i < 45; i++) {
        let x = (Math.random() - 0.5) * 80;
        let z = (Math.random() - 0.5) * 80;
        if (Math.abs(x) > 6 || Math.abs(z) > 6) createTree(x, z);
    }

    // Generování balvanů
    for (let i = 0; i < 20; i++) {
        let x = (Math.random() - 0.5) * 80;
        let z = (Math.random() - 0.5) * 80;
        if (Math.abs(x) > 6 || Math.abs(z) > 6) createRock(x, z, 1 + Math.random() * 1.2);
    }
}

function initMedkits() {
    // Jeden velký medkit uprostřed (15s respawn)
    spawnMedkitObject(0, 0, true);

    // Čtyři menší medkity po stranách (25s respawn)
    spawnMedkitObject(-25, -25, false);
    spawnMedkitObject(25, -25, false);
    spawnMedkitObject(-25, 25, false);
    spawnMedkitObject(25, 25, false);
}

function spawnMedkitObject(x, z, isCenter) {
    const group = new THREE.Group();
    const boxMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const crossMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });

    const base = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 0.5), boxMat);
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.12), crossMat);
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.4), crossMat);

    group.add(base, crossH, crossV);
    group.position.set(x, 0.3, z);
    scene.add(group);

    medkits.push({
        group: group,
        x: x,
        z: z,
        active: true,
        isCenter: isCenter,
        timer: 0,
        cooldown: isCenter ? 15 : 25
    });
}

function createNameTag(name) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#34d399';
    ctx.font = 'Bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(name, 128, 42);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(1.8, 0.45, 1);
    sprite.position.y = 1.4;
    return sprite;
}

function respawn() {
    myHp = 100;
    flashbangsCount = 2;
    document.getElementById('flash-count').innerText = '2 / 2';
    ammoState = { m4: WEAPONS.m4.maxAmmo, sniper: WEAPONS.sniper.maxAmmo };
    stamina = maxStamina;
    document.getElementById('hp').innerText = myHp;
    document.getElementById('ammo').innerText = ammoState[currentWeaponKey];
    document.getElementById('stamina-bar').style.width = '100%';
    document.getElementById('death-screen').classList.add('hidden');

    const spawn = getRandomSpawn();
    yawObject.position.set(spawn.x, standingHeight, spawn.z);

    socket.emit('respawnRequest');
    document.body.requestPointerLock();
}

function animate() {
    requestAnimationFrame(animate);
    const time = performance.now();
    const delta = (time - prevTime) / 1000;
    prevTime = time;

    // Kontrola a respawn medkitů
    medkits.forEach(m => {
        if (!m.active) {
            m.timer += delta;
            if (m.timer >= m.cooldown) {
                m.active = true;
                m.group.visible = true;
                m.timer = 0;
            }
        } else {
            m.group.rotation.y += delta * 1.5;
            // Detekce sebrání hráče
            const dist = yawObject.position.distanceTo(m.group.position);
            if (dist < 1.2 && myHp < 100) {
                myHp = 100;
                document.getElementById('hp').innerText = myHp;
                m.active = false;
                m.group.visible = false;
            }
        }
    });

    if (isMouseDown && WEAPONS[currentWeaponKey].auto) shoot();

    if (flashTimer > 0) {
        flashTimer -= delta;
        if (flashTimer <= 0) muzzleFlash.material.opacity = 0;
    }

    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        const moveStep = 90 * delta;
        b.mesh.position.addScaledVector(b.dir, moveStep);
        b.distanceTraveled += moveStep;
        if (b.distanceTraveled >= b.maxDistance) {
            scene.remove(b.mesh);
            bullets.splice(i, 1);
        }
    }

    for (let i = activeGrenades.length - 1; i >= 0; i--) {
        const g = activeGrenades[i];
        g.timer -= delta;
        g.velocity.y -= 15.0 * delta;
        g.mesh.position.addScaledVector(g.velocity, delta);

        if (g.mesh.position.y <= 0.08) {
            g.mesh.position.y = 0.08;
            g.velocity.y *= -0.4; g.velocity.x *= 0.6; g.velocity.z *= 0.6;
        }

        if (g.timer <= 0) {
            if (g.isMaster) {
                socket.emit('flashbangExploded', { x: g.mesh.position.x, y: g.mesh.position.y, z: g.mesh.position.z });
            }
            scene.remove(g.mesh);
            activeGrenades.splice(i, 1);
        }
    }

    targetEyeHeight = isCrouching ? crouchingHeight : standingHeight;

    if (!isGrounded) {
        yawObject.position.y += yVelocity * delta;
        yVelocity -= 18.0 * delta;
        if (yawObject.position.y <= targetEyeHeight) {
            yawObject.position.y = targetEyeHeight;
            yVelocity = 0; isGrounded = true;
        }
    } else {
        yawObject.position.y += (targetEyeHeight - yawObject.position.y) * 0.2;
    }

    const isMoving = moveForward || moveBackward || moveLeft || moveRight;

    swayX *= 0.85; swayY *= 0.85;
    recoilOffset *= 0.8;

    if (isMoving && isGrounded) {
        bobTimer += delta * (isSprinting ? 14 : 9);
    } else {
        bobTimer += delta * 2;
    }

    const bobAmp = isAiming ? 0.0005 : (isMoving ? 0.01 : 0.002);
    const bobX = Math.cos(bobTimer) * bobAmp;
    const bobY = Math.sin(bobTimer * 2) * bobAmp;

    const targetFov = isAiming ? WEAPONS[currentWeaponKey].zoomFov : 75;
    const basePos = isAiming ? WEAPONS[currentWeaponKey].aimPos : WEAPONS[currentWeaponKey].bodyPos;

    camera.fov += (targetFov - camera.fov) * 0.2;
    camera.updateProjectionMatrix();

    let reloadRot = isReloading ? -0.7 : 0;

    currentGunGroup.position.x += (basePos[0] + swayX + bobX - currentGunGroup.position.x) * 0.25;
    currentGunGroup.position.y += (basePos[1] + swayY + bobY - currentGunGroup.position.y) * 0.25;
    currentGunGroup.position.z += (basePos[2] + recoilOffset - currentGunGroup.position.z) * 0.25;
    currentGunGroup.rotation.x += (reloadRot - currentGunGroup.rotation.x) * 0.2;

    Object.keys(otherPlayers).forEach(id => {
        const enemy = otherPlayers[id];
        const bodyPivot = enemy.getObjectByName("bodyPivot");
        const legL = enemy.getObjectByName("leftLeg");
        const legR = enemy.getObjectByName("rightLeg");

        const enemyIsCrouching = enemy.isCrouching || false;

        if (bodyPivot) {
            const targetPivotY = enemyIsCrouching ? 0.15 : 0.5;
            const targetPivotRot = enemyIsCrouching ? 0.25 : 0;
            bodyPivot.position.y += (targetPivotY - bodyPivot.position.y) * 0.2;
            bodyPivot.rotation.x += (targetPivotRot - bodyPivot.rotation.x) * 0.2;
        }

        if (legL && legR) {
            const enemyBob = Math.sin(time * 0.01);
            if (enemyIsCrouching) {
                legL.scale.set(1, 0.5, 1); legR.scale.set(1, 0.5, 1);
                legL.position.y = 0.14; legR.position.y = 0.14;
            } else {
                legL.scale.set(1, 1, 1); legR.scale.set(1, 1, 1);
                legL.position.y = 0.27; legR.position.y = 0.27;
                legL.rotation.x = enemyBob * 0.5;
                legR.rotation.x = -enemyBob * 0.5;
            }
        }
    });

    if (isLocked && myHp > 0) {
        let speedMultiplier = isAiming ? 3.0 : 5.0;

        if (isCrouching) {
            speedMultiplier = 2.2;
        } else if (isSprinting && isMoving && stamina > 0 && !isAiming) {
            speedMultiplier = 9.0;
            stamina = Math.max(0, stamina - delta * 35);
        }

        if (!isSprinting && stamina < maxStamina) {
            stamina = Math.min(maxStamina, stamina + delta * 20);
        }

        document.getElementById('stamina-bar').style.width = `${(stamina / maxStamina) * 100}%`;

        const moveDistance = speedMultiplier * delta;
        const oldPos = yawObject.position.clone();

        if (moveForward) yawObject.translateZ(-moveDistance);
        if (moveBackward) yawObject.translateZ(moveDistance);
        if (moveLeft) yawObject.translateX(-moveDistance);
        if (moveRight) yawObject.translateX(moveDistance);

        if (checkCollision(yawObject.position)) yawObject.position.copy(oldPos);

        socket.emit('playerMove', { 
            x: yawObject.position.x, 
            z: yawObject.position.z, 
            rotation: yawObject.rotation.y,
            isCrouching: isCrouching,
            name: myNickname
        });
    }

    renderer.render(scene, camera);
}

window.onload = initUI;
