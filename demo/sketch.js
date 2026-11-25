// Swing Girls & Boys — 연주가 포스터가 되는 재즈 잼 (p5.js)
// 화면: 스위스 모더니즘 공연 포스터처럼, 치는 음마다 기하 도형이 생겨 포스터 한 장이 완성됨
//   모음(멜로디) → 검은 점 (높이 = 음높이, 앞 음과 선으로 이어짐)
//   자음(코드)   → 큰 도형 (코드마다 모양이 다름)
//   길게 누르기  → 노란 / 흰 사선 막대
//   베이스·드럼  → 아래쪽 작은 점과 사각형
//   8마디 = 포스터 한 장. 다 차면 오른쪽 아래 "지난 포스터"로 붙고 새 포스터 시작
// 소리: Tone.js (piano.js, audio.js)

const POSTER_BEATS = 32; // 8마디
const COL = {
  black: "#111214",
  yellow: "#f2cf3a",
  white: "#f6f4ec",
  ink: "#0c1626",
  blueTop: "#2459bd",
  blueBottom: "#a9c9ec",
};
// 코드마다 도형 모양
const CHORD_SHAPE = { Dm7: "triangle", G7: "half", Cmaj7: "circle", Am7: "square" };

let scene = "opening";   // opening → loading → play
let openT0 = null;       // 시작 화면이 사라지기 시작한 시각(ms)
let statusMsg = "";
let sourceNote = "";
let currentChord = PROGRESSION[0].name;
let nextChord = PROGRESSION[1].name;
let mouseKey = null;

let ui, bpmSlider, bpmLabel, drumBtn, quantBtn;
let L = {};
let S = 1;               // 화면 크기에 따른 배율

let posterStart = 0;     // 지금 포스터가 시작된 박
let posterNo = 1;
let elements = [];       // 지금 포스터 위의 도형들
let posters = [];        // 완성된 포스터 썸네일
let typed = [];          // 이번 포스터에서 친 자모 (포스터 제목이 됨)
let lastMelody = null;

const held = new Map();  // 누르고 있는 키 code → { notes, strong, time, el }

const chordByCode = Object.fromEntries(CHORD_KEYS.map((k) => [k.code, k]));
const melodyByCode = Object.fromEntries(MELODY_KEYS.map((k) => [k.code, k]));

// ================= p5 기본 =================
function setup() {
  createCanvas(windowWidth, windowHeight);
  buildControls();
  layout();
  // 주소 끝에 ?start 를 붙이면 시작 화면을 건너뜀 (테스트용)
  if (new URLSearchParams(location.search).has("start")) startShow();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  layout();
}

function draw() {
  drawBackground();
  if (scene === "play") {
    drawStaff();
    drawElements();
    drawTypography();
    checkPosterDone(); // 여기까지가 포스터 한 장 (썸네일로 찍히는 부분)
    drawPlayhead();
    drawWall();
  }
  drawOpening();
}

// ================= 레이아웃 =================
function layout() {
  S = min(width, height) / 800;
  const m = max(24, width * 0.04);
  const top = m + 56;               // 위쪽 버튼 자리
  const typoTop = height * 0.75;    // 아래쪽 글자 영역
  const gh = typoTop - 24 - top;    // 그림 영역 높이
  L = { m, x0: m, x1: width - m, top, typoTop, gh };
}

const xAt = (beat) => L.x0 + ((beat - posterStart) / POSTER_BEATS) * (L.x1 - L.x0);
const gy = (f) => L.top + f * L.gh; // 그림 영역 안의 세로 위치 (0 = 위, 1 = 아래)
const yMelody = (midi) => gy(map(midi, 67, 93, 0.62, 0.08)); // G4~A6

function nowBeat() {
  if (scene !== "play") return posterStart;
  return Tone.Transport.getTicksAtTime(Tone.immediate()) / Tone.Transport.PPQ;
}
const beatAtTime = (t) => Tone.Transport.getTicksAtTime(t) / Tone.Transport.PPQ;

