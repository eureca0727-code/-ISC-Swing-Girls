// Swing Girls & Boys — 인터랙티브 재즈 잼 (p5.js)
// 화면: 종이를 오려 붙인 무대 위에 악기 3개 (콘트라베이스 · 피아노 · 트럼펫)
//       악기는 인형극처럼 초당 8컷으로 뚝뚝 끊기며 박자에 맞춰 좌우로 흔들림
// 소리: Tone.js (piano.js, audio.js)

const COL = {
  ink: "#f3e9dc",
  muted: "#d8c2a8",
  gold: "#e8b04a",
  goldHot: "#ffd27a",
  red: "#c8323f",
  paper: "#fbf3e4",
  inkDark: "#2a1a10",
};
const BOIL_MS = 125; // 한 컷 길이 (초당 8컷)

let scene = "opening";   // opening → loading → play
let curtainT0 = null;    // 오프닝 막이 열리기 시작한 시각(ms)
let statusMsg = "";
let sourceNote = "";
let currentChord = PROGRESSION[0].name;
let nextChord = PROGRESSION[1].name;
let chordPopAt = -1000;
let beat = -1;
let fillAt = -10000;     // 드럼이 마지막으로 대답한 시각(ms)
let mouseKey = null;

let ui, bpmSlider, bpmLabel, drumBtn, quantBtn;
let velvetDark, velvetLight;
let grain;               // 종이 질감
let floorEdge = [];      // 가위로 자른 듯 울퉁불퉁한 바닥 윗선
let L = {};              // 레이아웃 값

const held = new Map();  // 누르고 있는 키 code → { notes, strong, time }
const particles = [];    // 피아노에서 튀어 오르는 종이 자모들

const chordByCode = Object.fromEntries(CHORD_KEYS.map((k) => [k.code, k]));
const melodyByCode = Object.fromEntries(MELODY_KEYS.map((k) => [k.code, k]));

// 무대 위 악기. 그림은 assets/ 의 파일 → PNG 등으로 바꿔 끼워도 됨 (비율만 맞추면 됨)
const INSTRUMENTS = [
  {
    id: "bass", name: "콘트라베이스", how: "마우스 · 준비 중 (지금은 자동 반주)",
    soon: "마우스 연주는 곧 열려요!", src: "assets/bass.svg", ratio: 240 / 460,
    sway: 3, phase: 0, tagRot: -2,
  },
  {
    id: "piano", name: "피아노", how: "키보드 · 자음은 코드, 모음은 멜로디",
    src: "assets/piano.svg", ratio: 420 / 300,
    sway: 1.6, phase: Math.PI / 2, tagRot: 1.5,
  },
  {
    id: "trumpet", name: "트럼펫", how: "카메라 · 준비 중",
    soon: "카메라 연주는 곧 열려요!", src: "assets/trumpet.svg", ratio: 420 / 220,
    sway: 4, phase: Math.PI, tagRot: -1, comingSoon: true,
  },
];
for (const i of INSTRUMENTS) Object.assign(i, { frame: -1, angle: 0, dx: 0, dy: 0, hitAt: -1e4, hitPower: 1, hitDir: 1, bubbleAt: -1e4 });
const inst = (id) => INSTRUMENTS.find((i) => i.id === id);

// ================= p5 기본 =================
function preload() {
  for (const i of INSTRUMENTS) i.img = loadImage(i.src);
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  velvetDark = color("#5e0c15");
  velvetLight = color("#a11b29");
  buildControls();
  layout();
  // 주소 끝에 ?start 를 붙이면 막을 건너뛰고 바로 시작 (테스트용)
  if (new URLSearchParams(location.search).has("start")) startShow();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  layout();
}

function draw() {
  drawWall();
  drawSpotlights();
  drawFloor();
  drawStand(inst("trumpet"));
  for (const i of INSTRUMENTS) drawInstrument(i);
  for (const i of INSTRUMENTS) drawTag(i);
  for (const i of INSTRUMENTS) drawBubble(i);
  drawParticles();
  drawSideCurtains();
  drawHeader();
  drawGuide();
  drawGrain();
  drawCurtain();
  updateCursor();
}

