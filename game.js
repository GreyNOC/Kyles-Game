const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const crosshair = document.getElementById("crosshair");

const ui = {
  round: document.getElementById("roundValue"),
  score: document.getElementById("scoreValue"),
  best: document.getElementById("bestValue"),
  shots: document.getElementById("shotsValue"),
  ducks: document.getElementById("ducksValue"),
  startOverlay: document.getElementById("startOverlay"),
  roundOverlay: document.getElementById("roundOverlay"),
  roundEyebrow: document.getElementById("roundEyebrow"),
  roundTitle: document.getElementById("roundTitle"),
  roundText: document.getElementById("roundText"),
  startButton: document.getElementById("startButton"),
  nextButton: document.getElementById("nextButton"),
  muteButton: document.getElementById("muteButton"),
};

const state = {
  width: 0,
  height: 0,
  dpr: 1,
  running: false,
  pausedForRound: true,
  round: 1,
  score: 0,
  best: Number(localStorage.getItem("kyle-hunt-best") || 0),
  shots: 3,
  shotsPerFlight: 3,
  ducksLaunched: 0,
  ducksHit: 0,
  ducksPerRound: 10,
  activeDucks: [],
  particles: [],
  floaters: [],
  clouds: [],
  kyle: {
    mode: "idle",
    x: 0,
    y: 0,
    bob: 0,
    message: "KYLE",
    timer: 0,
    rise: 0,
  },
  mouse: { x: 0, y: 0 },
  lastTime: 0,
  nextSpawnAt: 0,
  muted: false,
  audio: null,
};

const kyleLines = {
  start: ["Kyle is watching.", "Make Kyle proud.", "Field duty: Kyle."],
  hit: ["Nice!", "Kyle saw that.", "Clean tag!", "That counts."],
  miss: ["Airball.", "Kyle blinked.", "Try leading it.", "So close."],
  empty: ["Reload moment.", "No shots left.", "Kyle says breathe."],
  clear: ["Kyle approves.", "Round handled.", "Solid work."],
  fail: ["Kyle believes in you.", "Kyle saw effort.", "Run it back."],
};

function resize() {
  state.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  state.width = window.innerWidth;
  state.height = window.innerHeight;
  canvas.width = Math.floor(state.width * state.dpr);
  canvas.height = Math.floor(state.height * state.dpr);
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  state.kyle.x = state.width * 0.5;
  state.kyle.y = state.height - Math.max(72, state.height * 0.12);
  makeClouds();
}

function makeClouds() {
  state.clouds = Array.from({ length: Math.max(4, Math.floor(state.width / 260)) }, (_, index) => ({
    x: (index / Math.max(1, Math.floor(state.width / 260))) * state.width + Math.random() * 90,
    y: 42 + Math.random() * Math.max(90, state.height * 0.18),
    scale: 0.65 + Math.random() * 0.65,
    speed: 4 + Math.random() * 8,
  }));
}

function syncHud() {
  ui.round.textContent = String(state.round);
  ui.score.textContent = String(state.score);
  ui.best.textContent = String(state.best);
  ui.shots.textContent = String(state.shots);
  ui.ducks.textContent = `${state.ducksHit}/${state.ducksPerRound}`;
}

function randomLine(type) {
  const lines = kyleLines[type];
  return lines[Math.floor(Math.random() * lines.length)];
}

function setKyle(mode, message, duration = 1.4) {
  state.kyle.mode = mode;
  state.kyle.message = message;
  state.kyle.timer = duration;
}

function initAudio() {
  if (state.audio) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  state.audio = new AudioContext();
}

function tone(frequency, duration, type = "square", gain = 0.05) {
  if (state.muted || !state.audio) return;
  const oscillator = state.audio.createOscillator();
  const volume = state.audio.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  volume.gain.setValueAtTime(gain, state.audio.currentTime);
  volume.gain.exponentialRampToValueAtTime(0.0001, state.audio.currentTime + duration);
  oscillator.connect(volume).connect(state.audio.destination);
  oscillator.start();
  oscillator.stop(state.audio.currentTime + duration);
}

function playShot() {
  tone(120, 0.06, "sawtooth", 0.09);
  setTimeout(() => tone(70, 0.05, "square", 0.06), 35);
}

function playHit() {
  tone(640, 0.08, "square", 0.06);
  setTimeout(() => tone(920, 0.09, "square", 0.05), 70);
}