function popScale(born) {
  const k = constrain((millis() - born) / 240, 0, 1);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * pow(k - 1, 3) + c1 * pow(k - 1, 2); // 살짝 튀어나왔다 자리 잡기
}

// ================= 배경 =================
function drawBackground() {
  const ctx = drawingContext;
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, COL.blueTop);
  g.addColorStop(1, COL.blueBottom);
  // save/restore 필수: 안 하면 p5가 기억하는 fill 색과 실제 색이 어긋나서
  // 다음 fill(검정)이 무시되고 글자·점이 배경색으로 그려짐
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

// 오선: 시간이 흐르면서 왼쪽부터 그려짐
function drawStaff() {
  const xEnd = constrain(xAt(nowBeat()), L.x0, L.x1);
  stroke(17, 18, 20, 70);
  strokeWeight(1);
  for (let k = 0; k < 5; k++) {
    const y = gy(0.28 + k * 0.045);
    line(L.x0, y, xEnd, y);
  }
}

// ================= 도형 만들기 =================
function addMelody(note, strong, beat) {
  const midi = Tone.Frequency(note).toMidi();
  const el = {
    type: "dot",
    beat,
    y: yMelody(midi),
    r: (strong ? 15 : 10) * S,
    strong,
    born: millis(),
    holdStart: beat,
    holdEnd: null,
    angle: radians(random([-14, -9, -5, 6])),
    stem: random() < 0.45,
    prev: lastMelody && beat - lastMelody.beat <= 3 ? lastMelody : null,
  };
  lastMelody = el;
  elements.push(el);
  return el;
}

function addChord(chord, register, strong, beat) {
  const band = { high: [0.12, 0.3], mid: [0.32, 0.5], low: [0.52, 0.7] }[register];
  const size = { high: 60, mid: 88, low: 124 }[register] * S * (strong ? 1.3 : 1);
  const shape = CHORD_SHAPE[chord.name] || "circle";
  const el = {
    type: "shape",
    shape,
    beat,
    y: gy(random(band[0], band[1])),
    size,
    rot: radians(random([0, 15, 30, 45, 90, 180, -30])),
    fill: strong ? COL.yellow : shape === "circle" ? COL.white : COL.black,
    born: millis(),
    holdStart: beat,
    holdEnd: null,
    strong,
    angle: radians(random([-12, -6, 8])),
  };
  elements.push(el);
  return el;
}