// ================= 레이아웃 =================
function layout() {
  const side = max(28, width * 0.07);   // 양옆 커튼 폭
  const floorY = height * 0.74;

  const bass = inst("bass");
  bass.h = min(height * 0.5, 430);
  bass.w = bass.h * bass.ratio;
  bass.cx = width * 0.23;
  bass.baseY = floorY + 8;

  const piano = inst("piano");
  piano.w = min(width * 0.36, 500);
  piano.h = piano.w / piano.ratio;
  piano.cx = width * 0.5;
  piano.baseY = floorY + 8 + piano.h * 0.08; // 그림 아래 여백만큼 내려서 바퀴가 바닥에 닿게

  const tp = inst("trumpet");
  tp.w = min(width * 0.24, 330);
  tp.h = tp.w / tp.ratio;
  tp.cx = width * 0.77;
  tp.baseY = floorY - height * 0.17; // 트럼펫은 스탠드 위에

  // 바닥 윗선: 매번 같은 모양이 나오도록 시드 고정
  randomSeed(7);
  floorEdge = [];
  for (let x = -20; x <= width + 40; x += 22) floorEdge.push([x, floorY + random(-4, 4)]);
  randomSeed();

  // 종이 질감: 작은 노이즈 이미지를 만들어 화면 전체에 얇게 덮음
  grain = createGraphics(ceil(width / 3), ceil(height / 3));
  grain.pixelDensity(1);
  grain.loadPixels();
  for (let p = 0; p < grain.pixels.length; p += 4) {
    const v = 128 + random(-60, 60);
    grain.pixels[p] = grain.pixels[p + 1] = grain.pixels[p + 2] = v;
    grain.pixels[p + 3] = 255;
  }
  grain.updatePixels();

  L = { side, floorY, valance: 36 };
}

// ================= 그림자 도우미 =================
// 캔버스 그림자 오프셋은 화면 픽셀 단위라 pixelDensity를 곱해줌
function paperShadow(dx = 7, dy = 9, blur = 3, alpha = 0.5) {
  const pd = pixelDensity();
  const ctx = drawingContext;
  ctx.shadowColor = `rgba(15, 6, 2, ${alpha})`;
  ctx.shadowOffsetX = dx * pd;
  ctx.shadowOffsetY = dy * pd;
  ctx.shadowBlur = blur * pd;
}
function noShadow() {
  const ctx = drawingContext;
  ctx.shadowColor = "transparent";
  ctx.shadowOffsetX = ctx.shadowOffsetY = ctx.shadowBlur = 0;
}

// 악기가 방금 연주됐으면 1 → 0으로 줄어드는 값
function hitAmount(i) {
  const k = constrain((millis() - i.hitAt) / 280, 0, 1);
  return (1 - k) * (1 - k) * i.hitPower;
}

// ================= 무대 =================
function drawWall() {
  const ctx = drawingContext;
  const g = ctx.createRadialGradient(width / 2, height * 0.3, 0, width / 2, height * 0.3, max(width, height) * 0.8);
  g.addColorStop(0, "#63300f");
  g.addColorStop(0.7, "#170b06");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}