function playMiss() {
  tone(160, 0.12, "triangle", 0.045);
}

function startGame() {
  initAudio();
  state.running = true;
  state.pausedForRound = false;
  state.round = 1;
  state.score = 0;
  state.ducksLaunched = 0;
  state.ducksHit = 0;
  state.shotsPerFlight = 3;
  state.shots = state.shotsPerFlight;
  state.activeDucks = [];
  state.particles = [];
  state.floaters = [];
  state.nextSpawnAt = 0.6;
  setKyle("idle", randomLine("start"), 2);
  ui.startOverlay.classList.remove("overlay--visible");
  ui.roundOverlay.classList.remove("overlay--visible");
  syncHud();
}

function nextRound() {
  state.round += 1;
  state.pausedForRound = false;
  state.ducksLaunched = 0;
  state.ducksHit = 0;
  state.shotsPerFlight = Math.max(3, 4 - Math.floor(state.round / 4));
  state.shots = state.shotsPerFlight;
  state.activeDucks = [];
  state.particles = [];
  state.floaters = [];
  state.nextSpawnAt = 0.4;
  setKyle("idle", randomLine("start"), 1.5);
  ui.roundOverlay.classList.remove("overlay--visible");
  syncHud();
}

function spawnDuck() {
  state.shots = state.shotsPerFlight;

  const fromLeft = Math.random() > 0.5;
  const speed = 135 + state.round * 15 + Math.random() * 55;
  const size = Math.max(0.82, 1.14 - state.round * 0.025) + Math.random() * 0.22;
  const y = state.height * (0.23 + Math.random() * 0.35);
  const duck = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    x: fromLeft ? -60 : state.width + 60,
    y,
    vx: (fromLeft ? 1 : -1) * speed,
    vy: -55 - Math.random() * 80,
    gravity: 48 + Math.random() * 18,
    wing: Math.random() * Math.PI * 2,
    size,
    alive: true,
    falling: false,
    escaped: false,
    hue: Math.random() > 0.5 ? "green" : "blue",
    wobble: Math.random() * Math.PI * 2,
  };
  state.activeDucks.push(duck);
  state.ducksLaunched += 1;
}

function shoot(x, y) {
  if (!state.running || state.pausedForRound) return;
  initAudio();

  if (state.shots <= 0) {
    setKyle("empty", randomLine("empty"), 1.1);
    playMiss();
    addFloater(x, y, "EMPTY", "#fff8e8");
    return;
  }

  state.shots -= 1;
  playShot();
  makeMuzzleFlash(x, y);

  let hitDuck = null;
  for (let index = state.activeDucks.length - 1; index >= 0; index -= 1) {
    const duck = state.activeDucks[index];
    if (!duck.alive || duck.falling) continue;
    const radiusX = 50 * duck.size;
    const radiusY = 39 * duck.size;
    const dx = (x - duck.x) / radiusX;
    const dy = (y - duck.y) / radiusY;
    if (dx * dx + dy * dy <= 1) {
      hitDuck = duck;
      break;
    }
  }

  if (hitDuck) {
    hitDuck.alive = false;
    hitDuck.falling = true;
    hitDuck.vx *= 0.16;
    hitDuck.vy = 70;
    const points = 500 + state.round * 100 + state.shots * 50;
    state.score += points;
    state.ducksHit += 1;
    addFloater(hitDuck.x, hitDuck.y - 28, `+${points}`, "#fff8e8");
    burst(hitDuck.x, hitDuck.y, hitDuck.hue === "green" ? "#2f9c58" : "#2d70c9");
    setKyle("cheer", randomLine("hit"), 1.25);
    playHit();
  } else {
    addFloater(x, y, "MISS", "#f8dc7c");
    setKyle("laugh", randomLine("miss"), 1.2);
    playMiss();
  }
  syncHud();
}

function addFloater(x, y, text, color) {
  state.floaters.push({ x, y, text, color, life: 0.95, maxLife: 0.95 });
}

function makeMuzzleFlash(x, y) {
  for (let i = 0; i < 8; i += 1) {
    state.particles.push({
      x,
      y,
      vx: Math.cos((i / 8) * Math.PI * 2) * (80 + Math.random() * 80),
      vy: Math.sin((i / 8) * Math.PI * 2) * (80 + Math.random() * 80),
      radius: 2 + Math.random() * 3,
      color: i % 2 ? "#f8dc7c" : "#e33b2e",
      life: 0.22,
      maxLife: 0.22,
    });
  }
}