// ================= 도형 그리기 =================
function drawElements() {
  const nb = nowBeat();
  noStroke();

  // 1) 사선 막대 (맨 뒤). 기본 길이가 있고, 길게 누를수록 늘어남. 세게 치면 포스터를 가로지르는 긴 사선
  const beatW = (L.x1 - L.x0) / POSTER_BEATS;
  for (const e of elements) {
    if (e.holdStart == null || (e.type !== "dot" && e.type !== "shape")) continue;
    const end = e.holdEnd ?? nb;
    let len = max(xAt(end) - xAt(e.holdStart), (e.type === "dot" ? 0.7 : 1.2) * beatW);
    if (e.strong) len = max(len, 4 * beatW);
    push();
    translate(xAt(e.beat), e.y);
    rotate(e.angle);
    fill(e.type === "dot" ? COL.yellow : COL.white);
    const h = (e.type === "dot" ? (e.strong ? 15 : 10) : e.strong ? 12 : 8) * S;
    rect(-h, -h / 2, len * min(1, popScale(e.born) + 0.2), h);
    pop();
  }

  // 2) 멜로디를 잇는 선, 음표 기둥
  stroke(COL.black);
  strokeWeight(1.5 * S);
  for (const e of elements) {
    if (e.type !== "dot") continue;
    const x = xAt(e.beat);
    if (e.prev) line(xAt(e.prev.beat), e.prev.y, x, e.y);
    if (e.stem) {
      line(x + e.r * 0.9, e.y, x + e.r * 0.9, e.y - 34 * S);
      line(x + e.r * 0.9, e.y - 34 * S, x + e.r * 0.9 + 10 * S, e.y - 26 * S);
    }
  }
  noStroke();

  // 3) 코드 도형
  for (const e of elements) {
    if (e.type !== "shape") continue;
    const s = e.size * popScale(e.born);
    push();
    translate(xAt(e.beat), e.y);
    rotate(e.rot);
    fill(e.fill);
    if (e.shape === "triangle") triangle(-s / 2, s / 2, s / 2, s / 2, 0, -s / 2);
    else if (e.shape === "half") arc(0, 0, s, s, PI, TWO_PI, CHORD);
    else if (e.shape === "square") rect(-s / 2, -s / 2, s, s);
    else circle(0, 0, s);
    pop();
  }

  // 4) 멜로디 점, 베이스 점, 하이햇, 필인
  for (const e of elements) {
    const x = xAt(e.beat);
    const p = popScale(e.born);
    if (e.type === "dot") {
      if (e.strong) {
        fill(COL.yellow);
        circle(x, e.y, e.r * 2 * p + 8 * S);
      }
      fill(COL.black);
      circle(x, e.y, e.r * 2 * p);
    } else if (e.type === "bass") {
      fill(COL.black);
      circle(x, e.y, 7 * S * p);
    } else if (e.type === "hat") {
      fill(COL.white);
      rect(x - 3 * S, e.y - 3 * S, 6 * S * p, 6 * S * p);
    } else if (e.type === "fill") {
      stroke(COL.black);
      strokeWeight(3 * S);
      for (let k = 0; k < 4; k++) {
        const xx = x + k * 9 * S;
        line(xx, e.y + 10 * S, xx + 14 * S * p, e.y - 10 * S);
      }
      noStroke();
    }
  }
}

function drawPlayhead() {
  const x = xAt(nowBeat());
  noStroke();
  fill(COL.black);
  triangle(x - 6 * S, L.top - 14 * S, x + 6 * S, L.top - 14 * S, x, L.top - 4 * S);
  stroke(17, 18, 20, 40);
  strokeWeight(1);
  line(x, L.top, x, L.typoTop - 24);
}

// ================= 포스터 글자 영역 =================
function drawTypography() {
  const x = L.x0;
  const y = L.typoTop;
  noStroke();
  fill(COL.black);
  textFont("Helvetica");

  // 제목: 친 글자를 한글로 조합 (없으면 기본 제목)
  const title = Hangul.assemble(typed).trim();
  textStyle(BOLD);
  textAlign(LEFT, TOP);
  if (title) {
    textSize(44 * S);
    text(title, x, y);
  } else {
    textSize(30 * S);
    text("S W I N G   G I R L S   &   B O Y S", x, y + 8 * S);
  }

  // "SERENADEN ▬ 96" 처럼 노란 막대가 들어간 줄
  const y2 = y + 62 * S;
  textSize(20 * S);
  const label = "S W I N G";
  text(label, x, y2);
  const lw = textWidth(label) + 12 * S;
  fill(COL.yellow);
  rect(x + lw, y2 + 5 * S, 56 * S, 12 * S);
  fill(COL.black);
  text("N º " + nf(posterNo, 2), x + lw + 68 * S, y2);

  // 작은 정보 칸 3개
  textStyle(NORMAL);
  textSize(11 * S);
  const cols = [
    ["지금 코드", `${currentChord}  →  ${nextChord}`],
    ["BPM " + (bpmSlider ? bpmSlider.value() : 108), Band.quantize ? "박자 보정 켜짐" : "박자 보정 꺼짐"],
    ["● 모음 = 멜로디   ▲ 자음 = 코드", "▬ 길게 누르기   Shift = 세게"],
  ];
  const cw = 190 * S;
  cols.forEach((c, k) => {
    const cx = x + k * cw;
    const cy = y2 + 40 * S;
    stroke(COL.black);
    strokeWeight(1);
    line(cx, cy - 6 * S, cx + cw - 16 * S, cy - 6 * S);
    noStroke();
    textStyle(BOLD);
    text(c[0], cx, cy);
    textStyle(NORMAL);
    text(c[1], cx, cy + 16 * S);
  });

  if (sourceNote) {
    textSize(11 * S);
    fill(COL.ink);
    text(sourceNote, x, height - 18 * S);
  }
}