// 악기마다 위에서 떨어지는 조명. 연주하면 잠깐 밝아짐
function drawSpotlights() {
  const ctx = drawingContext;
  noStroke();
  for (const i of INSTRUMENTS) {
    const boost = hitAmount(i) * 0.12;
    const topW = 30;
    const botW = max(i.w, 120) * 0.75;
    const g = ctx.createLinearGradient(0, 0, 0, L.floorY);
    g.addColorStop(0, `rgba(255, 220, 160, ${0.02 + boost})`);
    g.addColorStop(1, `rgba(255, 210, 140, ${0.13 + boost})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(i.cx - topW, 0);
    ctx.lineTo(i.cx + topW, 0);
    ctx.lineTo(i.cx + botW, L.floorY + 14);
    ctx.lineTo(i.cx - botW, L.floorY + 14);
    ctx.closePath();
    ctx.fill();

    fill(255, 214, 150, 50 + boost * 400);
    ellipse(i.cx, L.floorY + 14, botW * 2.1, 36);
  }
}

function drawFloor() {
  paperShadow(0, -4, 6, 0.35);
  noStroke();
  fill("#3b1e0d");
  beginShape();
  for (const [x, y] of floorEdge) vertex(x, y);
  vertex(width + 40, height + 10);
  vertex(-20, height + 10);
  endShape(CLOSE);
  noShadow();

  // 종이 테두리 + 나무판 줄
  noFill();
  stroke(COL.paper);
  strokeWeight(3);
  beginShape();
  for (const [x, y] of floorEdge) vertex(x, y);
  endShape();
  stroke(30, 14, 6, 120);
  strokeWeight(2);
  for (let k = 1; k <= 3; k++) {
    const y = L.floorY + k * (height - L.floorY) / 4;
    line(0, y, width, y);
  }
}

function drawStand(i) {
  const top = i.baseY - i.h * 0.22; // 트럼펫 아래 관에 닿는 높이
  const bottom = L.floorY + 10;
  const legs = [[i.cx - 26, bottom], [i.cx + 26, bottom], [i.cx, bottom + 6]];
  paperShadow(5, 6, 2, 0.45);
  strokeCap(ROUND);
  stroke(COL.paper);
  strokeWeight(10);
  line(i.cx, top, i.cx, bottom - 18);
  for (const [x, y] of legs) line(i.cx, bottom - 18, x, y);
  noShadow();
  stroke("#2b2a30");
  strokeWeight(4);
  line(i.cx, top, i.cx, bottom - 18);
  for (const [x, y] of legs) line(i.cx, bottom - 18, x, y);
}

// ================= 악기 =================
function drawInstrument(i) {
  const now = millis();
  // 한 컷(125ms)마다 자세를 새로 정함 → 종이 인형처럼 뚝뚝 끊기는 움직임
  const frame = Math.floor(now / BOIL_MS);
  if (frame !== i.frame) {
    i.frame = frame;
    const playing = scene === "play" && Tone.Transport.state === "started";
    const beats = playing ? Tone.Transport.ticks / Tone.Transport.PPQ : now / 700;
    const sway = Math.sin(beats * Math.PI + i.phase) * i.sway; // 2박에 한 번 좌우 왕복
    i.angle = radians(sway + random(-0.5, 0.5));
    i.dx = random(-1.2, 1.2);
    i.dy = random(-0.8, 0.8);
  }

  const hit = hitAmount(i);
  push();
  translate(i.cx + i.dx, i.baseY + i.dy - hit * 16); // 아래쪽 가운데를 축으로
  rotate(i.angle + hit * 0.05 * i.hitDir);
  scale(1 + hit * 0.05);
  paperShadow();
  if (i.comingSoon) tint(255, 215);
  image(i.img, -i.w / 2, -i.h, i.w, i.h);
  noTint();
  noShadow();
  pop();
}

// 악기 밑의 종이 이름표
function drawTag(i) {
  const y = L.floorY + 50;
  textFont("sans-serif");
  textStyle(BOLD);
  textSize(16);
  const w1 = textWidth(i.name);
  textStyle(NORMAL);
  textSize(12);
  const w2 = textWidth(i.how);
  const w = max(w1, w2) + 30;
  const h = 50;
  const jitter = (Math.floor(millis() / BOIL_MS) + i.phase * 3) % 2 ? 0.3 : -0.3;

  push();
  translate(i.cx, y);
  rotate(radians(i.tagRot + jitter));
  paperShadow(4, 5, 2, 0.45);
  noStroke();
  fill(COL.paper);
  rect(-w / 2, -h / 2, w, h, 3);
  noShadow();
  fill(i.comingSoon || i.id === "bass" ? "#a8998a" : COL.red);
  rect(-w / 2, -h / 2, 6, h, 3, 0, 0, 3);

  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(16);
  fill(COL.inkDark);
  text(i.name, 3, -9);
  textStyle(NORMAL);
  textSize(12);
  fill("#7a5a40");
  text(i.how, 3, 11);
  pop();
}

// 아직 준비 중인 악기를 누르면 뜨는 말풍선
function drawBubble(i) {
  const t = millis() - i.bubbleAt;
  if (!i.soon || t > 1500) return;
  const x = i.cx;
  const y = i.baseY - i.h - 30;
  textFont("sans-serif");
  textStyle(BOLD);
  textSize(15);
  const w = textWidth(i.soon) + 28;
  push();
  translate(x, y);
  rotate(radians(-2));
  paperShadow(4, 5, 2, 0.45);
  noStroke();
  fill(COL.paper);
  rect(-w / 2, -20, w, 40, 8);
  triangle(-8, 18, 8, 18, 0, 32);
  noShadow();
  fill(COL.inkDark);
  textAlign(CENTER, CENTER);
  text(i.soon, 0, 0);
  pop();
}

// ================= 종이 자모 =================
function spawnLetter(ch, kind, strong) {
  const p = inst("piano");
  particles.push({
    ch,
    col: kind === "chord" ? COL.red : COL.gold,
    x: p.cx + random(-p.w * 0.3, p.w * 0.3),
    y: p.baseY - p.h * 0.75,
    vx: random(-0.7, 0.7),
    vy: random(-2.6, -1.6),
    rot: random(-0.35, 0.35),
    born: millis(),
    size: strong ? 46 : 34,
  });
}

function drawParticles() {
  const now = millis();
  const frame = Math.floor(now / BOIL_MS);
  textFont("sans-serif");
  textStyle(BOLD);
  textAlign(CENTER, CENTER);
  strokeJoin(ROUND);
  for (let k = particles.length - 1; k >= 0; k--) {
    const p = particles[k];
    const age = (now - p.born) / 1600;
    if (age >= 1) {
      particles.splice(k, 1);
      continue;
    }
    p.x += p.vx;
    p.y += p.vy;
    p.vy *= 0.985;
    const a = age < 0.6 ? 255 : 255 * (1 - (age - 0.6) / 0.4);
    push();
    translate(p.x, p.y);
    rotate(p.rot + (frame % 2 ? 0.06 : -0.06));
    paperShadow(3, 4, 1, 0.4 * (a / 255));
    textSize(p.size);
    stroke(251, 243, 228, a);
    strokeWeight(p.size * 0.26);
    const c = color(p.col);
    c.setAlpha(a);
    fill(c);
    text(p.ch, 0, 0);
    noShadow();
    pop();
  }
}

// ================= 무대 커튼 (양옆 + 위) =================
function drawSideCurtains() {
  const s = L.side;
  paperShadow(0, 6, 8, 0.5);
  stroke(COL.paper);
  strokeWeight(3);
  fill("#8f1622");
  // 왼쪽: 가운데가 묶인 듯 안쪽으로 오목
  beginShape();
  vertex(-5, -5);
  for (let y = 0; y <= height + 10; y += 20) {
    const x = s * (1 - 0.35 * Math.sin((Math.PI * y) / height)) + 4 * Math.sin(y * 0.05);
    vertex(x, y);
  }
  vertex(-5, height + 10);
  endShape(CLOSE);
  // 오른쪽
  beginShape();
  vertex(width + 5, -5);
  for (let y = 0; y <= height + 10; y += 20) {
    const x = width - s * (1 - 0.35 * Math.sin((Math.PI * y) / height)) - 4 * Math.sin(y * 0.05 + 1);
    vertex(x, y);
  }
  vertex(width + 5, height + 10);
  endShape(CLOSE);

  // 위쪽 물결 커튼
  const v = L.valance;
  beginShape();
  vertex(-5, -5);
  vertex(width + 5, -5);
  vertex(width + 5, v);
  const step = 48;
  for (let x = width; x >= -step; x -= step) {
    for (let a = 0; a <= Math.PI; a += Math.PI / 6) {
      vertex(x - step / 2 + (step / 2) * Math.cos(a), v + (step / 3) * Math.sin(a));
    }
  }
  vertex(-5, v);
  endShape(CLOSE);
  noShadow();

  // 주름
  stroke(90, 10, 18, 140);
  strokeWeight(2);
  for (let k = 1; k <= 2; k++) {
    line(s * 0.3 * k, 0, s * 0.22 * k, height);
    line(width - s * 0.3 * k, 0, width - s * 0.22 * k, height);
  }
}

// ================= 글자 정보 =================
function drawHeader() {
  const x0 = L.side + 28;
  noStroke();
  textFont("sans-serif");
  textStyle(NORMAL);
  textAlign(LEFT, BASELINE);
  textSize(13);
  fill(COL.muted);
  text("지금 코드", x0, L.valance + 44);

  // 코드가 바뀌거나 자음을 치면 살짝 커졌다가 돌아옴
  const t = constrain((millis() - chordPopAt) / 250, 0, 1);
  push();
  translate(x0, L.valance + 92);
  scale(lerp(1.12, 1, t));
  textFont("Georgia");
  textStyle(ITALIC);
  textSize(48);
  fill(lerpColor(color(COL.goldHot), color(COL.gold), t));
  text(currentChord, 0, 0);
  const cw = textWidth(currentChord);
  textFont("sans-serif");
  textStyle(NORMAL);
  textSize(15);
  fill(COL.muted);
  text("다음  " + nextChord, cw + 18, 0);
  pop();

  // 박자 표시 4개 (코드 이름 아래)
  const cx = x0 + 7;
  const by = L.valance + 122;
  for (let k = 0; k < 4; k++) {
    stroke(COL.gold);
    strokeWeight(1.5);
    if (k === beat) {
      drawingContext.shadowColor = COL.gold;
      drawingContext.shadowBlur = 10;
      fill(COL.gold);
    } else {
      noFill();
    }
    circle(cx + k * 24, by, 14);
    noShadow();
  }

  // 밴드가 지금 어떻게 반응하고 있는지
  let status = "";
  let a = 255;
  const sinceFill = millis() - fillAt;
  if (sinceFill < 1800) {
    status = "드럼이 대답!";
    a = 255 * (1 - max(0, sinceFill - 1200) / 600);
  } else if (Band.activity > 0.35) {
    status = "밴드가 받쳐주는 중";
  }
  if (status) {
    noStroke();
    textFont("sans-serif");
    textAlign(LEFT, CENTER);
    textSize(14);
    fill(255, 210, 122, a);
    text(status, cx + 4 * 24, by);
  }
}

function drawGuide() {
  noStroke();
  textFont("sans-serif");
  textStyle(NORMAL);
  textAlign(CENTER, CENTER);
  textSize(14);
  fill(COL.muted);
  text("자음 = 코드 · 모음 = 멜로디 · Shift = 더 세게 · 자기 이름을 한글로 타이핑해 보세요", width / 2, height - 30);
  if (sourceNote) {
    textSize(12);
    text(sourceNote, width / 2, height - 54);
  }
}

function drawGrain() {
  blendMode(OVERLAY);
  tint(255, 40);
  image(grain, 0, 0, width, height);
  noTint();
  blendMode(BLEND);
}

function updateCursor() {
  if (scene !== "play") return cursor(ARROW);
  cursor(instrumentAt(mouseX, mouseY) ? HAND : ARROW);
}

function instrumentAt(x, y) {
  return INSTRUMENTS.find((i) => x > i.cx - i.w / 2 && x < i.cx + i.w / 2 && y > i.baseY - i.h && y < i.baseY);
}

// ================= 오프닝 막 =================
// 처음엔 닫혀 있다가 시작하면 양쪽으로 열림
function drawCurtain() {
  let e = 0;
  if (curtainT0 !== null) {
    const t = constrain((millis() - curtainT0) / 1800, 0, 1);
    if (t >= 1) return;
    e = easeInOutCubic(t);
  }
  const half = width / 2 + 2;
  const off = e * half;
  drawCurtainHalf(-off, half, 0);
  drawCurtainHalf(width / 2 - 2 + off, half, PI);

  const a = 255 * (1 - constrain(e * 3, 0, 1));
  if (a <= 0) return;
  const cy = height / 2;
  noStroke();
  textAlign(CENTER, CENTER);
  drawingContext.shadowColor = "rgba(0, 0, 0, 0.6)";
  drawingContext.shadowBlur = 12;

  textFont("sans-serif");
  textStyle(NORMAL);
  textSize(13);
  fill(240, 201, 201, a);
  text("ICS 기말 프로젝트 · 중간 데모", width / 2, cy - 110);

  textFont("Georgia");
  textStyle(ITALIC);
  textSize(constrain(width * 0.08, 40, 88));
  fill(255, 210, 122, a);
  text("Swing Girls & Boys", width / 2, cy - 40);

  textFont("sans-serif");
  textStyle(NORMAL);
  textSize(20);
  fill(243, 233, 220, a);
  text("재즈 연주, 해보실래요?", width / 2, cy + 30);

  textSize(16);
  if (scene === "opening") {
    fill(243, 233, 220, a * (0.6 + 0.4 * sin(millis() / 300)));
    text("▶ 클릭하거나 Enter를 눌러 무대 열기", width / 2, cy + 100);
  } else {
    fill(243, 233, 220, a);
    text(statusMsg, width / 2, cy + 100);
  }
  noShadow();
}

function drawCurtainHalf(x, w, phase) {
  noStroke();
  for (let i = 0; i < w; i += 3) {
    const f = (sin((i / 66) * TWO_PI + phase) + 1) / 2; // 벨벳 주름
    fill(lerpColor(velvetDark, velvetLight, f));
    rect(x + i, 0, 3.5, height);
  }
  const g = drawingContext.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, "rgba(0,0,0,0.35)");
  g.addColorStop(0.2, "rgba(0,0,0,0)");
  g.addColorStop(0.8, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.5)");
  drawingContext.fillStyle = g;
  drawingContext.fillRect(x, 0, w, height);
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2;
}

// ================= 시작 =================
async function startShow() {
  if (scene !== "opening") return;
  scene = "loading";
  statusMsg = "피아노 소리 불러오는 중…";

  await Tone.start(); // 브라우저는 클릭/키 입력이 있어야 소리를 낼 수 있음
  const audio = setupAudio();
  const band = makeBand(audio.bandOut, {
    beat(b, chord, next) {
      beat = b;
      nextChord = next.name;
      if (chord.name !== currentChord) {
        currentChord = chord.name;
        chordPopAt = millis();
      }
    },
    fill() {
      fillAt = millis();
    },
    bass() {
      const b = inst("bass");
      b.hitAt = millis();
      b.hitPower = 0.35;
      b.hitDir = -b.hitDir;
    },
  });

  const source = await Piano.load(audio.pianoOut);
  if (source === "synth") {
    sourceNote = "피아노 샘플을 불러오지 못해 기본 신시 소리로 연주합니다. (인터넷 연결 확인)";
  }

  band.start(0);
  Tone.Transport.start("+0.1");
  scene = "play";
  curtainT0 = millis();
  ui.style("display", "flex");
}

// ================= 연주 =================
function press(code, strong) {
  if (scene !== "play" || held.has(code)) return;
  const chord = chordByCode[code];
  const mel = melodyByCode[code];
  if (!chord && !mel) return;

  // 박자 보정: 다음 스윙 박자에 맞춰 소리 낼 시각
  const t = Band.noteTime();
  // 자음은 그 시각에 반주가 연주 중인 코드를, 줄 위치(낮게/중간/높게)에 맞는 보이싱으로 침
  const notes = chord ? Band.chordAtTime(t).voicings[chord.register] : [mel.note];
  const velocity = (strong ? 0.95 : 0.5) + (mel ? 0.05 : 0);
  Piano.attack(notes, velocity, t);
  Band.registerPress(t);
  held.set(code, { notes, strong, time: t });

  // 화면 반응도 소리가 나는 순간에 맞춤
  const key = chord || mel;
  Tone.Draw.schedule(() => {
    const p = inst("piano");
    p.hitAt = millis();
    p.hitPower = strong ? 1.3 : 0.8;
    p.hitDir = random([-1, 1]);
    spawnLetter(key.jamo, chord ? "chord" : "melody", strong);
    if (chord) chordPopAt = millis();
  }, t);
}

function release(code) {
  const h = held.get(code);
  if (!h) return;
  held.delete(code);
  // 같은 음을 다른 키가 아직 누르고 있으면 그 음은 끄지 않음
  const stillHeld = new Set([...held.values()].flatMap((x) => x.notes));
  const toRelease = h.notes.filter((n) => !stillHeld.has(n));
  // 박자 보정으로 소리가 아직 안 났을 수 있으니, 최소한 울린 뒤에 끔
  if (toRelease.length) Piano.release(toRelease, Math.max(Tone.now(), h.time + 0.08));
}

// ================= 입력 =================
// 키보드는 p5의 keyPressed 대신 브라우저 이벤트를 직접 씀.
// 한글 입력 상태에서는 keyCode가 전부 229로 바뀌어 p5가 동시 입력을 씹어버리기 때문.
// e.code("KeyA" 등)는 한/영 상태와 상관없이 실제 자판 위치를 알려줌.
window.addEventListener("keydown", (e) => {
  if (scene === "opening" && (e.code === "Enter" || e.code === "Space")) {
    e.preventDefault();
    startShow();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (!chordByCode[e.code] && !melodyByCode[e.code]) return;
  e.preventDefault();
  if (!e.repeat) press(e.code, e.shiftKey);
});
window.addEventListener("keyup", (e) => release(e.code));
window.addEventListener("blur", () => [...held.keys()].forEach(release));

// 피아노를 클릭하면 코드 한 번, 준비 중인 악기를 클릭하면 말풍선
function mousePressed() {
  if (scene === "opening") {
    startShow();
    return;
  }
  if (scene !== "play") return;
  const i = instrumentAt(mouseX, mouseY);
  if (!i) return;
  if (i.id === "piano") {
    press("KeyA", keyIsDown(SHIFT));
    mouseKey = "KeyA";
  } else {
    i.hitAt = millis();
    i.hitPower = 0.9;
    i.hitDir = random([-1, 1]);
    i.bubbleAt = millis();
  }
}

function mouseReleased() {
  if (mouseKey) {
    release(mouseKey);
    mouseKey = null;
  }
}

// ================= BPM / 박자 보정 / 반주 버튼 (p5 DOM) =================
function buildControls() {
  ui = createDiv().class("controls");
  ui.style("display", "none");
  createSpan("BPM").parent(ui);
  bpmSlider = createSlider(70, 180, 108, 1).parent(ui);
  bpmLabel = createSpan("108").class("bpm-val").parent(ui);
  bpmSlider.input(() => {
    const v = bpmSlider.value();
    bpmLabel.html(v);
    Tone.Transport.bpm.rampTo(v, 0.2);
  });
  quantBtn = createButton("박자 보정 켜짐").parent(ui);
  quantBtn.mousePressed(() => {
    Band.quantize = !Band.quantize;
    quantBtn.html(Band.quantize ? "박자 보정 켜짐" : "박자 보정 꺼짐");
    quantBtn.elt.blur();
  });
  drumBtn = createButton("반주 멈춤").parent(ui);
  drumBtn.mousePressed(toggleDrums);
}

function toggleDrums() {
  if (Tone.Transport.state === "started") {
    Tone.Transport.pause();
    drumBtn.html("반주 시작");
    beat = -1;
  } else {
    Tone.Transport.start();
    drumBtn.html("반주 멈춤");
  }
  drumBtn.elt.blur();
}
