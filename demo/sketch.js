// Swing Girls & Boys — 키보드 피아노 데모 (p5.js)
// 화면 그리기와 입력은 p5.js, 소리는 Tone.js (piano.js, audio.js)

const PAD = 32;
const COL = {
  ink: "#f3e9dc",
  muted: "#a8998a",
  gold: "#e8b04a",
  goldHot: "#ffd27a",
  key: "#1d1613",
  keyEdge: "#3a2c24",
};

let scene = "opening";   // opening → loading → play
let curtainT0 = null;    // 막이 열리기 시작한 시각(ms)
let statusMsg = "";
let sourceNote = "";
let currentChord = PROGRESSION[0].name;
let nextChord = PROGRESSION[1].name;
let chordPopAt = -1000;
const REGISTER_LABEL = { low: "낮게", mid: "중간", high: "높게" };
let beat = -1;
let mouseKey = null;

let waveform, pianoOut, drums;
let ui, bpmSlider, bpmLabel, drumBtn, quantBtn;
let fillAt = -10000;     // 드럼이 마지막으로 대답한 시각(ms)
let velvetDark, velvetLight;

const held = new Map();  // 누르고 있는 키 code → { notes, strong }
let keyCaps = [];        // 화면의 키캡 { code, letter, kind, jamo, sub, x, y, w, h }
let L = {};              // 레이아웃 좌표

const chordByCode = Object.fromEntries(CHORD_KEYS.map((k) => [k.code, k]));
const melodyByCode = Object.fromEntries(MELODY_KEYS.map((k) => [k.code, k]));

// ================= p5 기본 =================
function setup() {
  createCanvas(windowWidth, windowHeight);
  velvetDark = color("#5e0c15");
  velvetLight = color("#a11b29");
  buildControls();
  layout();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  layout();
}

function draw() {
  drawBackground();
  drawHeader();
  drawWave();
  drawKeys();
  drawFooter();
  drawCurtain();
}

// ================= 레이아웃 =================
function layout() {
  const gap = 8;
  const keyW = min(76, (width - PAD * 2 - gap * 9) / 10);
  const keyH = keyW;
  const waveY = 150;
  const waveH = min(150, height * 0.18);
  const legendY = waveY + waveH + 40;
  const keysY = legendY + 26;

  // 실제 키보드처럼 줄마다 엇갈리게 배치 (가장 긴 윗줄 기준으로 가운데 정렬)
  const blockW = 10 * keyW + 9 * gap;
  const x0 = (width - blockW) / 2;
  keyCaps = [];
  KEYBOARD_ROWS.forEach((row, r) => {
    const y = keysY + r * (keyH + gap + 4);
    row.codes.forEach((code, i) => {
      const x = x0 + row.offset * (keyW + gap) + i * (keyW + gap);
      const chord = chordByCode[code];
      const mel = melodyByCode[code];
      keyCaps.push({
        code,
        letter: code.slice(3),
        kind: chord ? "chord" : "melody",
        jamo: (chord || mel).jamo,
        sub: chord ? REGISTER_LABEL[chord.register] : SOLFEGE[mel.note[0]],
        x, y, w: keyW, h: keyH,
      });
    });
  });

  const footerY = keysY + 3 * (keyH + gap + 4) + 28;
  L = { waveY, waveH, legendY, footerY, x0, blockW };
}

// ================= 그리기 =================
function drawBackground() {
  const ctx = drawingContext;
  const g = ctx.createRadialGradient(width / 2, -height * 0.1, 0, width / 2, -height * 0.1, max(width, height) * 0.9);
  g.addColorStop(0, "#63300f");
  g.addColorStop(0.65, "#170b06");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}

function drawHeader() {
  noStroke();
  textFont("sans-serif");
  textStyle(NORMAL);
  textAlign(LEFT, BASELINE);
  textSize(13);
  fill(COL.muted);
  text("지금 코드", PAD, 52);

  // 코드가 바뀌거나 자음을 치면 살짝 커졌다가 돌아옴
  const t = constrain((millis() - chordPopAt) / 250, 0, 1);
  push();
  translate(PAD, 108);
  scale(lerp(1.12, 1, t));
  textFont("Georgia");
  textStyle(ITALIC);
  textSize(52);
  fill(lerpColor(color(COL.goldHot), color(COL.gold), t));
  text(currentChord, 0, 0);
  const cw = textWidth(currentChord);
  textFont("sans-serif");
  textStyle(NORMAL);
  textSize(15);
  fill(COL.muted);
  text("다음  " + nextChord, cw + 18, 0);
  pop();

  // 박자 표시 4개
  const cx = width / 2 - 36;
  for (let i = 0; i < 4; i++) {
    const on = i === beat;
    stroke(COL.gold);
    strokeWeight(1);
    if (on) {
      drawingContext.shadowColor = COL.gold;
      drawingContext.shadowBlur = 10;
      fill(COL.gold);
    } else {
      noFill();
    }
    circle(cx + i * 24, 92, 14);
    drawingContext.shadowBlur = 0;
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
    textStyle(NORMAL);
    textAlign(CENTER, CENTER);
    textSize(14);
    fill(232, 176, 74, a);
    text(status, cx + 36, 124);
  }
}