// 8마디가 다 차면 지금 화면을 찍어 썸네일로 보내고 새 포스터 시작
function checkPosterDone() {
  if (nowBeat() < posterStart + POSTER_BEATS) return;
  posters.push({ img: get(0, 0, width, height), rot: radians(random(-4, 4)), born: millis() });
  if (posters.length > 6) posters.shift();
  posterStart += POSTER_BEATS;
  posterNo++;
  elements = elements.filter((e) => held.has(e.code)); // 누르고 있는 음만 남김
  typed = [];
  lastMelody = null;
}

// 오른쪽 아래: 지난 포스터들
function drawWall() {
  if (!posters.length) return;
  const tw = 96 * S;
  const th = (tw * height) / width;
  const baseX = L.x1 - tw / 2;
  const baseY = height - th / 2 - 18 * S;
  noStroke();
  fill(COL.black);
  textSize(11 * S);
  textStyle(BOLD);
  textAlign(RIGHT, BOTTOM);
  text("지난 포스터", L.x1, baseY - th / 2 - 8 * S);
  posters.forEach((p, k) => {
    const idx = posters.length - 1 - k; // 최신이 오른쪽
    const t = constrain((millis() - p.born) / 400, 0, 1);
    push();
    translate(baseX - idx * (tw * 0.72), baseY);
    rotate(p.rot);
    scale(lerp(2.2, 1, t));
    drawingContext.shadowColor = "rgba(10, 20, 40, 0.35)";
    drawingContext.shadowBlur = 8;
    fill(COL.white);
    rect(-tw / 2 - 3, -th / 2 - 3, tw + 6, th + 6);
    drawingContext.shadowBlur = 0;
    image(p.img, -tw / 2, -th / 2, tw, th);
    pop();
  });
}

// ================= 시작 화면 =================
function drawOpening() {
  let a = 255;
  if (openT0 !== null) {
    a = 255 * (1 - constrain((millis() - openT0) / 700, 0, 1));
    if (a <= 0) return;
  }
  push();
  drawingContext.globalAlpha = a / 255;
  drawBackground();
  const cx = width / 2;
  const cy = height / 2;
  noStroke();
  // 장식 도형
  fill(COL.black);
  circle(cx - 260 * S, cy - 150 * S, 46 * S);
  circle(cx - 205 * S, cy - 150 * S, 46 * S);
  triangle(cx + 180 * S, cy - 190 * S, cx + 280 * S, cy - 190 * S, cx + 280 * S, cy - 120 * S);
  fill(COL.white);
  circle(cx + 120 * S, cy - 130 * S, 34 * S);
  fill(COL.yellow);
  push();
  translate(cx - 120 * S, cy - 100 * S);
  rotate(radians(-12));
  rect(0, 0, 300 * S, 12 * S);
  pop();

  fill(COL.black);
  textFont("Helvetica");
  textStyle(BOLD);
  textAlign(CENTER, CENTER);
  textSize(constrain(width * 0.05, 28, 64));
  text("S W I N G   G I R L S   &   B O Y S", cx, cy);
  textStyle(NORMAL);
  textSize(18 * S);
  text("치는 음마다 포스터가 그려지는 재즈 잼", cx, cy + 56 * S);
  textSize(15 * S);
  const blink = scene === "opening" ? 0.55 + 0.45 * sin(millis() / 300) : 1;
  drawingContext.globalAlpha = (a / 255) * blink;
  text(scene === "opening" ? "▶ 클릭하거나 Enter를 눌러 시작" : statusMsg, cx, cy + 110 * S);
  pop();
  drawingContext.globalAlpha = 1;
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
      currentChord = chord.name;
      nextChord = next.name;
    },
    fill(pos) {
      elements.push({ type: "fill", beat: pos, y: gy(0.8), born: millis() });
    },
    hat(pos) {
      elements.push({ type: "hat", beat: pos, y: gy(0.96), born: millis() });
    },
    bass(midi, beatIdx) {
      elements.push({ type: "bass", beat: beatIdx, y: gy(map(midi, 31, 52, 0.92, 0.84)), born: millis() });
    },
  });

  const source = await Piano.load(audio.pianoOut);
  if (source === "synth") {
    sourceNote = "피아노 샘플을 불러오지 못해 기본 신시 소리로 연주합니다. (인터넷 연결 확인)";
  }

  band.start(0);
  Tone.Transport.start("+0.1");
  posterStart = 0;
  scene = "play";
  openT0 = millis();
  ui.style("display", "flex");
  if (new URLSearchParams(location.search).has("demo")) autoPlay();
}

