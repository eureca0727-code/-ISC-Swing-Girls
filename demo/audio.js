// 반주 밴드: 스윙 드럼 + 워킹 베이스 (Tone.js)
// 재즈처럼 들리게 하는 핵심은 ① 라이드 심벌 "칭- 칭기" ② 2·4박 하이햇 ③ 4분음표로 걷는 베이스
// 잼처럼 느끼게 하는 장치
//   - 박자 보정: 참여자가 친 음을 가장 가까운 스윙 박자에 맞춰 냄
//   - 받쳐주기: 참여자가 많이 치면 반주 볼륨이 줄어듦
//   - 대답하기: 참여자가 한 소절 치고 멈추면 드럼이 필인으로 받아침

// 모든 악기 → bus → 리미터 → 스피커, bus → 파형 분석기(화면 시각화용)
function setupAudio() {
  const limiter = new Tone.Limiter(-1).toDestination();
  const bus = new Tone.Gain(1).connect(limiter);
  const waveform = new Tone.Waveform(1024);
  bus.connect(waveform);

  const reverb = new Tone.Reverb({ decay: 2.4, wet: 0.2 }).connect(bus);
  const pianoOut = new Tone.Gain(0.9).connect(reverb);
  const bandOut = new Tone.Gain(1).connect(bus); // 반주 전체 볼륨 (받쳐주기에 사용)

  Tone.Transport.bpm.value = 108;
  Tone.Transport.swing = 0.5;             // 0.5 = 뒷박이 셋잇단 위치(박의 2/3 지점)로 밀림
  Tone.Transport.swingSubdivision = "8n";

  return { bus, waveform, pianoOut, bandOut };
}

// ---------- 밴드 상태: 코드 진행, 박자 보정, 참여자 연주 기록 ----------
const Band = {
  quantize: true,
  pressTimes: [],      // 참여자 음이 울린 시각들 (최근 것만 보관)
  lastPress: -Infinity,
  lastFill: -Infinity,
  activity: 0,         // 0~1, 최근에 얼마나 많이 쳤는지

  // 시각 t가 몇 번째 박인지 (스윙은 박 위치 계산에 영향 없음)
  beatAt(t) {
    return Math.floor(Tone.Transport.getTicksAtTime(t) / Tone.Transport.PPQ + 0.01);
  },
  chordAt(beatIndex) {
    return PROGRESSION[Math.floor(Math.max(0, beatIndex) / 4) % PROGRESSION.length];
  },
  chordAtTime(t) {
    return this.chordAt(this.beatAt(t));
  },

  // 키를 누르면 소리 낼 시각을 돌려줌.
  // 다음 박자(정박 또는 스윙된 뒷박)까지 기다렸다가 냄. 박자 직후 0.07초 안에 친 건 바로 냄.
  noteTime() {
    const now = Tone.now();
    if (!this.quantize || Tone.Transport.state !== "started") return now;
    const beatDur = 60 / Tone.Transport.bpm.value;
    const b = Tone.Transport.getTicksAtTime(now) / Tone.Transport.PPQ;
    const frac = b - Math.floor(b);
    const off = (1 + (2 / 3) * Tone.Transport.swing) / 2; // 스윙된 뒷박 위치 (swing 0.5 → 2/3)
    const prev = frac >= off ? off : 0;
    const next = frac >= off ? 1 : off;
    if ((frac - prev) * beatDur < 0.07) return now;
    return now + (next - frac) * beatDur;
  },

  registerPress(t) {
    this.pressTimes.push(t);
    this.lastPress = Math.max(this.lastPress, t);
    const cutoff = Tone.now() - 10;
    while (this.pressTimes.length && this.pressTimes[0] < cutoff) this.pressTimes.shift();
  },

  countBetween(from, to) {
    return this.pressTimes.filter((t) => t >= from && t <= to).length;
  },

  // 최근 2마디 안에 3음 이상 쳤고, 1.5박 넘게 조용하면 → 드럼이 대답
  shouldFill(time) {
    const beatDur = 60 / Tone.Transport.bpm.value;
    const played = this.countBetween(time - beatDur * 8, time) >= 3;
    const silent = time - this.lastPress >= beatDur * 1.5;
    const answered = this.lastPress <= this.lastFill; // 이 소절엔 이미 대답했음
    if (played && silent && !answered) {
      this.lastFill = time;
      return true;
    }
    return false;
  },
};