function drawWave() {
  const x0 = PAD;
  const w = width - PAD * 2;
  fill(0, 90);
  stroke(COL.keyEdge);
  strokeWeight(1);
  rect(x0, L.waveY, w, L.waveH, 14);
  if (!waveform) return;

  const v = waveform.getValue();
  noFill();
  stroke(COL.gold);
  strokeWeight(2);
  drawingContext.shadowColor = "rgba(232, 176, 74, 0.6)";
  drawingContext.shadowBlur = 12;
  beginShape();
  for (let i = 0; i < v.length; i += 2) {
    const x = x0 + (i / (v.length - 1)) * w;
    const y = L.waveY + L.waveH / 2 + constrain(v[i] * 1.8, -1, 1) * L.waveH * 0.42;
    vertex(x, y);
  }
  endShape();
  drawingContext.shadowBlur = 0;
}

// 자음(코드) 키는 붉은 벨벳 톤, 모음(멜로디) 키는 금색 톤
const KEY_STYLE = {
  chord:  { base: "#2a1215", edge: "#5a1f27", on: "#c8323f", hot: "#ff5a66", glow: "#ff5a66", accent: "#e06a74" },
  melody: { base: "#1d1613", edge: "#3a2c24", on: "#e8b04a", hot: "#ffd27a", glow: "#e8b04a", accent: "#e8b04a" },
};

function drawKeys() {
  // 범례
  noStroke();
  textFont("sans-serif");
  textStyle(NORMAL);
  textAlign(LEFT, CENTER);
  textSize(13);
  fill(KEY_STYLE.chord.accent);
  rect(L.x0, L.legendY - 6, 12, 12, 3);
  fill(COL.muted);
  text("자음 = 지금 코드 쾅 (왼손) · 아랫줄 낮게, 윗줄 높게", L.x0 + 20, L.legendY);
  textAlign(RIGHT, CENTER);
  text("모음 = 멜로디 · C 펜타토닉, 윗줄일수록 높은 음", L.x0 + L.blockW - 20, L.legendY);
  fill(KEY_STYLE.melody.accent);
  rect(L.x0 + L.blockW - 12, L.legendY - 6, 12, 12, 3);

  for (const k of keyCaps) {
    const s = KEY_STYLE[k.kind];
    const h = held.get(k.code);
    const dy = h ? 4 : 0;

    noStroke();
    fill(0);
    rect(k.x, k.y + 5, k.w, k.h, 12); // 키캡 그림자

    if (h && h.strong) {
      drawingContext.shadowColor = s.glow;
      drawingContext.shadowBlur = 24;
    }
    fill(h ? (h.strong ? s.hot : s.on) : s.base);
    stroke(h ? s.hot : s.edge);
    strokeWeight(1);
    rect(k.x, k.y + dy, k.w, k.h, 12);
    drawingContext.shadowBlur = 0;

    noStroke();
    // 영문 자판 글자 (왼쪽 위 작게)
    textAlign(LEFT, TOP);
    textStyle(NORMAL);
    textSize(max(9, k.w * 0.13));
    fill(h ? "rgba(26,18,12,0.6)" : COL.muted);
    text(k.letter, k.x + k.w * 0.1, k.y + dy + k.w * 0.08);
    // 한글 자모 (가운데 크게)
    textAlign(CENTER, CENTER);
    textStyle(BOLD);
    textSize(k.w * 0.34);
    fill(h ? "#1a120c" : COL.ink);
    text(k.jamo, k.x + k.w / 2, k.y + dy + k.h * 0.45);
    // 코드 이름 / 계이름
    textStyle(NORMAL);
    textSize(max(9, k.w * (k.kind === "chord" ? 0.14 : 0.16)));
    fill(h ? "#3a2a1a" : s.accent);
    text(k.sub, k.x + k.w / 2, k.y + dy + k.h * 0.78);
  }
}

function drawFooter() {
  const y = L.footerY;
  noStroke();
  textFont("sans-serif");
  textStyle(NORMAL);
  textAlign(CENTER, CENTER);
  textSize(14);
  fill(COL.muted);
  text("자기 이름을 한글로 타이핑해 보세요 · Shift(쌍자음처럼)를 같이 누르면 더 세게 · 한/영 상관없음", width / 2, y);
  if (sourceNote) {
    textSize(13);
    text(sourceNote, width / 2, y + 24);
  }
}

// 빨간 막: 처음엔 닫혀 있다가 시작하면 양쪽으로 열림
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
  drawingContext.shadowBlur = 0;
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
  waveform = audio.waveform;
  pianoOut = audio.pianoOut;
  drums = makeBand(audio.bandOut, {
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
  });

  const source = await Piano.load(pianoOut);
  if (source === "synth") {
    sourceNote = "피아노 샘플을 불러오지 못해 기본 신시 소리로 연주합니다. (인터넷 연결 확인)";
  }

  drums.start(0);
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

  if (chord) chordPopAt = millis();
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

// 화면의 키캡을 마우스로 눌러도 소리 남
function mousePressed() {
  if (scene === "opening") {
    startShow();
    return;
  }
  if (scene !== "play") return;
  const k = keyCaps.find((c) => mouseX >= c.x && mouseX <= c.x + c.w && mouseY >= c.y && mouseY <= c.y + c.h);
  if (k) {
    press(k.code, keyIsDown(SHIFT));
    mouseKey = k.code;
  }
}

function mouseReleased() {
  if (mouseKey) {
    release(mouseKey);
    mouseKey = null;
  }
}

// ================= BPM / 드럼 버튼 (p5 DOM) =================
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