// ?demo : 사람이 치는 것처럼 아무 키나 자동으로 누름 (테스트, 전시 대기 화면용)
function autoPlay() {
  const codes = [...CHORD_KEYS, ...MELODY_KEYS].map((k) => k.code);
  const step = () => {
    const code = random() < 0.3 ? random(CHORD_KEYS).code : random(MELODY_KEYS).code;
    press(code, random() < 0.15);
    setTimeout(() => release(code), random(80, 700));
    setTimeout(step, random([150, 280, 280, 550, 900]));
  };
  step();
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
  const progChord = Band.chordAtTime(t);
  const notes = chord ? progChord.voicings[chord.register] : [mel.note];
  const velocity = (strong ? 0.95 : 0.5) + (mel ? 0.05 : 0);
  Piano.attack(notes, velocity, t);
  Band.registerPress(t);
  const h = { notes, strong, time: t, el: null };
  held.set(code, h);

  // 도형도 소리가 나는 순간에 생김
  const beat = beatAtTime(t);
  Tone.Draw.schedule(() => {
    h.el = chord ? addChord(progChord, chord.register, strong, beat) : addMelody(mel.note, strong, beat);
    h.el.code = code;
    if (!held.has(code)) h.el.holdEnd = beat; // 소리 나기 전에 이미 뗀 경우
    if (typed.length < 24) typed.push((chord || mel).jamo);
  }, t);
}

function release(code) {
  const h = held.get(code);
  if (!h) return;
  held.delete(code);
  if (h.el) h.el.holdEnd = nowBeat();
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
  if (scene !== "play" || e.ctrlKey || e.metaKey || e.altKey) return;
  // 스페이스 = 띄어쓰기, 백스페이스 = 한 글자 지우기 (포스터 제목에만 반영)
  if (e.code === "Space") {
    e.preventDefault();
    if (!e.repeat && typed.length && typed[typed.length - 1] !== " ") typed.push(" ");
    return;
  }
  if (e.code === "Backspace") {
    e.preventDefault();
    typed.pop();
    return;
  }
  if (!chordByCode[e.code] && !melodyByCode[e.code]) return;
  e.preventDefault();
  if (!e.repeat) press(e.code, e.shiftKey);
});
window.addEventListener("keyup", (e) => release(e.code));
window.addEventListener("blur", () => [...held.keys()].forEach(release));

// 그림 영역을 클릭하면 코드 한 번 (마우스로만 해 보는 사람용)
function mousePressed() {
  if (scene === "opening") {
    startShow();
    return;
  }
  if (scene !== "play") return;
  if (mouseY > L.top && mouseY < L.typoTop && mouseX > L.x0 && mouseX < L.x1) {
    press("KeyA", keyIsDown(SHIFT));
    mouseKey = "KeyA";
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
  } else {
    Tone.Transport.start();
    drumBtn.html("반주 멈춤");
  }
  drumBtn.elt.blur();
}