function burst(x, y, color) {
  for (let i = 0; i < 18; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 45 + Math.random() * 140;
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 2 + Math.random() * 4,
      color,
      life: 0.65,
      maxLife: 0.65,
    });
  }
}

function update(dt) {
  if (!state.running) return;

  for (const cloud of state.clouds) {
    cloud.x += cloud.speed * dt;
    if (cloud.x > state.width + 140) cloud.x = -150;
  }

  state.kyle.bob += dt * 4;
  state.kyle.timer = Math.max(0, state.kyle.timer - dt);
  const wantsRise = state.kyle.timer > 0 || state.activeDucks.some((duck) => duck.falling);
  state.kyle.rise += ((wantsRise ? 1 : 0.45) - state.kyle.rise) * Math.min(1, dt * 5);
  if (state.kyle.timer === 0) {
    state.kyle.mode = "idle";
    state.kyle.message = "KYLE";
  }

  if (!state.pausedForRound) {
    state.nextSpawnAt -= dt;
    const maxDucks = state.round > 3 ? 2 : 1;
    if (state.nextSpawnAt <= 0 && state.ducksLaunched < state.ducksPerRound && state.activeDucks.length < maxDucks) {
      spawnDuck();
      state.nextSpawnAt = Math.max(0.75, 1.45 - state.round * 0.06) + Math.random() * 0.7;
    }
  }

  for (const duck of state.activeDucks) {
    duck.wing += dt * (duck.falling ? 4 : 16);
    duck.wobble += dt * 2;
    if (duck.falling) {
      duck.vy += 430 * dt;
      duck.y += duck.vy * dt;
      duck.x += duck.vx * dt;
    } else {
      duck.vy += duck.gravity * dt;
      duck.x += duck.vx * dt;
      duck.y += (duck.vy + Math.sin(duck.wobble) * 60) * dt;
      if (duck.y < state.height * 0.12) duck.vy = Math.abs(duck.vy) + 20;
      if (duck.y > state.height * 0.62) duck.vy = -Math.abs(duck.vy) - 30;
      if (duck.x < -100 || duck.x > state.width + 100 || duck.y < -90) {
        duck.escaped = true;
        duck.alive = false;
      }
    }
  }

  state.activeDucks = state.activeDucks.filter((duck) => duck.y < state.height + 130 && !duck.escaped);

  for (const particle of state.particles) {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 140 * dt;
  }
  state.particles = state.particles.filter((particle) => particle.life > 0);

  for (const floater of state.floaters) {
    floater.life -= dt;
    floater.y -= 44 * dt;
  }
  state.floaters = state.floaters.filter((floater) => floater.life > 0);

  const launchedAll = state.ducksLaunched >= state.ducksPerRound;
  const noDucks = state.activeDucks.length === 0;
  if (!state.pausedForRound && launchedAll && noDucks) {
    finishRound();
  }
}

function finishRound() {
  state.pausedForRound = true;
  const needed = Math.min(8, 4 + Math.floor(state.round * 0.8));
  const passed = state.ducksHit >= needed;
  const bonus = passed ? state.round * state.ducksHit * 75 : 0;
  state.score += bonus;
  state.best = Math.max(state.best, state.score);
  localStorage.setItem("kyle-hunt-best", String(state.best));

  ui.roundEyebrow.textContent = passed ? "Round cleared" : "Round over";
  ui.roundTitle.textContent = passed ? randomLine("clear") : "Kyle Says Again";
  ui.roundText.textContent = passed
    ? `You tagged ${state.ducksHit} of ${state.ducksPerRound}. Bonus: ${bonus}.`
    : `You tagged ${state.ducksHit} of ${state.ducksPerRound}. Kyle needs ${needed} to move on.`;
  ui.nextButton.textContent = passed ? "Next Round" : "Retry";
  ui.roundOverlay.classList.add("overlay--visible");
  setKyle(passed ? "cheer" : "laugh", passed ? randomLine("clear") : randomLine("fail"), 4);
  syncHud();
}

function draw() {
  drawScene();
  for (const duck of state.activeDucks) drawDuck(duck);
  drawParticles();
  drawKyle();
  drawFloaters();
}

