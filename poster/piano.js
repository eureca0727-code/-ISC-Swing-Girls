// 피아노: 두벌식 자판 기준
//   자음 키(왼손) → "지금 코드"를 침,  모음 키(오른손) → C 펜타토닉 멜로디
// 코드 진행은 반주가 알아서 흘러가므로 참여자는 코드를 고를 필요가 없음 → 뭘 눌러도 안 틀림
// 한글 이름을 타이핑하면 "코드 + 멜로디"가 번갈아 나옴 (예: 김지훈 → ㄱ ㅣ ㅁ ㅈ ㅣ ㅎ ㅜ ㄴ)
// 음을 따 올 필요 없이 음 이름(C4, E4 …)으로 지정하고,
// 소리는 무료 공개된 Salamander Grand Piano 녹음 샘플을 불러와서 냅니다.

// 4마디 반복 코드 진행: ii - V - I - vi (재즈에서 가장 흔한 진행)
// tones = 근음에서 몇 반음 위인지 (워킹 베이스가 사용)
// voicings = 같은 코드를 낮게 / 중간 / 높게 치는 법
const PROGRESSION = [
  {
    name: "Dm7", root: "D", tones: [0, 3, 7, 10],
    voicings: { low: ["D3", "A3", "C4", "F4"], mid: ["F4", "A4", "C5", "E5"], high: ["C5", "E5", "F5", "A5"] },
  },
  {
    name: "G7", root: "G", tones: [0, 4, 7, 10],
    voicings: { low: ["G2", "F3", "B3", "E4"], mid: ["F4", "A4", "B4", "E5"], high: ["B4", "E5", "F5", "A5"] },
  },
  {
    name: "Cmaj7", root: "C", tones: [0, 4, 7, 11],
    voicings: { low: ["C3", "G3", "B3", "E4"], mid: ["E4", "G4", "B4", "D5"], high: ["B4", "D5", "E5", "G5"] },
  },
  {
    name: "Am7", root: "A", tones: [0, 3, 7, 10],
    voicings: { low: ["A2", "G3", "C4", "E4"], mid: ["G4", "B4", "C5", "E5"], high: ["C5", "E5", "G5", "B5"] },
  },
];

// 자음 14개: 어느 자음이든 지금 코드를 침. 줄에 따라 낮게 / 중간 / 높게만 달라짐
const CHORD_KEYS = [
  // 윗줄 ㅂㅈㄷㄱㅅ — 높게
  { code: "KeyQ", jamo: "ㅂ", register: "high" },
  { code: "KeyW", jamo: "ㅈ", register: "high" },
  { code: "KeyE", jamo: "ㄷ", register: "high" },
  { code: "KeyR", jamo: "ㄱ", register: "high" },
  { code: "KeyT", jamo: "ㅅ", register: "high" },
  // 가운뎃줄 ㅁㄴㅇㄹㅎ — 중간
  { code: "KeyA", jamo: "ㅁ", register: "mid" },
  { code: "KeyS", jamo: "ㄴ", register: "mid" },
  { code: "KeyD", jamo: "ㅇ", register: "mid" },
  { code: "KeyF", jamo: "ㄹ", register: "mid" },
  { code: "KeyG", jamo: "ㅎ", register: "mid" },
  // 아랫줄 ㅋㅌㅊㅍ — 낮게
  { code: "KeyZ", jamo: "ㅋ", register: "low" },
  { code: "KeyX", jamo: "ㅌ", register: "low" },
  { code: "KeyC", jamo: "ㅊ", register: "low" },
  { code: "KeyV", jamo: "ㅍ", register: "low" },
];

// 모음 12개: C 펜타토닉(도 레 미 솔 라). 아랫줄 → 윗줄로 갈수록 높은 음
const MELODY_KEYS = [
  // 아랫줄 ㅠㅜㅡ
  { code: "KeyB", jamo: "ㅠ", note: "G4" },
  { code: "KeyN", jamo: "ㅜ", note: "A4" },
  { code: "KeyM", jamo: "ㅡ", note: "C5" },
  // 가운뎃줄 ㅗㅓㅏㅣ
  { code: "KeyH", jamo: "ㅗ", note: "D5" },
  { code: "KeyJ", jamo: "ㅓ", note: "E5" },
  { code: "KeyK", jamo: "ㅏ", note: "G5" },
  { code: "KeyL", jamo: "ㅣ", note: "A5" },
  // 윗줄 ㅛㅕㅑㅐㅔ
  { code: "KeyY", jamo: "ㅛ", note: "C6" },
  { code: "KeyU", jamo: "ㅕ", note: "D6" },
  { code: "KeyI", jamo: "ㅑ", note: "E6" },
  { code: "KeyO", jamo: "ㅐ", note: "G6" },
  { code: "KeyP", jamo: "ㅔ", note: "A6" },
];

const SOLFEGE = { C: "도", D: "레", E: "미", F: "파", G: "솔", A: "라", B: "시" };

// 샘플은 단3도 간격(C, D#, F#, A)으로만 있고, 사이 음은 Tone.Sampler가 자동으로 음높이를 바꿔 채움
function salamanderUrls() {
  const urls = {};
  for (let octave = 2; octave <= 6; octave++) {
    for (const n of ["C", "D#", "F#", "A"]) urls[n + octave] = n.replace("#", "s") + octave + ".mp3";
  }
  urls.C7 = "C7.mp3";
  return urls;
}

const Piano = {
  inst: null,
  source: null, // "samples" | "synth"

  // 샘플 로딩에 실패하거나 10초 넘게 걸리면 기본 신시 소리로 대체
  load(output) {
    return new Promise((resolve) => {
      let done = false;
      const useSynth = () => {
        if (done) return;
        done = true;
        if (this.inst) this.inst.dispose();
        this.inst = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: "triangle" },
          envelope: { attack: 0.005, decay: 0.4, sustain: 0.25, release: 1.2 },
        }).connect(output);
        this.inst.volume.value = -10;
        this.source = "synth";
        resolve(this.source);
      };

      this.inst = new Tone.Sampler({
        urls: salamanderUrls(),
        baseUrl: "https://tonejs.github.io/audio/salamander/",
        release: 1.2,
        onload: () => {
          if (done) return;
          done = true;
          this.source = "samples";
          resolve(this.source);
        },
        onerror: useSynth,
      }).connect(output);

      setTimeout(useSynth, 10000);
    });
  },

  attack(notes, velocity, time = Tone.now()) {
    this.inst.triggerAttack(notes, time, velocity);
  },

  release(notes, time = Tone.now()) {
    this.inst.triggerRelease(notes, time);
  },
};