// ---------- 드럼 ----------
// 한 마디 = 8분음표 8칸: 0=1박, 1=1박&, 2=2박, 3=2박&, 4=3박, 5=3박&, 6=4박, 7=4박&
function makeDrums(out) {
  // 라이드: 합성음이지만 고역만 남겨서 쇳소리를 줄임
  const rideFilter = new Tone.Filter(3500, "highpass").connect(out);
  const ride = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 1.4, release: 0.6 },
    harmonicity: 5.1, modulationIndex: 22, resonance: 6500, octaves: 1.5,
  }).connect(rideFilter);
  ride.volume.value = -24;

  // 킥 / 스네어 / 하이햇: 어쿠스틱 드럼 녹음 샘플
  const kit = new Tone.Sampler({
    urls: { C1: "kick.mp3", D1: "snare.mp3", "F#1": "hihat.mp3" },
    baseUrl: "https://tonejs.github.io/audio/drum-samples/acoustic-kit/",
  }).connect(out);
  kit.volume.value = -6;

  const RIDE = { 0: 0.6, 2: 0.9, 3: 0.35, 4: 0.6, 6: 0.9, 7: 0.35 }; // 칭- 칭기 칭- 칭기
  const FILL_SNARE = { 4: 0.35, 5: 0.45, 6: 0.6, 7: 0.8 };            // 3·4박 스네어 크레셴도

  return {
    // 평소 패턴. accent = 필인 다음 마디 첫 박을 크게
    normal(time, step, accent) {
      if (step in RIDE) {
        const v = accent && step === 0 ? 1 : RIDE[step] * (0.9 + Math.random() * 0.2);
        ride.triggerAttackRelease(300, accent && step === 0 ? "2n" : "8n", time, v);
      }
      if (!kit.loaded) return;
      if (step === 2 || step === 6) kit.triggerAttack("F#1", time, 0.55);   // 2·4박 하이햇
      if (step === 0) kit.triggerAttack("C1", time, accent ? 0.7 : 0.25);   // 킥
      if (accent && step === 0) kit.triggerAttack("D1", time, 0.5);
      if ((step === 5 || step === 7) && Math.random() < 0.25) {
        kit.triggerAttack("D1", time, 0.12 + Math.random() * 0.15);         // 가끔 고스트 스네어
      }
    },
    // 필인: 3·4박을 스네어로 채움
    fill(time, step) {
      if (!kit.loaded) return;
      kit.triggerAttack("D1", time, FILL_SNARE[step]);
      if (step === 6) {
        kit.triggerAttack("C1", time, 0.5);
        kit.triggerAttack("F#1", time, 0.5);
      }
    },
  };
}

// ---------- 워킹 베이스 ----------
// 1박 근음 → 2박 3도/5도 → 3박 5도/옥타브 → 4박 다음 코드 근음으로 반음 접근
function makeBass(out) {
  const bass = new Tone.MonoSynth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.004, decay: 0.45, sustain: 0.18, release: 0.25 },
    filter: { type: "lowpass", Q: 1.2 },
    filterEnvelope: { attack: 0.002, decay: 0.18, sustain: 0.25, baseFrequency: 110, octaves: 2.8 },
  }).connect(out);
  bass.volume.value = -4;

  let last = 40;

  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const rootMidi = (chord) => 33 + ((PC[chord.root] - 9 + 12) % 12); // A1~G#2
  const near = (midi, ref) => {
    while (midi - ref > 7) midi -= 12;
    while (ref - midi > 7) midi += 12;
    return Math.min(52, Math.max(31, midi));
  };

  return (time, beatIdx) => {
    const chord = Band.chordAt(beatIdx);
    const idx = beatIdx % 4; // 마디 안에서 몇 번째 박인지
    const R = rootMidi(chord);
    const iv = chord.tones;
    let midi;
    if (idx === 0) {
      midi = R;
    } else if (idx === 1) {
      const c = iv.filter((i) => i >= 3 && i <= 7);
      midi = R + (c.length ? pick(c) : 7);
    } else if (idx === 2) {
      midi = R + pick([7, 12, ...iv.filter((i) => i >= 7)]);
    } else {
      const target = near(rootMidi(Band.chordAt(beatIdx + 1)), last);
      midi = pick([target - 1, target + 1, target - 5]);
    }
    midi = idx === 0 ? near(midi, last) : Math.min(52, Math.max(31, midi));
    last = midi;

    const vel = (idx === 0 ? 0.9 : 0.72) + Math.random() * 0.08;
    bass.triggerAttackRelease(Tone.Frequency(midi, "midi").toNote(), Tone.Time("4n").toSeconds() * 0.92, time, vel);
  };
}

// ---------- 밴드 전체 ----------
// on.beat(박, 지금 코드, 다음 코드), on.fill(), on.bass() : 화면 갱신용 콜백
function makeBand(bandOut, on) {
  const drums = makeDrums(bandOut);
  const walk = makeBass(bandOut);
  let filling = false;
  let accentNext = false;

  return new Tone.Sequence((time, step) => {
    // 받쳐주기: 최근 2박 동안 친 음이 많을수록 반주를 최대 45%까지 줄임
    const beatDur = 60 / Tone.Transport.bpm.value;
    Band.activity = Math.min(1, Band.countBetween(time - beatDur * 2, time + 0.2) / 5);
    bandOut.gain.rampTo(1 - 0.45 * Band.activity, 0.3, time);

    // 대답하기: 3박째에 판단해서 3·4박을 필인으로
    if (step === 4 && Band.shouldFill(time)) {
      filling = true;
      Tone.Draw.schedule(() => on.fill(), time);
    }
    if (filling && step >= 4) {
      drums.fill(time, step);
      if (step === 7) {
        filling = false;
        accentNext = true;
      }
    } else {
      drums.normal(time, step, accentNext && step === 0);
      if (step === 0) accentNext = false;
    }

    if (step % 2 === 0) {
      const beatIdx = Math.round(Tone.Transport.getTicksAtTime(time) / Tone.Transport.PPQ);
      walk(time, beatIdx);
      if (on.bass) Tone.Draw.schedule(() => on.bass(), time); // 베이스 그림이 음에 맞춰 튐
      const chord = Band.chordAt(beatIdx);
      const next = Band.chordAt(beatIdx + 4 - (beatIdx % 4));
      Tone.Draw.schedule(() => on.beat(step / 2, chord, next), time); // 화면 표시를 소리와 맞춤
    }
  }, [0, 1, 2, 3, 4, 5, 6, 7], "8n");
}