function drawScene() {
  const horizon = state.height * 0.68;
  const grassTop = state.height * 0.72;

  const sky = ctx.createLinearGradient(0, 0, 0, state.height);
  sky.addColorStop(0, "#80d7ff");
  sky.addColorStop(0.62, "#b9edff");
  sky.addColorStop(1, "#f7e29c");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, state.width, state.height);

  ctx.fillStyle = "#fff8e8";
  for (const cloud of state.clouds) drawCloud(cloud);

  ctx.fillStyle = "#6abf57";
  ctx.fillRect(0, horizon, state.width, state.height - horizon);

  ctx.fillStyle = "#2f9c58";
  ctx.beginPath();
  ctx.moveTo(0, grassTop);
  for (let x = 0; x <= state.width + 24; x += 24) {
    const y = grassTop + Math.sin(x * 0.035) * 10;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(state.width, state.height);
  ctx.lineTo(0, state.height);
  ctx.closePath();
  ctx.fill();

  drawGrassLayer(grassTop - 20, "#3fa34d", 34, 22);
  drawGrassLayer(grassTop + 10, "#237c3d", 28, 34);
  drawGrassLayer(grassTop + 48, "#1d6835", 22, 46);
}

function drawCloud(cloud) {
  ctx.save();
  ctx.translate(cloud.x, cloud.y);
  ctx.scale(cloud.scale, cloud.scale);
  ctx.globalAlpha = 0.88;
  ctx.beginPath();
  ctx.ellipse(-45, 12, 36, 20, 0, 0, Math.PI * 2);
  ctx.ellipse(-10, 0, 44, 26, 0, 0, Math.PI * 2);
  ctx.ellipse(34, 12, 34, 19, 0, 0, Math.PI * 2);
  ctx.ellipse(2, 22, 68, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGrassLayer(y, color, gap, height) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, state.height);
  for (let x = -gap; x <= state.width + gap; x += gap) {
    ctx.lineTo(x + gap * 0.45, y - height - Math.sin(x * 0.05) * 8);
    ctx.lineTo(x + gap, state.height);
  }
  ctx.closePath();
  ctx.fill();
}

function drawDuck(duck) {
  const direction = duck.vx >= 0 ? 1 : -1;
  const wingLift = Math.sin(duck.wing) * 0.8;
  const body = duck.hue === "green" ? "#2f9c58" : "#2d70c9";
  const dark = duck.hue === "green" ? "#1c6839" : "#1b477e";

  ctx.save();
  ctx.translate(duck.x, duck.y);
  ctx.scale(direction * duck.size, duck.size);
  if (duck.falling) ctx.rotate(Math.min(Math.PI * 0.72, duck.vy * 0.006));

  ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
  ctx.beginPath();
  ctx.ellipse(0, 28, 30, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 0, 30, 18, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(-4, -2, 20, 11, -0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(-6, -8);
  ctx.rotate(-0.6 - wingLift);
  ctx.fillStyle = "#f2d55c";
  ctx.beginPath();
  ctx.ellipse(0, 0, 12, 31, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d5a833";
  ctx.fillRect(-2, 0, 4, 25);
  ctx.restore();

  ctx.save();
  ctx.translate(-2, 10);
  ctx.rotate(0.6 + wingLift);
  ctx.fillStyle = "#f8dc7c";
  ctx.beginPath();
  ctx.ellipse(0, 0, 11, 27, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = "#334433";
  ctx.beginPath();
  ctx.arc(29, -14, 16, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(33, -18, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#101010";
  ctx.beginPath();
  ctx.arc(34, -18, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#e8832e";
  ctx.beginPath();
  ctx.moveTo(43, -13);
  ctx.lineTo(62, -7);
  ctx.lineTo(43, 0);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#e8832e";
  ctx.fillRect(-19, 12, 6, 17);
  ctx.fillRect(-6, 13, 6, 17);
  ctx.restore();
}

function drawKyle() {
  const k = state.kyle;
  const baseY = k.y + 80 - k.rise * 82;
  const bob = Math.sin(k.bob) * 3;
  const isLaugh = k.mode === "laugh";
  const isCheer = k.mode === "cheer";
  const isEmpty = k.mode === "empty";

  ctx.save();
  ctx.translate(k.x, baseY + bob);

  ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
  ctx.beginPath();
  ctx.ellipse(0, 102, 84, 18, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#355f3d";
  ctx.fillRect(-42, 52, 84, 56);
  ctx.fillStyle = "#233f2b";
  ctx.fillRect(-34, 62, 68, 46);

  ctx.fillStyle = "#efbe83";
  ctx.beginPath();
  ctx.ellipse(0, 18, 35, 40, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#5a3522";
  ctx.beginPath();
  ctx.ellipse(0, -8, 37, 21, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(-35, -8, 70, 10);

  ctx.fillStyle = "#234f8a";
  ctx.fillRect(-39, -24, 78, 18);
  ctx.beginPath();
  ctx.moveTo(4, -24);
  ctx.lineTo(62, -19);
  ctx.lineTo(4, -11);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#f8dc7c";
  ctx.font = "900 12px Trebuchet MS, Arial";
  ctx.textAlign = "center";
  ctx.fillText("K", 0, -10);

  ctx.fillStyle = "#18120d";
  if (isLaugh) {
    ctx.fillRect(-17, 11, 12, 4);
    ctx.fillRect(7, 11, 12, 4);
  } else {
    ctx.beginPath();
    ctx.arc(-13, 9, 3, 0, Math.PI * 2);
    ctx.arc(13, 9, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "#18120d";
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (isLaugh) {
    ctx.arc(0, 24, 12, 0, Math.PI);
  } else if (isEmpty) {
    ctx.moveTo(-10, 30);
    ctx.quadraticCurveTo(0, 23, 10, 30);
  } else {
    ctx.arc(0, 20, 12, 0.15, Math.PI - 0.15);
  }
  ctx.stroke();

  ctx.strokeStyle = "#efbe83";
  ctx.lineWidth = 13;
  ctx.lineCap = "round";
  ctx.beginPath();
  if (isCheer) {
    ctx.moveTo(-39, 62);
    ctx.lineTo(-72, 18);
    ctx.moveTo(39, 62);
    ctx.lineTo(72, 18);
  } else {
    ctx.moveTo(-39, 64);
    ctx.lineTo(-72, 76);
    ctx.moveTo(39, 64);
    ctx.lineTo(72, 76);
  }
  ctx.stroke();

  drawKyleSign(k.message, -64, -82);
  ctx.restore();
}

function drawKyleSign(text, x, y) {
  const width = Math.max(112, text.length * 11 + 26);
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#7a4b27";
  ctx.fillRect(width * 0.5 - 4, 42, 8, 78);
  ctx.fillStyle = "#fff8e8";
  ctx.strokeStyle = "#14120f";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(0, 0, width, 46, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#14120f";
  ctx.font = "900 16px Trebuchet MS, Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text.toUpperCase(), width * 0.5, 24);
  ctx.restore();
}

function drawParticles() {
  for (const particle of state.particles) {
    const alpha = Math.max(0, particle.life / particle.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawFloaters() {
  ctx.save();
  ctx.font = "900 20px Trebuchet MS, Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const floater of state.floaters) {
    const alpha = Math.max(0, floater.life / floater.maxLife);
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#14120f";
    ctx.fillStyle = floater.color;
    ctx.strokeText(floater.text, floater.x, floater.y);
    ctx.fillText(floater.text, floater.x, floater.y);
  }
  ctx.restore();
}

function loop(time) {
  const dt = Math.min(0.033, (time - state.lastTime) / 1000 || 0);
  state.lastTime = time;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function pointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

window.addEventListener("resize", resize);

window.addEventListener("pointermove", (event) => {
  const pos = pointerPosition(event);
  state.mouse = pos;
  crosshair.style.left = `${event.clientX}px`;
  crosshair.style.top = `${event.clientY}px`;
});

canvas.addEventListener("pointerdown", (event) => {
  const pos = pointerPosition(event);
  shoot(pos.x, pos.y);
});

ui.startButton.addEventListener("click", startGame);
ui.nextButton.addEventListener("click", () => {
  if (ui.nextButton.textContent === "Retry") {
    startGame();
  } else {
    nextRound();
  }
});

ui.muteButton.addEventListener("click", () => {
  state.muted = !state.muted;
  ui.muteButton.textContent = state.muted ? "Sound Off" : "Sound On";
  ui.muteButton.setAttribute("aria-pressed", String(state.muted));
});

window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "r") startGame();
  if (event.key === " ") shoot(state.mouse.x || state.width / 2, state.mouse.y || state.height / 2);
});

resize();
syncHud();
requestAnimationFrame(loop);
