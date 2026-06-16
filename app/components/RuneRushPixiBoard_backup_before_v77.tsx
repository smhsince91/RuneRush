"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { AdvancedBloomFilter, GlowFilter, MotionBlurFilter } from "pixi-filters";
import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Texture,
  Text,
} from "pixi.js";

type Rune = "blue" | "spiral" | "orange" | "triangle" | "leaf" | "golden" | "lotus";
type Special = "none" | "bomb" | "golden" | "lotus";
type ObjectiveKind = "score" | "collect" | "fog";
type Phase = "idle" | "busy" | "finale" | "win" | "fail";

type Tile = {
  id: number;
  r: number;
  c: number;
  color: Rune;
  rune: Rune;
  special: Special;
};

type Level = {
  idx: number;
  moves: number;
  objectiveKind: ObjectiveKind;
  targetScore: number;
  collectTarget: Partial<Record<Rune, number>>;
  fogCount: number;
};

type HudState = {
  level: number;
  moves: number;
  score: number;
  combo: number;
  lives: number;
  objectiveKind: ObjectiveKind;
  objectiveLabel: string;
  objectiveText: string;
  progress: number;
  collect?: Partial<Record<Rune, number>>;
  phase: Phase;
  message: string;
};

type TileView = {
  tile: Tile;
  wrap: Container;
  stone?: Sprite;
  rune?: Sprite;
  fallback?: Text;
  rim: Graphics;
  specialRing?: Graphics;
  baseX: number;
  baseY: number;
  busy: boolean;
  hintPhase: number;
};

type Tween = {
  target: any;
  from: Record<string, number>;
  to: Record<string, number>;
  elapsed: number;
  ms: number;
  ease: (t: number) => number;
  done?: () => void;
};

type Props = {
  levelIndex: number;
  onHud: (hud: HudState) => void;
  soundOn?: boolean;
  onLevelComplete?: () => void;
  onLevelFailed?: () => void;
};

type SfxKey = "swap" | "match" | "clear" | "runicClear" | "chain" | "special" | "spawn" | "convert" | "bomb" | "golden" | "lotus" | "finale" | "fog" | "bad" | "win";

const N = 7;
const MAX_LIVES = 7;
const PTS_PER_TILE = 7;
const BONUS_GOLDEN = 65;
const BONUS_LOTUS = 190;
const BONUS_COMBO = 28;
const SWAP_MS = 84;
const DROP_MS = 106;
const POP_MS = 118;
const CASCADE_WAIT_MS = 32;
const HINT_IDLE_MS = 8500;
const HINT_REPEAT_MS = 4700;
const BUILD_TAG = "pixifull-v73-pixi-matte-carved-performance-quotes";

const PALETTE: Rune[] = ["blue", "spiral", "orange", "triangle", "leaf"];
const FALLBACK: Record<Rune, string> = {
  blue: "🐸",
  spiral: "🌀",
  orange: "■",
  triangle: "▲",
  leaf: "🍃",
  golden: "🐸",
  lotus: "✦",
};
const RUNE_FILES: Record<Rune, string> = {
  blue: "/runes/blue.png",
  spiral: "/runes/spiral.png",
  orange: "/runes/orange.png",
  triangle: "/runes/triangle.png",
  leaf: "/runes/leaf.png",
  golden: "/runes/golden.png",
  lotus: "/runes/lotus.png",
};

const LOTUS_PETAL_FILES = [
  "/fx/devourfish_petal1.png",
  "/fx/devourfish_petal2.png",
  "/fx/devourfish_petal3.png",
  "/fx/devourfish_petal4.png",
  "/fx/devourfish_petal5.png",
  "/fx/devourfish_petal6.png",
  "/fx/devourfish_petal7.png",
  "/fx/devourfish_petal8.png",
  "/fx/devourfish_petal9.png",
];

const LUXURY_PARTICLE_FILES = [
  "/fx/soft-glow.png",
  "/fx/glow.png",
  "/fx/sparkle.png",
  "/fx/sparkle-star.png",
  "/fx/star.png",
  "/fx/magic-dust.png",
  "/fx/light-streak.png",
  "/fx/particle.png",
  "/fx/particleStar.png",
  "/fx/particleSpark.png",
  "/fx/particleFire.png",
];

const ORIGINAL_SFX: Record<SfxKey, string[]> = {
  swap: ["/sfx/swap.mp3", "/sfx/swap.wav", "/sfx/click.mp3", "/sfx/move.mp3", "/sounds/swap.mp3", "/sounds/click.mp3"],
  match: ["/sfx/match.mp3", "/sfx/match.wav", "/sfx/clear.mp3", "/sfx/pop.mp3", "/sounds/match.mp3", "/sounds/clear.mp3"],
  clear: ["/sfx/clear.mp3", "/sfx/pop.mp3", "/sounds/clear.mp3"],
  runicClear: ["/sfx/runic-clear.mp3", "/sfx/clear-special.mp3", "/sfx/sparkle-clear.mp3", "/sounds/runic-clear.mp3"],
  chain: ["/sfx/chain.mp3", "/sfx/combo.mp3", "/sfx/special-chain.mp3", "/sounds/chain.mp3"],
  special: ["/sfx/special.mp3", "/sfx/powerup.mp3", "/sfx/magic.mp3", "/sounds/special.mp3"],
  spawn: ["/sfx/spawn.mp3", "/sfx/spawn.wav", "/sfx/spawn.ogg", "/sfx/spawn.m4a", "/sfx/spawn", "/sfx/special.mp3", "/sfx/powerup.mp3"],
  convert: ["/sfx/clickclick.mp3", "/sfx/clickclick.wav", "/sfx/clickclick.ogg", "/sfx/clickclick.m4a", "/sfx/clickclick", "/sfx/convert.mp3", "/sfx/special-create.mp3", "/sfx/powerup.mp3", "/sounds/convert.mp3"],
  bomb: ["/sfx/bomb.mp3", "/sfx/bomb.wav", "/sfx/pop.mp3", "/sfx/clear.mp3", "/sounds/bomb.mp3"],
  golden: ["/sfx/zap.mp3", "/sfx/zap.wav", "/sfx/zap.ogg", "/sfx/zap.m4a", "/sfx/zap", "/sounds/zap.mp3"],
  lotus: ["/sfx/magic.mp3", "/sfx/magic.wav", "/sfx/magic.ogg", "/sfx/magic.m4a", "/sfx/lotus.mp3", "/sfx/lotus.wav", "/sfx/colorbomb.mp3", "/sfx/special.mp3", "/sounds/lotus.mp3", "/sounds/colorbomb.mp3"],
  finale: ["/sfx/finale.mp3", "/sfx/win.mp3", "/sfx/level-complete.mp3", "/sounds/finale.mp3"],
  fog: ["/sfx/fog.mp3", "/sfx/fog.wav", "/sfx/crumble.mp3", "/sfx/stone.mp3", "/sounds/fog.mp3", "/sounds/crumble.mp3"],
  bad: ["/sfx/bad.mp3", "/sfx/error.mp3", "/sfx/wrong.mp3", "/sounds/bad.mp3", "/sounds/error.mp3"],
  win: ["/sfx/win.mp3", "/sfx/level-complete.mp3", "/sfx/complete.mp3", "/sounds/win.mp3", "/sounds/complete.mp3"],
};

const RUNE_GLOW: Record<Rune, number> = {
  blue: 0x9fe6ff,
  spiral: 0x2db9ff,
  orange: 0xffa32e,
  triangle: 0xff4a42,
  leaf: 0x60ef78,
  golden: 0xffdc68,
  lotus: 0xffd8f4,
};

const CHAIN_PHRASES = ["Bushido", "Rune Rush", "Legendary", "Golden", "Quiet Bloom"];

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const idx = (r: number, c: number) => r * N + c;
const rc = (i: number) => ({ r: Math.floor(i / N), c: i % N });
const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeBack = (t: number) => {
  const c1 = 1.55;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);
const easeSoftBack = (t: number) => {
  const c1 = 1.05;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

let nextTileId = 1;
function newTile(r: number, c: number, color: Rune): Tile {
  return { id: nextTileId++, r, c, color, rune: color, special: "none" };
}

function getLevel(levelIndex: number): Level {
  const num = levelIndex + 1;

  // Scoring v69: lower points/bonuses so even easy levels take longer.
  // Requested rhythm:
  // Easy → Easy → Normal → Normal → Hard → Easy relief → Normal → Hard → Very Hard.
  // This keeps the game longer and more structured, but still gives relief before spikes.
  const rhythm = ["easy", "easy", "normal", "normal", "hard", "relief", "normal", "hard", "veryHard"] as const;
  const tier = rhythm[levelIndex % rhythm.length];
  const wave = Math.floor(levelIndex / rhythm.length);

  const scoreBase: Record<typeof tier, number> = {
    relief: 1350,
    easy: 1800,
    normal: 2250,
    hard: 2550,
    veryHard: 3150,
  };

  const scoreRamp: Record<typeof tier, number> = {
    relief: 95,
    easy: 115,
    normal: 135,
    hard: 155,
    veryHard: 180,
  };

  const moveBase: Record<typeof tier, number> = {
    relief: 22,
    easy: 19,
    normal: 19,
    hard: 18,
    veryHard: 18,
  };

  const minMoves: Record<typeof tier, number> = {
    relief: 18,
    easy: 16,
    normal: 15,
    hard: 14,
    veryHard: 14,
  };

  const baseMoves = clamp(moveBase[tier] - Math.floor(wave * 0.45), minMoves[tier], moveBase[tier]);
  const targetScore = Math.round(scoreBase[tier] + levelIndex * scoreRamp[tier] + wave * 260);

  if (num % 3 === 0) {
    const fogBase: Record<typeof tier, number> = {
      relief: 4,
      easy: 5,
      normal: 7,
      hard: 9,
      veryHard: 12,
    };

    return {
      idx: levelIndex,
      moves: clamp(baseMoves + (tier === "relief" ? 2 : 1), minMoves[tier], moveBase[tier] + 2),
      objectiveKind: "fog",
      targetScore,
      collectTarget: {},
      fogCount: clamp(fogBase[tier] + wave * 2, fogBase[tier], tier === "veryHard" ? 22 : 18),
    };
  }

  if (num % 4 === 0 || num % 5 === 0) {
    const first = PALETTE[(levelIndex * 2 + 1) % PALETTE.length];
    const second = PALETTE[(levelIndex * 3 + 4) % PALETTE.length];

    const collectBase: Record<typeof tier, number> = {
      relief: 9,
      easy: 12,
      normal: 14,
      hard: 17,
      veryHard: 20,
    };

    const base = clamp(collectBase[tier] + wave * 2, collectBase[tier], tier === "veryHard" ? 28 : 24);
    const collectTarget: Partial<Record<Rune, number>> = { [first]: base };

    // Extra-color collect goals only appear on harder/later levels so early levels are longer,
    // not unfair.
    if ((tier === "hard" && num >= 8) || tier === "veryHard" || (tier === "normal" && num >= 13)) {
      collectTarget[second] = clamp(base - (tier === "veryHard" ? 5 : 6), 8, 22);
    }

    return {
      idx: levelIndex,
      moves: clamp(baseMoves + (tier === "relief" ? 3 : 2), minMoves[tier] + 1, moveBase[tier] + 3),
      objectiveKind: "collect",
      targetScore,
      collectTarget,
      fogCount: 0,
    };
  }

  return {
    idx: levelIndex,
    moves: baseMoves,
    objectiveKind: "score",
    targetScore,
    collectTarget: {},
    fogCount: 0,
  };
}

function randRune() {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)];
}

function makeInitialTiles(fog: (boolean | null)[]) {
  const grid: (Tile | null)[] = new Array(N * N).fill(null);

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      let color = randRune();
      let safe = 0;

      // Avoid starting-board auto matches.
      while (safe++ < 80) {
        const left1 = c >= 1 ? grid[idx(r, c - 1)] : null;
        const left2 = c >= 2 ? grid[idx(r, c - 2)] : null;
        const up1 = r >= 1 ? grid[idx(r - 1, c)] : null;
        const up2 = r >= 2 ? grid[idx(r - 2, c)] : null;

        if (left1?.color === color && left2?.color === color) color = randRune();
        else if (up1?.color === color && up2?.color === color) color = randRune();
        else break;
      }

      grid[idx(r, c)] = newTile(r, c, color);
    }
  }

  // Fog/chocolate cells still render a tile underneath, but they are blocked until cleared.
  return grid.filter(Boolean) as Tile[];
}

function initFog(count: number) {
  const fog: (boolean | null)[] = new Array(N * N).fill(null);
  const cells = Array.from({ length: N * N }, (_, i) => i);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  for (let i = 0; i < count; i++) fog[cells[i]] = true;
  return fog;
}

function toGrid(tiles: Tile[]) {
  const grid: (Tile | null)[] = new Array(N * N).fill(null);
  for (const t of tiles) grid[idx(t.r, t.c)] = t;
  return grid;
}

function computeMatches(tiles: Tile[], fog: (boolean | null)[]) {
  const grid = toGrid(tiles);
  const clear = new Set<number>();
  const hRun = new Array(N * N).fill(0);
  const vRun = new Array(N * N).fill(0);

  for (let r = 0; r < N; r++) {
    let c = 0;
    while (c < N) {
      if (fog[idx(r, c)]) {
        c++;
        continue;
      }
      const t = grid[idx(r, c)];
      if (!t) {
        c++;
        continue;
      }
      const color = t.color;
      let end = c + 1;
      while (end < N) {
        if (fog[idx(r, end)]) break;
        const u = grid[idx(r, end)];
        if (!u || u.color !== color) break;
        end++;
      }
      const len = end - c;
      if (len >= 3) {
        for (let cc = c; cc < end; cc++) {
          clear.add(idx(r, cc));
          hRun[idx(r, cc)] = len;
        }
      }
      c = end;
    }
  }

  for (let c = 0; c < N; c++) {
    let r = 0;
    while (r < N) {
      if (fog[idx(r, c)]) {
        r++;
        continue;
      }
      const t = grid[idx(r, c)];
      if (!t) {
        r++;
        continue;
      }
      const color = t.color;
      let end = r + 1;
      while (end < N) {
        if (fog[idx(end, c)]) break;
        const u = grid[idx(end, c)];
        if (!u || u.color !== color) break;
        end++;
      }
      const len = end - r;
      if (len >= 3) {
        for (let rr = r; rr < end; rr++) {
          clear.add(idx(rr, c));
          vRun[idx(rr, c)] = len;
        }
      }
      r = end;
    }
  }

  return { clear, hRun, vRun };
}

function spawnFromMatch(h: number, v: number) {
  const is5 = h >= 5 || v >= 5;
  const isTL = h >= 3 && v >= 3;
  const is4 = (h >= 4 && v < 3) || (v >= 4 && h < 3);
  if (is5 || isTL) return { special: "lotus" as const, rune: "lotus" as const, priority: 3 };
  if (is4) return { special: "golden" as const, rune: "golden" as const, priority: 2 };
  return null;
}

function chooseSpawn(m: ReturnType<typeof computeMatches>, preferred: number[]) {
  const candidates: { k: number; special: Special; rune: Rune; priority: number; preferred: boolean }[] = [];
  for (const k of Array.from(m.clear)) {
    const s = spawnFromMatch(m.hRun[k] || 0, m.vRun[k] || 0);
    if (!s) continue;
    candidates.push({ ...s, k, preferred: preferred.includes(k) });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    if (a.preferred !== b.preferred) return a.preferred ? -1 : 1;
    return b.priority - a.priority;
  });
  return candidates[0];
}

function areNeighbors(a: Tile, b: Tile) {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
}

async function safeLoadTexture(urls: string[]): Promise<Texture | null> {
  for (const url of urls) {
    try {
      const tex = (await Assets.load(url)) as Texture;
      if (tex) {
        const anyTex = tex as any;
        try {
          if (anyTex.source) {
            anyTex.source.scaleMode = "linear";
            anyTex.source.autoGenerateMipmaps = true;
            if (typeof anyTex.source.updateMipmaps === "function") anyTex.source.updateMipmaps();
            if (typeof anyTex.source.update === "function") anyTex.source.update();
          }
          if (anyTex.baseTexture) {
            anyTex.baseTexture.scaleMode = "linear";
            anyTex.baseTexture.mipmap = "on";
            if (typeof anyTex.baseTexture.update === "function") anyTex.baseTexture.update();
          }
        } catch {}
        return tex;
      }
    } catch {}
  }
  return null;
}

export default function RuneRushPixiBoard({ levelIndex, onHud, soundOn = true, onLevelComplete, onLevelFailed }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const onHudRef = useRef(onHud);
  const onLevelCompleteRef = useRef(onLevelComplete);
  const onLevelFailedRef = useRef(onLevelFailed);
  const soundOnRef = useRef(soundOn);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const originalSfxRef = useRef<Partial<Record<SfxKey, HTMLAudioElement>>>({});

  useEffect(() => {
    onHudRef.current = onHud;
  }, [onHud]);

  useEffect(() => {
    onLevelCompleteRef.current = onLevelComplete;
  }, [onLevelComplete]);

  useEffect(() => {
    onLevelFailedRef.current = onLevelFailed;
  }, [onLevelFailed]);

  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);

  const getSharedSfxBank = () => {
    if (typeof window === "undefined") return originalSfxRef.current;
    const w = window as any;
    if (!w.__tobyRuneRushSfxBank) w.__tobyRuneRushSfxBank = {};
    originalSfxRef.current = w.__tobyRuneRushSfxBank;
    return originalSfxRef.current;
  };

  const unlockAudio = () => {
    if (!soundOnRef.current) return;
    const ctx = getAudioCtx();
    if (ctx?.state === "suspended") ctx.resume().catch(() => {});
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const bank = getSharedSfxBank();

    for (const key of Object.keys(ORIGINAL_SFX) as SfxKey[]) {
      if (bank[key]) continue;

      for (const src of ORIGINAL_SFX[key]) {
        const audio = new Audio(src);
        audio.preload = "auto";
        audio.volume = key === "bad" ? 0.34 : key === "golden" || key === "lotus" ? 0.48 : 0.42;

        // Use the first listed file immediately so sounds do not disappear after level remount.
        // If it 404s, the fallback synth still plays.
        if (!bank[key]) bank[key] = audio;

        const ready = () => {
          if (!cancelled && !bank[key]) bank[key] = audio;
        };

        audio.addEventListener("loadeddata", ready, { once: true });
        audio.addEventListener("canplaythrough", ready, { once: true });
        audio.addEventListener("error", () => {}, { once: true });
        try { audio.load(); } catch {}
        break;
      }
    }

    originalSfxRef.current = bank;
    return () => { cancelled = true; };
  }, []);

  const playOriginalSfx = (key: SfxKey) => {
    if (!soundOnRef.current) return false;
    const bank = getSharedSfxBank();
    const audio = bank[key];
    if (!audio) return false;
    try {
      audio.pause();
      audio.currentTime = 0;
      const result = audio.play();
      if (result && typeof result.catch === "function") result.catch(() => {});
      return true;
    } catch {
      return false;
    }
  };

  const getAudioCtx = () => {
    if (typeof window === "undefined") return null;
    const w = window as any;
    const AudioCtor = window.AudioContext || w.webkitAudioContext;
    if (!AudioCtor) return null;
    if (!w.__tobyRuneRushAudioCtx) w.__tobyRuneRushAudioCtx = new AudioCtor();
    audioCtxRef.current = w.__tobyRuneRushAudioCtx;
    if (audioCtxRef.current?.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  };

  const tone = (freq: number, ms: number, gain = 0.035, type: OscillatorType = "sine", delay = 0, endFreq?: number) => {
    if (!soundOnRef.current) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), start + ms / 1000);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(gain, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, start + ms / 1000);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + ms / 1000 + 0.03);
  };

  const crumble = (ms = 70, gain = 0.035, delay = 0, cutoff = 720) => {
    if (!soundOnRef.current) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const length = Math.max(1, Math.floor(ctx.sampleRate * (ms / 1000)));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const decay = 1 - i / length;
      data[i] = (Math.random() * 2 - 1) * decay * decay;
    }
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(cutoff, start);
    filter.Q.setValueAtTime(1.8, start);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(gain, start + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, start + ms / 1000);
    src.buffer = buffer;
    src.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    src.start(start);
    src.stop(start + ms / 1000 + 0.03);
  };

  const playSfx = (key: SfxKey) => {
    if (!soundOnRef.current) return;
    if (playOriginalSfx(key)) return;

    const sparkleRun = (base = 760, delay = 0, gain = 0.008) => {
      tone(base, 42, gain, "sine", delay);
      tone(base * 1.28, 50, gain * 0.82, "triangle", delay + 0.038);
      tone(base * 1.62, 58, gain * 0.65, "sine", delay + 0.078);
    };

    const crystalTick = (delay = 0, pitch = 1180, gain = 0.007) => {
      tone(pitch, 28, gain, "sine", delay, pitch * 1.18);
      tone(pitch * 2.01, 34, gain * 0.42, "triangle", delay + 0.012);
    };

    const crystalRain = (delay = 0, base = 920, gain = 0.007) => {
      crystalTick(delay, base, gain);
      crystalTick(delay + 0.055, base * 1.18, gain * 0.86);
      crystalTick(delay + 0.112, base * 1.42, gain * 0.72);
      crystalTick(delay + 0.18, base * 1.74, gain * 0.55);
    };

    const gemPop = (delay = 0, pitch = 880, gain = 0.012) => {
      tone(pitch, 38, gain, "triangle", delay, pitch * 1.35);
      tone(pitch * 2.02, 44, gain * 0.42, "sine", delay + 0.018);
      crumble(28, gain * 0.35, delay + 0.01, pitch * 1.15);
    };

    const magicRise = (delay = 0, base = 220, gain = 0.018) => {
      tone(base, 210, gain, "sine", delay, base * 2);
      tone(base * 1.5, 260, gain * 0.75, "sine", delay + 0.045, base * 3.1);
      tone(base * 2.4, 180, gain * 0.55, "triangle", delay + 0.12, base * 4.4);
      crumble(70, gain * 0.24, delay + 0.1, base * 4.2);
    };

    const rewardChord = (delay = 0, gain = 0.018) => {
      tone(523, 105, gain, "sine", delay);
      tone(659, 115, gain * 0.82, "sine", delay + 0.035);
      tone(784, 132, gain * 0.72, "triangle", delay + 0.072);
      tone(1046, 160, gain * 0.5, "sine", delay + 0.11);
    };

    const deepBloom = (delay = 0, gain = 0.016) => {
      tone(98, 130, gain * 0.78, "triangle", delay, 73);
      tone(196, 170, gain * 0.55, "sine", delay + 0.025, 392);
      crumble(72, gain * 0.45, delay + 0.012, 520);
    };

    const electricZip = (delay = 0, gain = 0.012) => {
      tone(1480, 44, gain, "triangle", delay, 2400);
      tone(2600, 34, gain * 0.52, "sine", delay + 0.028, 1700);
      crumble(34, gain * 0.75, delay + 0.012, 2600);
    };

    // Keep swap sound exactly light/simple.
    if (key === "swap") {
      tone(220, 36, 0.011, "triangle", 0, 300);
      tone(420, 32, 0.007, "sine", 0.026);
      return;
    }

    if (key === "match") {
      gemPop(0, 620, 0.01);
      gemPop(0.038, 820, 0.007);
      crumble(42, 0.012, 0.008, 980);
      return;
    }

    if (key === "clear") {
      // Small normal clear: crisp rune-pop with a tiny shimmer tail.
      gemPop(0, 720, 0.009);
      crystalTick(0.052, 1180, 0.005);
      crumble(34, 0.005, 0.018, 1280);
      return;
    }

    if (key === "runicClear") {
      // Bigger Runic Clear: rune pop + sparkly crystal rain + reward chord.
      deepBloom(0, 0.012);
      sparkleRun(760, 0.035, 0.009);
      crystalRain(0.12, 980, 0.008);
      rewardChord(0.28, 0.013);
      tone(1568, 190, 0.008, "sine", 0.43);
      return;
    }

    if (key === "chain") {
      // Special chain reaction: rising machine-like magical sequence.
      tone(196, 80, 0.013, "triangle", 0, 392);
      tone(392, 90, 0.01, "triangle", 0.055, 784);
      electricZip(0.105, 0.007);
      crystalRain(0.15, 920, 0.006);
      rewardChord(0.3, 0.01);
      return;
    }

    if (key === "special") {
      // Special awakened during chain reaction.
      magicRise(0, 220, 0.012);
      crystalRain(0.11, 1120, 0.005);
      tone(1760, 115, 0.006, "sine", 0.22);
      return;
    }

    if (key === "spawn") {
      // New special spawned from a 4/5 match.
      magicRise(0, 260, 0.011);
      crystalTick(0.08, 980, 0.006);
      tone(1320, 90, 0.005, "sine", 0.16);
      return;
    }

    if (key === "golden") {
      // Golden Toby: lower warm lightning hit, not squeaky.
      tone(150, 62, 0.014, "triangle", 0, 230);
      tone(420, 72, 0.012, "triangle", 0.018, 760);
      tone(760, 82, 0.009, "sine", 0.055, 1040);
      crumble(46, 0.014, 0.028, 940);
      tone(980, 70, 0.005, "sine", 0.12);
      return;
    }

    if (key === "convert") {
      // Rune turns into a special during Rune Rush finale.
      tone(330, 42, 0.009, "triangle", 0, 520);
      tone(660, 55, 0.007, "sine", 0.032, 990);
      crystalTick(0.078, 1180, 0.0045);
      return;
    }

    if (key === "bomb") {
      // Bomb: low thump + crackle + gem tail.
      deepBloom(0, 0.024);
      tone(380, 72, 0.013, "sawtooth", 0.028, 160);
      crumble(120, 0.038, 0.02, 380);
      gemPop(0.11, 620, 0.009);
      return;
    }

    if (key === "lotus") {
      // Rare magical bloom: soft rise, crystal rain, chord, petal shimmer.
      magicRise(0, 174, 0.022);
      tone(523, 260, 0.017, "sine", 0.08, 1046);
      tone(784, 320, 0.014, "triangle", 0.18, 1568);
      crystalRain(0.29, 1180, 0.007);
      sparkleRun(1660, 0.43, 0.006);
      rewardChord(0.56, 0.013);
      crumble(82, 0.005, 0.22, 1700);
      return;
    }

    if (key === "finale") {
      tone(392, 150, 0.024, "sine", 0, 784);
      tone(587, 170, 0.021, "sine", 0.055, 1174);
      tone(1174, 210, 0.016, "triangle", 0.16);
      tone(1760, 240, 0.012, "sine", 0.28);
      crystalRain(0.34, 980, 0.008);
      rewardChord(0.54, 0.018);
      crumble(66, 0.008, 0.12, 1150);
      return;
    }

    if (key === "fog") {
      crumble(100, 0.035, 0, 440);
      tone(170, 90, 0.012, "triangle", 0, 92);
      return;
    }

    if (key === "bad") {
      crumble(80, 0.025, 0, 280);
      tone(180, 65, 0.018, "square", 0, 130);
      return;
    }

    if (key === "win") {
      rewardChord(0, 0.024);
      crystalRain(0.12, 1040, 0.007);
      tone(1568, 240, 0.012, "sine", 0.25);
      return;
    }
  };


  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let app: Application | null = null;
    let hintTimer: ReturnType<typeof setInterval> | null = null;
    const timeoutIds = new Set<ReturnType<typeof window.setTimeout>>();

    const queueTimer = (fn: () => void, ms = 0) => {
      if (typeof window === "undefined") return null;
      const id = window.setTimeout(() => {
        timeoutIds.delete(id);
        if (!cancelled) fn();
      }, ms);
      timeoutIds.add(id);
      return id;
    };

    const clearQueuedTimers = () => {
      timeoutIds.forEach((id) => window.clearTimeout(id));
      timeoutIds.clear();
    };

    const run = async () => {
      host.innerHTML = "";
      nextTileId = 1;

      const level = getLevel(levelIndex);
      let moves = level.moves;
      let score = 0;
      let combo = 0;
      let phase: Phase = "idle";
      let message = "Swipe runes to match 3+";
      let levelFailedNotified = false;
      let lastAction = Date.now();
      let fogClearedThisMove = false;
      let collectRemaining: Partial<Record<Rune, number>> = { ...level.collectTarget };
      let fog = initFog(level.fogCount);
      let tiles = makeInitialTiles(fog);

      // Safety: never start a level with automatic matches.
      // Starting matches can immediately trigger a runaway cascade on mobile and make the board look like it is melting/glitching.
      let startGuard = 0;
      while (computeMatches(tiles, fog).clear.size > 0 && startGuard++ < 30) {
        nextTileId = 1;
        tiles = makeInitialTiles(fog);
      }

      const rect = host.getBoundingClientRect();
      // Full-board sizing: the playable 7x7 grid now uses almost the entire frame.
      // No extra centered canvas margin, no big empty bottom/right space.
      const hostSize = Math.floor(Math.min(rect.width || 420, rect.height || rect.width || 420));
      const size = Math.max(286, hostSize);
      const n = N;
      const pad = Math.max(7, Math.round(size * 0.018));
      const gap = Math.max(4, Math.round(size * 0.011));
      const tileSize = Math.floor((size - pad * 2 - gap * (n - 1)) / n);
      const boardSize = pad * 2 + tileSize * n + gap * (n - 1);
      const xy = (r: number, c: number) => ({
        x: pad + c * (tileSize + gap),
        y: pad + r * (tileSize + gap),
      });

      const deviceMemory = typeof navigator !== "undefined" ? Number((navigator as any).deviceMemory || 4) : 4;
      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      const isMobileView = typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)")?.matches || boardSize < 430);
      const rendererResolution = isMobileView ? Math.min(dpr || 1, 1.85) : Math.min(dpr || 1, 2);
      const fxQuality = Math.max(0.42, Math.min(0.94, (tileSize / 52) * (deviceMemory <= 3 ? 0.52 : 1) * (isMobileView ? 0.64 : 1) * (dpr > 2.4 ? 0.76 : 1)));
      const fxCount = (n: number) => Math.max(1, Math.round(n * fxQuality));
      const fxSize = (n: number) => Math.max(2, n * Math.min(1.0, Math.max(0.66, fxQuality)));
      const wait = (ms: number) =>
        new Promise<void>((resolve) => {
          queueTimer(resolve, ms);
        });

      app = new Application();
      await app.init({
        width: boardSize,
        height: boardSize,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: rendererResolution,
        preference: "webgl",
        failIfMajorPerformanceCaveat: false,
      } as any);

      if (cancelled || !app) return;
      try {
        (app.renderer as any).roundPixels = true;
        (app.renderer as any).textureGC?.run?.();
      } catch {}
      const canvas = app.canvas as HTMLCanvasElement;
      canvas.style.display = "block";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.margin = "0 auto";
      canvas.style.touchAction = "none";
      host.appendChild(canvas);
      const stage = app.stage;
      const board = new Container();
      const tileLayer = new Container();
      const fogLayer = new Container();
      const fxLayer = new Container();
      const textLayer = new Container();
      stage.addChild(board, tileLayer, fogLayer, fxLayer, textLayer);

      const stoneTex = await safeLoadTexture([`/textures/obsidian.png?v=full13`, `/textures/stone.png?v=full13`]);
      const sharpenTexture = (tex: Texture | null | undefined) => {
        if (!tex) return;
        const anyTex = tex as any;
        try {
          if (anyTex.source) {
            anyTex.source.scaleMode = "nearest";
            anyTex.source.autoGenerateMipmaps = false;
            if (typeof anyTex.source.update === "function") anyTex.source.update();
          }
          if (anyTex.baseTexture) {
            anyTex.baseTexture.scaleMode = "nearest";
            anyTex.baseTexture.mipmap = "off";
            if (typeof anyTex.baseTexture.update === "function") anyTex.baseTexture.update();
          }
        } catch {}
      };

      const runeTextures: Partial<Record<Rune, Texture | null>> = {};
      for (const rune of ["blue", "spiral", "orange", "triangle", "leaf", "golden", "lotus"] as Rune[]) {
        const tex = await safeLoadTexture([`${RUNE_FILES[rune]}?v=full13`, RUNE_FILES[rune]]);
        sharpenTexture(tex);
        runeTextures[rune] = tex;
      }

      // Do not block the board on optional FX packs.
      // Mobile/Base App can hang if many optional files 404 during startup.
      const lotusPetalTextures: Texture[] = [];
      const luxuryParticleTextures: Texture[] = [];

      if (cancelled || !app) return;

      queueTimer(() => {
        if (cancelled) return;
        void Promise.allSettled(
          LUXURY_PARTICLE_FILES.slice(0, isMobileView ? 5 : LUXURY_PARTICLE_FILES.length).map(async (src) => {
            const tex = await safeLoadTexture([`${src}?v=lux47`, src]);
            if (tex && !cancelled) luxuryParticleTextures.push(tex);
          })
        );
      }, 40);

      const tileViews = new Map<number, TileView>();
      const instantHiddenSpecialIds = new Set<number>();
      const tweens: Tween[] = [];

      const hud = () => {
        let objectiveLabel = "Reach Score";
        let objectiveText = `${score}/${level.targetScore}`;
        let progress = clamp(score / level.targetScore, 0, 1);
        let collect: Partial<Record<Rune, number>> | undefined;

        if (level.objectiveKind === "collect") {
          objectiveLabel = "Collect Runes";
          const total = Object.values(level.collectTarget).reduce((a, b) => a + (b ?? 0), 0) || 1;
          const remain = Object.values(collectRemaining).reduce((a, b) => a + (b ?? 0), 0) || 0;
          objectiveText = `${total - remain}/${total}`;
          progress = clamp((total - remain) / total, 0, 1);
          collect = { ...collectRemaining };
        } else if (level.objectiveKind === "fog") {
          objectiveLabel = "Clear Fog";
          const remain = fog.filter(Boolean).length;
          objectiveText = `${level.fogCount - remain}/${level.fogCount}`;
          progress = clamp((level.fogCount - remain) / Math.max(1, level.fogCount), 0, 1);
        }

        onHudRef.current({
          level: levelIndex + 1,
          moves,
          score,
          combo,
          lives: MAX_LIVES,
          objectiveKind: level.objectiveKind,
          objectiveLabel,
          objectiveText,
          progress,
          collect,
          phase,
          message,
        });
      };

      const addTween = (target: any, to: Record<string, number>, ms: number, ease = easeOutCubic) =>
        new Promise<void>((resolve) => {
          if (cancelled || !target || target.destroyed || target._destroyed) {
            resolve();
            return;
          }

          const from: Record<string, number> = {};
          for (const k of Object.keys(to)) {
            const current = target?.[k];
            from[k] = Number.isFinite(Number(current)) ? Number(current) : 0;
          }

          tweens.push({ target, from, to, elapsed: 0, ms: Math.max(1, ms), ease, done: resolve });
        });

      const gsapTo = (target: any, to: Record<string, any>, ms: number, ease = "power3.out") =>
        new Promise<void>((resolve) => {
          gsap.to(target, {
            ...to,
            duration: ms / 1000,
            ease,
            overwrite: "auto",
            onComplete: resolve,
            onInterrupt: resolve,
          });
        });

      const addTempFilter = (target: any, filter: any, ms = 520) => {
        try {
          const previous = Array.isArray(target.filters) ? [...target.filters] : [];
          target.filters = [...previous, filter];
          queueTimer(() => {
            try {
              target.filters = previous;
              filter?.destroy?.();
            } catch {}
          }, ms);
        } catch {}
      };

      const premiumGlow = (target: any, color = 0xfff1b0, ms = 520, strength = 1.8) => {
        try {
          const filter = new GlowFilter({
            distance: Math.max(8, Math.round(tileSize * 0.42)),
            outerStrength: strength,
            innerStrength: 0.28,
            color,
            quality: 0.28,
          } as any);
          addTempFilter(target, filter, ms);
        } catch {}
      };

      const premiumBloom = (target: any, ms = 560, strength = 0.9) => {
        try {
          const filter = new AdvancedBloomFilter({
            threshold: 0.24,
            bloomScale: strength,
            brightness: 1.08,
            blur: Math.max(3, tileSize * 0.08),
            quality: 0.24,
          } as any);
          addTempFilter(target, filter, ms);
        } catch {}
      };

      const premiumMotionBlur = (target: any, dir: "h" | "v", ms = 180) => {
        try {
          const velocity = dir === "h" ? { x: tileSize * 0.72, y: 0 } : { x: 0, y: tileSize * 0.72 };
          const filter = new MotionBlurFilter(velocity as any, Math.max(5, tileSize * 0.16), 0) as any;
          addTempFilter(target, filter, ms);
        } catch {}
      };

      const makeProceduralParticle = (style: string, x: number, y: number, size: number, alpha = 1, tint?: number) => {
        const color = tint ?? 0xffefb0;
        const name = String(style || "sparkle").toLowerCase();
        const wrap = new Container();
        wrap.x = x;
        wrap.y = y;
        wrap.alpha = alpha;

        const addShard = (rot: number, length = 0.42, width = 0.055, a = 0.72, c = color) => {
          const shard = new Graphics();
          shard.roundRect(-size * width * 0.5, -size * length * 0.5, size * width, size * length, 999);
          shard.fill({ color: c, alpha: a });
          shard.rotation = rot;
          wrap.addChild(shard);
        };

        if (name.includes("petal")) {
          for (let i = 0; i < 3; i++) {
            const petal = new Graphics();
            petal.roundRect(-size * 0.06, -size * 0.25, size * 0.12, size * 0.32, 999);
            petal.fill({ color: i % 2 ? 0xffffff : color, alpha: i % 2 ? 0.44 : 0.68 });
            petal.rotation = (Math.PI * 2 * i) / 3 + Math.random() * 0.2;
            wrap.addChild(petal);
          }
        } else if (name.includes("twirl") || name.includes("magic")) {
          for (let i = 0; i < 3; i++) {
            const ring = new Graphics();
            ring.circle(0, 0, size * (0.14 + i * 0.08));
            ring.stroke({ color: i % 2 ? 0xffffff : color, alpha: 0.38 - i * 0.07, width: Math.max(1, size * 0.018) });
            wrap.addChild(ring);
          }
          addShard(Math.PI * 0.18, 0.34, 0.04, 0.5, 0xffffff);
          addShard(Math.PI * 1.1, 0.28, 0.04, 0.42, color);
        } else if (name.includes("smoke")) {
          for (let i = 0; i < 3; i++) {
            const puff = new Graphics();
            puff.circle((Math.random() - 0.5) * size * 0.22, (Math.random() - 0.5) * size * 0.22, size * (0.13 + Math.random() * 0.06));
            puff.fill({ color: i % 2 ? 0xffffff : color, alpha: 0.16 + Math.random() * 0.12 });
            wrap.addChild(puff);
          }
        } else if (name.includes("star") || name.includes("spark")) {
          const points = name.includes("star") ? 6 : 4;
          for (let i = 0; i < points; i++) addShard((Math.PI * i) / points, 0.34 + Math.random() * 0.18, 0.036, i % 2 ? 0.54 : 0.78, i % 2 ? 0xffffff : color);
          const core = new Graphics();
          core.circle(0, 0, Math.max(1.2, size * 0.055));
          core.fill({ color: 0xffffff, alpha: 0.78 });
          wrap.addChild(core);
        } else {
          const dot = new Graphics();
          dot.circle(0, 0, Math.max(1.4, size * 0.12));
          dot.fill({ color, alpha: 0.72 });
          wrap.addChild(dot);
        }

        fxLayer.addChild(wrap);
        return wrap;
      };

      const makeFallbackParticle = (x: number, y: number, size: number, alpha = 0.7, tint = 0xffefb0) => {
        const g = new Graphics();
        g.circle(0, 0, Math.max(1.5, size * 0.16));
        g.fill({ color: tint, alpha });
        g.x = x;
        g.y = y;
        fxLayer.addChild(g);
        premiumGlow(g, tint, 260, 0.95);
        return g;
      };

      const luxuryParticleBurst = (
        files: string[],
        x: number,
        y: number,
        count: number,
        radius: number,
        size: number,
        tint = 0xffefb0,
        ms = 420
      ) => {
        const finalCount = fxCount(count);
        for (let i = 0; i < finalCount; i++) {
          const file = files[i % files.length];
          const angle = (Math.PI * 2 * i) / finalCount + Math.random() * 0.2;
          const particleSize = fxSize(size) * (0.7 + Math.random() * 0.46);
          const particle = makeProceduralParticle(file, x, y, particleSize, 0.72, tint) ?? makeFallbackParticle(x, y, particleSize, 0.58, tint);
          particle.rotation = angle + Math.random() * Math.PI;
          particle.scale.set(0.2 + Math.random() * 0.16);
          const dist = radius * (0.48 + Math.random() * 0.56);
          Promise.all([
            addTween(particle, { x: x + Math.cos(angle) * dist, y: y + Math.sin(angle) * dist, alpha: 0 }, ms + Math.random() * 95, easeOutQuart),
            addTween(particle.scale, { x: 1.05 + Math.random() * 0.58, y: 1.05 + Math.random() * 0.58 }, ms, easeOutQuart),
          ]).then(() => particle.destroy());
        }
      };

      const softTwirl = (file: string, x: number, y: number, size: number, tint: number, ms = 650) => {
        const twirl = makeProceduralParticle(file, x, y, fxSize(size), 0.42, tint);
        if (!twirl) return;
        twirl.scale.set(0.12);
        twirl.rotation = Math.random() * Math.PI;
        Promise.all([
          addTween(twirl.scale, { x: 1.42, y: 1.42 }, ms, easeOutQuart),
          addTween(twirl, { alpha: 0, rotation: twirl.rotation + Math.PI * 0.72 }, ms, easeOutQuart),
        ]).then(() => twirl.destroy());
      };

      const microShake = (amount = 2, ms = 110) => {
        const originalX = stage.x;
        const originalY = stage.y;
        stage.x = originalX - amount;
        stage.y = originalY + amount * 0.35;
        queueTimer(() => {
          stage.x = originalX + amount;
          stage.y = originalY - amount * 0.25;
        }, Math.round(ms * 0.35));
        queueTimer(() => {
          stage.x = originalX;
          stage.y = originalY;
        }, ms);
      };

      const candySparkBurst = (x: number, y: number, tint = 0xffefb0, power = 1) => {
        const count = fxCount(10 * power);
        for (let i = 0; i < count; i++) {
          const angle = (Math.PI * 2 * i) / count + Math.random() * 0.18;
          const shard = new Graphics();
          const long = tileSize * (0.1 + Math.random() * 0.1) * power;
          const thick = Math.max(1.2, tileSize * 0.018);
          shard.roundRect(-thick / 2, -long / 2, thick, long, 999);
          shard.fill({ color: i % 3 === 0 ? 0xffffff : tint, alpha: 0.78 });
          shard.x = x;
          shard.y = y;
          shard.rotation = angle;
          shard.scale.set(0.35);
          fxLayer.addChild(shard);
          const dist = tileSize * (0.38 + Math.random() * 0.4) * power;
          Promise.all([
            addTween(shard, { x: x + Math.cos(angle) * dist, y: y + Math.sin(angle) * dist, alpha: 0 }, 210 + Math.random() * 90, easeOutQuart),
            addTween(shard.scale, { x: 1.35, y: 1.35 }, 220, easeOutQuart),
          ]).then(() => shard.destroy());
        }
      };

      const candyPuffBurst = (x: number, y: number, tint = 0xffefb0, power = 1) => {
        const count = fxCount(7 * power);
        for (let i = 0; i < count; i++) {
          const angle = (Math.PI * 2 * i) / count + Math.random() * 0.2;
          const puff = new Graphics();
          puff.circle(0, 0, tileSize * (0.035 + Math.random() * 0.025) * power);
          puff.fill({ color: i % 2 ? 0xffffff : tint, alpha: 0.22 });
          puff.x = x;
          puff.y = y;
          fxLayer.addChild(puff);
          const dist = tileSize * (0.22 + Math.random() * 0.22) * power;
          Promise.all([
            addTween(puff, { x: x + Math.cos(angle) * dist, y: y + Math.sin(angle) * dist, alpha: 0 }, 260, easeOutQuart),
            addTween(puff.scale, { x: 2.25, y: 2.25 }, 260, easeOutQuart),
          ]).then(() => puff.destroy());
        }
      };

      const candyFlashPop = (x: number, y: number, tint = 0xffefb0, power = 1) => {
        const flash = new Graphics();
        flash.circle(x, y, tileSize * 0.16 * power);
        flash.fill({ color: 0xffffff, alpha: 0.24 });
        fxLayer.addChild(flash);
        premiumGlow(flash, tint, Math.round(280 * power), 1.38);
        premiumBloom(flash, Math.round(260 * power), 0.58);

        candySparkBurst(x, y, tint, power);
        candyPuffBurst(x, y, tint, power);

        Promise.all([
          addTween(flash.scale, { x: 2.05, y: 2.05 }, 210, easeOutQuart),
          addTween(flash, { alpha: 0 }, 210, easeOutQuart),
        ]).then(() => flash.destroy());
      };

      const getLotusPetalTexture = (i: number) => {
        return lotusPetalTextures.length ? lotusPetalTextures[i % lotusPetalTextures.length] : null;
      };

      const fallbackPetalSprite = (x: number, y: number, size: number, color: number) => {
        const petal = new Graphics();
        petal.roundRect(-size * 0.06, -size * 0.26, size * 0.12, size * 0.36, 999);
        petal.fill({ color, alpha: 0.58 });
        petal.x = x;
        petal.y = y;
        fxLayer.addChild(petal);
        return petal;
      };

      const lotusPetalExplosion = (x: number, y: number, color = 0xffd7f4, power = 1, intensity = 1, rare = true) => {
        // Lightweight/mobile-safe petals:
        // smaller, fewer, faster, and no per-petal filters.
        const wanted = Math.round((rare ? 5 : 2) * intensity);
        const count = Math.max(rare ? 4 : 1, Math.min(rare ? 6 : 2, fxCount(wanted)));
        const baseSize = tileSize * (rare ? 0.09 : 0.05) * power;

        for (let i = 0; i < count; i++) {
          const tex = getLotusPetalTexture(i);
          const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.38;
          const drift = tileSize * (rare ? 0.44 : 0.22) * power * (0.72 + Math.random() * 0.34);
          const size = baseSize * (0.78 + Math.random() * 0.32);

          const petal: any = tex ? new Sprite(tex) : fallbackPetalSprite(x, y, size, color);
          let glowPetal: any = null;
          if (tex) {
            petal.anchor.set(0.5);
            petal.width = size;
            petal.height = size;
            petal.tint = i % 4 === 0 ? 0xffffff : color;
            fxLayer.addChild(petal);

            // Lightweight glow duplicate: tiny additive sprite behind the petal.
            glowPetal = new Sprite(tex);
            glowPetal.anchor.set(0.5);
            glowPetal.width = size * 1.65;
            glowPetal.height = size * 1.65;
            glowPetal.tint = 0xffffff;
            glowPetal.alpha = 0;
            glowPetal.blendMode = "add" as any;
            fxLayer.addChild(glowPetal);
          } else {
            glowPetal = new Graphics();
            glowPetal.circle(0, 0, size * 0.22);
            glowPetal.fill({ color: 0xffffff, alpha: 0.16 });
            glowPetal.x = x;
            glowPetal.y = y;
            glowPetal.alpha = 0;
            glowPetal.blendMode = "add" as any;
            fxLayer.addChild(glowPetal);
          }

          petal.x = x + (Math.random() - 0.5) * tileSize * 0.06;
          petal.y = y + (Math.random() - 0.5) * tileSize * 0.06;
          petal.alpha = 0;
          petal.rotation = angle + Math.PI * 0.5 + (Math.random() - 0.5) * 0.55;
          petal.blendMode = "normal" as any;
          petal.scale.set(0.19 + Math.random() * 0.04);

          glowPetal.x = petal.x;
          glowPetal.y = petal.y;
          glowPetal.rotation = petal.rotation;
          glowPetal.scale.set((petal.scale?.x ?? 0.2) * 1.05);

          const destX = x + Math.cos(angle) * drift;
          const destY = y + Math.sin(angle) * drift - tileSize * (0.08 + Math.random() * 0.1) * power;
          const spin = (Math.random() > 0.5 ? 1 : -1) * (0.34 + Math.random() * 0.36);
          const ms = rare ? 720 + Math.random() * 180 : 520 + Math.random() * 120;

          gsapTo(petal, { alpha: tex ? 0.86 : 0.56 }, 78, "power2.out")
            .then(() => Promise.all([
              gsapTo(petal, { x: destX, y: destY, rotation: petal.rotation + spin, alpha: 0 }, ms, "power3.out"),
              gsapTo(petal.scale, { x: 0.36 + Math.random() * 0.10, y: 0.36 + Math.random() * 0.10 }, ms, "power3.out"),
              gsapTo(glowPetal, { x: destX, y: destY, rotation: petal.rotation + spin, alpha: 0 }, ms, "power3.out"),
              gsapTo(glowPetal.scale, { x: 0.56 + Math.random() * 0.12, y: 0.56 + Math.random() * 0.12 }, ms, "power3.out"),
            ]))
            .then(() => {
              petal.destroy();
              glowPetal.destroy();
            });
        }
      };

      const rareLotusBloom = (x: number, y: number, color = 0xffd7f4, power = 1, intensity = 1) => {
        const core = new Graphics();
        core.roundRect(-tileSize * 0.13 * power, -tileSize * 0.13 * power, tileSize * 0.26 * power, tileSize * 0.26 * power, tileSize * 0.07 * power);
        core.fill({ color: 0xffffff, alpha: 0.2 });
        core.x = x;
        core.y = y;
        core.rotation = Math.PI / 4;
        fxLayer.addChild(core);
        premiumGlow(core, color, 420, 1.4);
        premiumBloom(core, 300, 0.55);

        lotusPetalExplosion(x, y, color, power, intensity, true);

        const shardCount = Math.max(4, Math.min(7, fxCount(6 * intensity)));
        for (let i = 0; i < shardCount; i++) {
          const angle = (Math.PI * 2 * i) / shardCount + Math.random() * 0.18;
          const shard = new Graphics();
          shard.roundRect(-tileSize * 0.012 * power, -tileSize * 0.2 * power, tileSize * 0.024 * power, tileSize * 0.16 * power, 999);
          shard.fill({ color: i % 2 ? 0xffffff : color, alpha: 0.5 });
          shard.x = x;
          shard.y = y;
          shard.rotation = angle + Math.PI * 0.5;
          shard.scale.set(0.35);
          fxLayer.addChild(shard);
          const dist = tileSize * (0.32 + Math.random() * 0.16) * power;
          Promise.all([
            gsapTo(shard, { x: x + Math.cos(angle) * dist, y: y + Math.sin(angle) * dist, alpha: 0, rotation: shard.rotation + 0.25 }, 250, "power3.out"),
            gsapTo(shard.scale, { x: 0.85, y: 0.85 }, 250, "power3.out"),
          ]).then(() => shard.destroy());
        }

        Promise.all([
          gsapTo(core.scale, { x: 1.55 * power, y: 1.55 * power }, 180, "power4.out"),
          gsapTo(core, { alpha: 0 }, 180, "power4.out"),
        ]).then(() => core.destroy());
      };

      const lotusTargetBloom = (x: number, y: number, color = 0xffd7f4, power = 1) => {
        // Tiny target bloom only — no heavy full Lotus bloom per target.
        lotusPetalExplosion(x, y, color, power * 0.34, 0.32, false);

        const glimmer = new Graphics();
        glimmer.circle(x, y, tileSize * 0.048 * power);
        glimmer.fill({ color: 0xffffff, alpha: 0.22 });
        fxLayer.addChild(glimmer);
        Promise.all([
          gsapTo(glimmer.scale, { x: 1.9, y: 1.9 }, 135, "power3.out"),
          gsapTo(glimmer, { alpha: 0 }, 135, "power3.out"),
        ]).then(() => glimmer.destroy());
      };

      const pulseTileView = async (tile: Tile | undefined, up = 1.14, msUp = 85, msDown = 110) => {
        if (!tile) return;
        const tv = tileViews.get(tile.id);
        if (!tv) return;
        tv.busy = true;
        try {
          await gsapTo(tv.wrap.scale, { x: up, y: up }, msUp, "back.out(1.3)");
          await gsapTo(tv.wrap.scale, { x: 1, y: 1 }, msDown, "power3.out");
        } finally {
          if (tv.wrap && !tv.wrap.destroyed) tv.wrap.scale.set(1);
          tv.busy = false;
        }
      };

      const showBoardDimmer = async (alpha = 0.1, holdMs = 240) => {
        const dim = new Graphics();
        dim.roundRect(0, 0, boardSize, boardSize, Math.round(tileSize * 0.28));
        dim.fill({ color: 0x05060a, alpha: 0 });
        dim.x = pad;
        dim.y = pad;
        fxLayer.addChild(dim);
        await addTween(dim, { alpha }, 120, easeOutQuart);
        await wait(holdMs);
        await addTween(dim, { alpha: 0 }, 150, easeOutQuart);
        dim.destroy();
      };

      const staggeredTargetPopPreview = async (targets: Tile[], color: number) => {
        const ordered = targets
          .slice()
          .sort((a, b) => {
            const da = Math.abs(a.r - targets[0].r) + Math.abs(a.c - targets[0].c);
            const db = Math.abs(b.r - targets[0].r) + Math.abs(b.c - targets[0].c);
            return da - db;
          });

        ordered.forEach((t, i) => {
          const delay = Math.min(280, i * 14);
          queueTimer(() => {
            const p = xy(t.r, t.c);
            const cx = p.x + tileSize / 2;
            const cy = p.y + tileSize / 2;
            candyFlashPop(cx, cy, color, 0.72);
            const tv = tileViews.get(t.id);
            if (tv) {
              addTween(tv.wrap.scale, { x: 1.23, y: 1.23 }, 55, easeSoftBack)
                .then(() => addTween(tv.wrap.scale, { x: 0.92, y: 0.92 }, 78, easeOutQuart))
                .then(() => addTween(tv.wrap.scale, { x: 1, y: 1 }, 70, easeOutQuart));
            }
          }, delay);
        });

        await wait(Math.min(420, ordered.length * 14 + 130));
      };


      const spawnRunicClearFx = (cx: number, cy: number, color = 0xffefb0) => {
        const palette = [0xff5ac8, 0x7df9ff, 0xfff27a, 0x8cff7a, 0xa98cff, 0xff9b5c];

        const burst = new Graphics();
        burst.circle(cx, cy, tileSize * 0.14);
        burst.fill({ color: 0xffffff, alpha: 0.26 });
        fxLayer.addChild(burst);

        candyFlashPop(cx, cy, color, 0.82);

        const rayCount = fxCount(8);
        for (let i = 0; i < rayCount; i++) {
          const angle = (Math.PI * 2 * i) / rayCount;
          const ray = new Graphics();
          const rayColor = palette[i % palette.length];
          ray.roundRect(-tileSize * 0.012, -tileSize * 0.19, tileSize * 0.024, tileSize * 0.21, 999);
          ray.fill({ color: rayColor, alpha: 0.55 });
          ray.x = cx;
          ray.y = cy;
          ray.rotation = angle;
          ray.scale.set(0.25);
          fxLayer.addChild(ray);
          Promise.all([
            addTween(ray.scale, { x: 1.35, y: 1.35 }, 210, easeOutQuart),
            addTween(ray, { x: cx + Math.cos(angle) * tileSize * 0.23, y: cy + Math.sin(angle) * tileSize * 0.23, alpha: 0 }, 230, easeOutQuart),
          ]).then(() => ray.destroy());
        }

        luxuryParticleBurst(["sparkle", "star", "star", "spark"], cx, cy, 8, tileSize * 0.42, tileSize * 0.2, color, 280);

        Promise.all([
          addTween(burst.scale, { x: 1.75, y: 1.75 }, 190, easeOutQuart),
          addTween(burst, { alpha: 0 }, 190, easeOutQuart),
        ]).then(() => burst.destroy());
      };

      const addScorePopup = (x: number, y: number, txt: string, kind: "points" | "combo" | "special" = "points") => {
        const t = new Text({
          text: txt,
          style: {
            fontSize: kind === "combo" ? Math.round(tileSize * 0.34) : Math.round(tileSize * 0.27),
            fill: kind === "points" ? 0xfff2bc : kind === "combo" ? 0xffd36c : 0xb8ffb1,
            fontWeight: "900",
            stroke: { color: 0x130b03, width: 4 },
          } as any,
        });
        t.anchor.set(0.5);
        t.x = x;
        t.y = y;
        t.alpha = 0;
        textLayer.addChild(t);
        Promise.all([addTween(t, { y: y - tileSize * 0.62, alpha: 1 }, 160, easeBack)]).then(() =>
          Promise.all([addTween(t, { y: y - tileSize * 1.12, alpha: 0 }, 420, easeOutCubic)]).then(() => t.destroy())
        );
      };

      const addBoardBannerText = (txt: string, mode: "clear" | "chain" = "clear") => {
        const isChain = mode === "chain" || txt.includes("CHAIN");
        const font = Math.round(tileSize * (isChain ? 0.48 : 0.62));
        const y = isChain ? boardSize * 0.34 : boardSize * 0.42;

        const glow = new Text({
          text: txt,
          style: {
            fontSize: font,
            fill: 0xffffff,
            fontWeight: "900",
            letterSpacing: isChain ? 1 : 2,
            stroke: { color: isChain ? 0x7b4cff : 0xff9d56, width: isChain ? 5 : 7 },
          } as any,
        });
        glow.anchor.set(0.5);
        glow.x = boardSize / 2;
        glow.y = y;
        glow.alpha = 0;
        glow.scale.set(0.72);
        textLayer.addChild(glow);

        const shadow = new Text({
          text: txt,
          style: {
            fontSize: font,
            fill: isChain ? 0xdffcff : 0xfff4bd,
            fontWeight: "900",
            letterSpacing: isChain ? 1 : 2,
            stroke: { color: 0x160801, width: isChain ? 3 : 4 },
          } as any,
        });
        shadow.anchor.set(0.5);
        shadow.x = glow.x;
        shadow.y = glow.y;
        shadow.alpha = 0;
        shadow.scale.set(0.72);
        textLayer.addChild(shadow);
        premiumGlow(shadow, isChain ? 0x8ff6ff : 0xfff0a8, isChain ? 430 : 700, isChain ? 1.2 : 1.8);
        premiumBloom(glow, isChain ? 390 : 650, isChain ? 0.55 : 0.9);

        luxuryParticleBurst(
          isChain ? ["sparkle", "star", "spark"] : ["sparkle", "star", "spark", "spark"],
          boardSize / 2,
          y,
          isChain ? 10 : 18,
          tileSize * (isChain ? 1.05 : 1.6),
          tileSize * (isChain ? 0.26 : 0.38),
          isChain ? 0x8ff6ff : 0xfff0a8,
          isChain ? 360 : 520
        );

        Promise.all([
          addTween(glow, { alpha: isChain ? 0.36 : 0.45 }, 110, easeBack),
          addTween(glow.scale, { x: isChain ? 1.05 : 1.15, y: isChain ? 1.05 : 1.15 }, 180, easeBack),
          addTween(shadow, { alpha: 1 }, 120, easeBack),
          addTween(shadow.scale, { x: isChain ? 0.98 : 1.02, y: isChain ? 0.98 : 1.02 }, 180, easeBack),
        ]).then(() => wait(isChain ? 230 : 430).then(() =>
          Promise.all([
            addTween(glow, { alpha: 0, y: glow.y - tileSize * (isChain ? 0.25 : 0.45) }, isChain ? 250 : 360, easeOutCubic),
            addTween(shadow, { alpha: 0, y: shadow.y - tileSize * (isChain ? 0.25 : 0.45) }, isChain ? 250 : 360, easeOutCubic),
          ]).then(() => { glow.destroy(); shadow.destroy(); })
        ));
      };

      const drawBoardBack = () => {
        board.removeChildren();

        const corner = Math.round(tileSize * 0.38);
        const inset = Math.max(5, Math.round(tileSize * 0.09));
        const innerCorner = Math.round(tileSize * 0.31);

        const slabShadow = new Graphics();
        slabShadow.roundRect(3, 9, boardSize, boardSize, corner);
        slabShadow.fill({ color: 0x000000, alpha: 0.28 });
        board.addChild(slabShadow);

        const slab = new Graphics();
        slab.roundRect(0, 0, boardSize, boardSize, corner);
        slab.fill({ color: 0x1b2021, alpha: 1 });
        board.addChild(slab);

        const obsidianMask = new Graphics();
        obsidianMask.roundRect(inset, inset, boardSize - inset * 2, boardSize - inset * 2, innerCorner);
        obsidianMask.fill({ color: 0xffffff, alpha: 1 });
        board.addChild(obsidianMask);

        if (stoneTex) {
          const boardStone = new Sprite(stoneTex);
          boardStone.x = inset;
          boardStone.y = inset;
          boardStone.width = boardSize - inset * 2;
          boardStone.height = boardSize - inset * 2;
          boardStone.alpha = 0.90;
          boardStone.tint = 0xc3c8c4;
          boardStone.mask = obsidianMask;
          board.addChild(boardStone);
        }

        const obsidianDepth = new Graphics();
        obsidianDepth.roundRect(inset, inset, boardSize - inset * 2, boardSize - inset * 2, innerCorner);
        obsidianDepth.fill({ color: 0x1b2021, alpha: 0.12 });
        board.addChild(obsidianDepth);

        const bevelTop = new Graphics();
        bevelTop.roundRect(2, 2, boardSize - 4, boardSize - 4, Math.max(16, corner - 2));
        bevelTop.stroke({ color: 0x000000, alpha: 0.00, width: 0 });
        board.addChild(bevelTop);

        const bevelDark = new Graphics();
        bevelDark.roundRect(inset, inset, boardSize - inset * 2, boardSize - inset * 2, innerCorner);
        bevelDark.stroke({ color: 0x000000, alpha: 0.08, width: Math.max(1, Math.round(tileSize * 0.014)) });
        board.addChild(bevelDark);

        const ruinSheen = new Graphics();
        ruinSheen.roundRect(inset + 4, inset + 4, boardSize - (inset + 4) * 2, boardSize * 0.12, Math.round(tileSize * 0.20));
        ruinSheen.fill({ color: 0xffffff, alpha: 0.010 });
        board.addChild(ruinSheen);
      };

      let dragState: { x: number; y: number; id: number; fired: boolean } | null = null;

      const resetDragPreview = () => {
        if (!dragState) return;
        const tv = tileViews.get(dragState.id);
        if (tv?.wrap && !tv.wrap.destroyed) {
          tv.wrap.x = Math.round(tv.baseX);
          tv.wrap.y = Math.round(tv.baseY);
          tv.busy = false;
        }
        dragState = null;
      };

      const targetFromDelta = (tileId: number, dx: number, dy: number) => {
        const curTile = tiles.find((z) => z.id === tileId);
        if (!curTile) return null;
        let tr = curTile.r;
        let tc = curTile.c;
        if (Math.abs(dx) > Math.abs(dy)) tc += dx > 0 ? 1 : -1;
        else tr += dy > 0 ? 1 : -1;
        tr = clamp(tr, 0, N - 1);
        tc = clamp(tc, 0, N - 1);
        if (fog[idx(tr, tc)]) return null;
        return tiles.find((z) => z.r === tr && z.c === tc) ?? null;
      };

      const handleDragMove = (e: any) => {
        if (phase !== "idle" || !dragState || dragState.fired) return;
        const tv = tileViews.get(dragState.id);
        if (!tv) return;
        const dx = e.global.x - dragState.x;
        const dy = e.global.y - dragState.y;
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);
        const main = Math.max(adx, ady);
        if (main < 3) return;
        const maxPull = tileSize * 0.32;
        if (!tv.wrap || tv.wrap.destroyed) {
          dragState = null;
          return;
        }
        if (adx > ady) {
          tv.wrap.x = tv.baseX + clamp(dx, -maxPull, maxPull);
          tv.wrap.y = tv.baseY;
        } else {
          tv.wrap.x = tv.baseX;
          tv.wrap.y = tv.baseY + clamp(dy, -maxPull, maxPull);
        }
        if (main >= tileSize * 0.34) {
          const tileId = dragState.id;
          const target = targetFromDelta(tileId, dx, dy);
          const self = tiles.find((z) => z.id === tileId);
          dragState.fired = true;
          tv.wrap.x = Math.round(tv.baseX);
          tv.wrap.y = Math.round(tv.baseY);
          tv.busy = false;
          dragState = null;
          if (self && target) attemptSwap(self, target);
        }
      };

      const handleDragEnd = (e: any) => {
        if (!dragState) return;
        const tileId = dragState.id;
        const dx = e.global.x - dragState.x;
        const dy = e.global.y - dragState.y;
        const main = Math.max(Math.abs(dx), Math.abs(dy));
        const target = targetFromDelta(tileId, dx, dy);
        const self = tiles.find((z) => z.id === tileId);
        resetDragPreview();
        if (phase !== "idle" || !self) return;
        if (main < 9) {
          handleTap(self);
          return;
        }
        if (target) attemptSwap(self, target);
      };

      stage.eventMode = "static";
      stage.hitArea = app.screen;
      stage.on("pointermove", handleDragMove);
      stage.on("pointerup", handleDragEnd);
      stage.on("pointerupoutside", handleDragEnd);
      stage.on("pointercancel", resetDragPreview as any);

      const createTileView = (t: Tile, start?: { r: number; c: number }, spawned = false) => {
        const { x, y } = xy(t.r, t.c);
        const startXY = start ? xy(start.r, start.c) : { x, y: spawned ? -tileSize * (1.25 + Math.random() * 0.55) : y };
        const wrap = new Container();
        wrap.x = Math.round(startXY.x);
        wrap.y = Math.round(startXY.y);
        wrap.eventMode = fog[idx(t.r, t.c)] ? "none" : "static";
        wrap.cursor = "pointer";
        // Children are drawn around 0,0, so the container position is already the tile center.
        // Do not set pivot here; it shifts the visual tile half a tile left/up and creates empty board space.
        wrap.x = Math.round(wrap.x + tileSize / 2);
        wrap.y = Math.round(wrap.y + tileSize / 2);
        tileLayer.addChild(wrap);

        const radius = Math.max(12, Math.round(tileSize * 0.25));
        const socketSize = Math.round(tileSize * 0.88);
        const tileHalf = socketSize / 2;

        // v73 matte carved floating stone:
        // light obsidian center, darker carved edges, no glossy/glowy tile sheen.
        const floorShadow = new Graphics();
        floorShadow.roundRect(-tileHalf + tileSize * 0.035, -tileHalf + tileSize * 0.095, socketSize - tileSize * 0.07, socketSize - tileSize * 0.02, radius);
        floorShadow.fill({ color: 0x000000, alpha: 0.30 });
        wrap.addChild(floorShadow);

        const socket = new Graphics();
        socket.roundRect(-tileHalf, -tileHalf, socketSize, socketSize, radius);
        socket.fill({ color: 0x121617, alpha: 0.98 });
        wrap.addChild(socket);

        const stoneMask = new Graphics();
        stoneMask.roundRect(-tileHalf, -tileHalf, socketSize, socketSize, radius);
        stoneMask.fill({ color: 0xffffff, alpha: 1 });
        wrap.addChild(stoneMask);

        let stone: Sprite | undefined;
        if (stoneTex) {
          stone = new Sprite(stoneTex);
          stone.anchor.set(0.5);
          stone.x = 0;
          stone.y = 0;
          stone.width = socketSize;
          stone.height = socketSize;
          stone.alpha = 0.54;
          stone.tint = 0xb7c0ba;
          stone.mask = stoneMask;
          wrap.addChild(stone);
        }

        const centerStone = new Graphics();
        centerStone.roundRect(-socketSize * 0.36, -socketSize * 0.36, socketSize * 0.72, socketSize * 0.72, Math.max(9, radius - 7));
        centerStone.fill({ color: 0xdce3de, alpha: 0.052 });
        centerStone.mask = stoneMask;
        wrap.addChild(centerStone);

        const innerMatte = new Graphics();
        innerMatte.roundRect(-socketSize * 0.42, -socketSize * 0.42, socketSize * 0.84, socketSize * 0.84, Math.max(10, radius - 5));
        innerMatte.stroke({ color: 0xffffff, alpha: 0.035, width: Math.max(1, Math.round(tileSize * 0.012)) });
        innerMatte.mask = stoneMask;
        wrap.addChild(innerMatte);

        const carvedEdge = new Graphics();
        carvedEdge.roundRect(-tileHalf + 1, -tileHalf + 1, socketSize - 2, socketSize - 2, Math.max(10, radius - 1));
        carvedEdge.stroke({ color: 0x020303, alpha: 0.36, width: Math.max(2, Math.round(tileSize * 0.038)) });
        wrap.addChild(carvedEdge);

        const bottomDepth = new Graphics();
        bottomDepth.roundRect(-tileHalf + 4, socketSize * 0.08, socketSize - 8, socketSize * 0.27, Math.max(8, radius - 5));
        bottomDepth.fill({ color: 0x000000, alpha: 0.085 });
        bottomDepth.mask = stoneMask;
        wrap.addChild(bottomDepth);

        const topCarve = new Graphics();
        topCarve.roundRect(-tileHalf + 5, -tileHalf + 5, socketSize - 10, socketSize * 0.23, Math.max(8, radius - 5));
        topCarve.fill({ color: 0xffffff, alpha: 0.013 });
        topCarve.mask = stoneMask;
        wrap.addChild(topCarve);

        const tex = runeTextures[t.rune];

        let runeSprite: Sprite | undefined;
        let fallback: Text | undefined;
        if (tex) {
          runeSprite = new Sprite(tex);
          runeSprite.anchor.set(0.5);
          const runeScale = t.special === "none" ? 0.62 : 0.72;
          const crispRuneSize = Math.round(tileSize * runeScale);
          runeSprite.width = crispRuneSize;
          runeSprite.height = crispRuneSize;
          runeSprite.alpha = 1;
          runeSprite.tint = 0xffffff;
          runeSprite.blendMode = "normal" as any;
          runeSprite.filters = [];
          runeSprite.x = Math.round(runeSprite.x);
          runeSprite.y = Math.round(runeSprite.y);
          (runeSprite as any).roundPixels = true;

          wrap.addChild(runeSprite);
        } else {
          fallback = new Text({
            text: FALLBACK[t.rune],
            style: { fontSize: Math.round(tileSize * 0.48), fill: 0xffffff, fontWeight: "900" },
          });
          fallback.anchor.set(0.5);
          wrap.addChild(fallback);
        }

        // No visible per-tile line/trim. Separation comes from the tiny gap and glass surface only.
        const rim = new Graphics();
        rim.alpha = 0;

        const specialRing: Graphics | undefined = undefined;

        const tv: TileView = {
          tile: t,
          wrap,
          stone,
          rune: runeSprite,
          fallback,
          rim,
          specialRing,
          baseX: Math.round(x + tileSize / 2),
          baseY: Math.round(y + tileSize / 2),
          busy: false,
          hintPhase: t.id * 0.17,
        };

        tileViews.set(t.id, tv);

        wrap.on("pointerdown", (e: any) => {
          unlockAudio();
          if (phase !== "idle") return;
          const curTile = tiles.find((z) => z.id === t.id);
          if (!curTile || fog[idx(curTile.r, curTile.c)]) return;
          dragState = { x: e.global.x, y: e.global.y, id: t.id, fired: false };
          lastAction = Date.now();
          const tv = tileViews.get(t.id);
          if (tv) tv.busy = true;
        });
      };

      const renderTiles = (startPositions?: Map<number, { r: number; c: number }>) => {
        const old = tileLayer.removeChildren();
        for (const child of old) child.destroy({ children: true });
        tileViews.clear();
        for (const t of tiles) {
          const start = startPositions?.get(t.id);
          const spawned = !!startPositions && !start;
          createTileView(t, start, spawned);
        }
      };

      const renderFog = () => {
        const oldFog = fogLayer.removeChildren();
        for (const child of oldFog) child.destroy({ children: true });
        for (let i = 0; i < fog.length; i++) {
          if (!fog[i]) continue;
          const { r, c } = rc(i);
          const { x, y } = xy(r, c);
          const wrap = new Container();
          wrap.x = x + tileSize / 2;
          wrap.y = y + tileSize / 2;
          wrap.eventMode = "none";
          fogLayer.addChild(wrap);

          const fogRadius = Math.max(10, Math.round(tileSize * 0.22));
          const shell = new Graphics();
          shell.roundRect(-tileSize / 2 + 3, -tileSize / 2 + 3, tileSize - 6, tileSize - 6, fogRadius);
          shell.fill({ color: 0xf2f8ff, alpha: 0.2 });
          shell.stroke({ color: 0xffffff, alpha: 0.55, width: 1 });
          wrap.addChild(shell);

          const fogMask = new Graphics();
          fogMask.roundRect(-tileSize / 2 + 3, -tileSize / 2 + 3, tileSize - 6, tileSize - 6, fogRadius);
          fogMask.fill({ color: 0xffffff, alpha: 1 });
          wrap.addChild(fogMask);

          for (let k = 0; k < 4; k++) {
            const puff = new Graphics();
            puff.circle(0, 0, tileSize * (0.24 + k * 0.075));
            puff.fill({ color: 0xffffff, alpha: 0.3 - k * 0.04 });
            puff.x = (k - 1.5) * tileSize * 0.11;
            puff.y = (k % 2 === 0 ? -1 : 1) * tileSize * 0.075;
            puff.mask = fogMask;
            (puff as any).__fogPhase = i * 0.33 + k * 0.7;
            wrap.addChild(puff);
          }
        }
      };


      const repairGrid = () => {
        const seen = new Set<string>();
        tiles = tiles.filter((t) => {
          const key = `${t.r},${t.c}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return t.r >= 0 && t.r < N && t.c >= 0 && t.c < N;
        });
        for (let r = 0; r < N; r++) {
          for (let c = 0; c < N; c++) {
            if (!tiles.some((t) => t.r === r && t.c === c)) tiles.push(newTile(r, c, randRune()));
          }
        }
      };

      const refresh = () => {
        repairGrid();
        drawBoardBack();
        renderTiles();
        renderFog();
        hud();
      };

      const updateTilePositions = async (movedOnly = true, ms = DROP_MS, ease = easeSoftBack) => {
        const jobs: Promise<void>[] = [];
        for (const t of tiles) {
          const tv = tileViews.get(t.id);
          if (!tv) continue;
          const { x, y } = xy(t.r, t.c);
          tv.baseX = x + tileSize / 2;
          tv.baseY = y + tileSize / 2;
          if (movedOnly) {
            const dist = Math.abs(tv.wrap.x - tv.baseX) + Math.abs(tv.wrap.y - tv.baseY);
            const dur = Math.max(70, Math.min(ms + dist * 0.11, ms + 95));
            jobs.push(gsapTo(tv.wrap, { x: tv.baseX, y: tv.baseY }, dur, ease === easeInOut ? "power2.inOut" : "back.out(1.04)"));
          } else {
            tv.wrap.x = tv.baseX;
            tv.wrap.y = tv.baseY;
          }
        }
        await Promise.all(jobs);
      };

      const playSmallPop = async (cellIds: number[]) => {
        if (cellIds.length >= 7) {
          // handled earlier so the banner and sound happen before the clear begins
        } else if (cellIds.length >= 3) playSfx("clear");
        const jobs: Promise<void>[] = [];
        for (const id of cellIds) {
          const tv = tileViews.get(id);
          if (!tv) continue;
          if (instantHiddenSpecialIds.has(id)) {
            tv.busy = false;
            tv.wrap.alpha = 0;
            continue;
          }

          tv.busy = true;
          tv.wrap.alpha = 1;
          const cx = tv.baseX;
          const cy = tv.baseY;
          spawnRunicClearFx(cx, cy, 0xfff0b8);

          // Premium match clear: quick candy pop, then vanish before gravity/refill.
          jobs.push(
            Promise.all([
              addTween(tv.wrap.scale, { x: 1.22, y: 1.22 }, 42, easeSoftBack),
              addTween(tv.wrap, { alpha: 1 }, 42, easeOutQuart),
            ]).then(() =>
              Promise.all([
                addTween(tv.wrap.scale, { x: 0.54, y: 0.54 }, 86, easeOutQuart),
                addTween(tv.wrap, { alpha: 0 }, 86, easeOutQuart),
              ]).then(() => {
                tv.wrap.alpha = 0;
                tv.busy = false;
              })
            )
          );
        }
        await Promise.all(jobs);
      };

      const damageFogAdjacent = (clearSet: Set<number>) => {
        const before = fog.filter(Boolean).length;
        const add = new Set<number>();
        for (const k of Array.from(clearSet)) {
          const { r, c } = rc(k);
          const adj = [
            r > 0 ? idx(r - 1, c) : -1,
            r < N - 1 ? idx(r + 1, c) : -1,
            c > 0 ? idx(r, c - 1) : -1,
            c < N - 1 ? idx(r, c + 1) : -1,
          ].filter((x) => x >= 0);
          for (const a of adj) {
            if (fog[a]) {
              fog[a] = null;
              add.add(a);
            }
          }
        }
        for (const k of Array.from(clearSet)) {
          if (fog[k]) {
            fog[k] = null;
            add.add(k);
          }
        }
        const after = fog.filter(Boolean).length;
        if (after < before) fogClearedThisMove = true;
        for (const a of add) clearSet.add(a);
      };

      const collectCleared = (clearSet: Set<number>) => {
        if (level.objectiveKind !== "collect") return;
        for (const t of tiles) {
          if (!clearSet.has(idx(t.r, t.c))) continue;
          if (collectRemaining[t.color] != null && (collectRemaining[t.color] ?? 0) > 0) {
            collectRemaining[t.color] = Math.max(0, (collectRemaining[t.color] ?? 0) - 1);
          }
        }
      };

      const wouldMakeInstantMatch = (grid: (Tile | null)[], r: number, c: number, color: Rune) => {
        const same = (rr: number, cc: number) => rr >= 0 && rr < N && cc >= 0 && cc < N && grid[idx(rr, cc)]?.color === color;
        if (same(r, c - 1) && same(r, c - 2)) return true;
        if (same(r, c + 1) && same(r, c + 2)) return true;
        if (same(r, c - 1) && same(r, c + 1)) return true;
        if (same(r - 1, c) && same(r - 2, c)) return true;
        if (same(r + 1, c) && same(r + 2, c)) return true;
        if (same(r - 1, c) && same(r + 1, c)) return true;
        return false;
      };

      const safeRuneFor = (grid: (Tile | null)[], r: number, c: number) => {
        let color = randRune();
        let tries = 0;
        while (wouldMakeInstantMatch(grid, r, c, color) && tries++ < 30) color = randRune();
        return color;
      };

      const dropAndFill = () => {
        // Stable Candy-Crush-style gravity: build a fresh grid column by column.
        // This avoids duplicate/empty cells and avoids refill tiles instantly creating huge cascades.
        const oldGrid = toGrid(tiles);
        const nextGrid: (Tile | null)[] = new Array(N * N).fill(null);

        for (let c = 0; c < N; c++) {
          const survivors: Tile[] = [];
          for (let r = N - 1; r >= 0; r--) {
            const t = oldGrid[idx(r, c)];
            if (t) survivors.push(t);
          }

          for (let r = N - 1; r >= 0; r--) {
            const existing = survivors.shift();
            if (existing) {
              existing.r = r;
              existing.c = c;
              nextGrid[idx(r, c)] = existing;
            } else {
              const color = safeRuneFor(nextGrid, r, c);
              nextGrid[idx(r, c)] = newTile(r, c, color);
            }
          }
        }

        tiles = nextGrid.filter(Boolean) as Tile[];
      };

      const mostCommonColor = (ignore = new Set<number>()) => {
        const counts = new Map<Rune, number>();
        for (const t of tiles) {
          if (t.special !== "none") continue;
          if (ignore.has(idx(t.r, t.c))) continue;
          counts.set(t.color, (counts.get(t.color) ?? 0) + 1);
        }
        let best: Rune = "blue";
        let bestCount = -1;
        for (const r of PALETTE) {
          const v = counts.get(r) ?? 0;
          if (v > bestCount) {
            best = r;
            bestCount = v;
          }
        }
        return best;
      };

      const addGoldenCells = (clearSet: Set<number>, origin: Tile, dir?: "h" | "v") => {
        const chosen = dir ?? (origin.id % 2 === 0 ? "h" : "v");
        if (chosen === "h") for (let c = 0; c < N; c++) clearSet.add(idx(origin.r, c));
        else for (let r = 0; r < N; r++) clearSet.add(idx(r, origin.c));
        return chosen;
      };

      const addLotusCells = (clearSet: Set<number>, origin: Tile, color?: Rune) => {
        const chosen = color ?? mostCommonColor(clearSet);
        for (const t of tiles) {
          // Lotus clears the whole board of the color/rune it was swapped with.
          // Same-color specials are included so they activate in the chain queue.
          if (t.color === chosen) clearSet.add(idx(t.r, t.c));
        }
        clearSet.add(idx(origin.r, origin.c));
        return chosen;
      };

      const addBombCells = (clearSet: Set<number>, origin: Tile, radius = 1) => {
        for (let rr = Math.max(0, origin.r - radius); rr <= Math.min(N - 1, origin.r + radius); rr++) {
          for (let cc = Math.max(0, origin.c - radius); cc <= Math.min(N - 1, origin.c + radius); cc++) {
            clearSet.add(idx(rr, cc));
          }
        }
      };

      const playBombBurst = async (origin: Tile) => {
        microShake(1.25, 92);
        const p = xy(origin.r, origin.c);
        const cx = p.x + tileSize / 2;
        const cy = p.y + tileSize / 2;

        const glow = new Graphics();
        glow.circle(cx, cy, tileSize * 0.34);
        glow.fill({ color: 0xffc872, alpha: 0.2 });
        fxLayer.addChild(glow);

        candyFlashPop(cx, cy, 0xffc06a, 1.25);
        const blast = new Graphics();
        blast.circle(cx, cy, tileSize * 0.24);
        blast.fill({ color: 0xffd08a, alpha: 0.18 });
        fxLayer.addChild(blast);

        luxuryParticleBurst(["smoke", "smoke", "spark", "smoke"], cx, cy, 12, tileSize * 1.02, tileSize * 0.34, 0xffc06a, 340);

        for (let i = 0; i < 8; i++) {
          const chip = new Graphics();
          chip.circle(0, 0, Math.max(1.5, tileSize * 0.025));
          chip.fill({ color: i % 2 ? 0xffffff : 0xffbc62, alpha: 0.72 });
          chip.x = cx;
          chip.y = cy;
          chip.rotation = (Math.PI * 2 * i) / 8;
          fxLayer.addChild(chip);
          const dist = tileSize * 0.82;
          Promise.all([
            addTween(chip, { x: cx + Math.cos(chip.rotation) * dist, y: cy + Math.sin(chip.rotation) * dist, alpha: 0 }, 230, easeOutCubic),
            addTween(chip.scale, { x: 1.8, y: 1.8 }, 230, easeOutCubic),
          ]).then(() => chip.destroy());
        }

        await Promise.all([
          addTween(glow.scale, { x: 2.15, y: 2.15 }, 260, easeOutCubic),
          addTween(glow, { alpha: 0 }, 260, easeOutCubic),
          addTween(blast.scale, { x: 2.35, y: 2.35 }, 300, easeOutQuart),
          addTween(blast, { alpha: 0 }, 300, easeOutQuart),
        ]);
        glow.destroy();
        blast.destroy();
      };

      const hideActivatedSpecialImmediately = (sp: Tile) => {
        // Once a special is hit/cleared by Runic Clear or another special,
        // it activates right away and visually disappears so it cannot look like it survived.
        instantHiddenSpecialIds.add(sp.id);
        const p = xy(sp.r, sp.c);
        spawnRunicClearFx(p.x + tileSize / 2, p.y + tileSize / 2, RUNE_GLOW[sp.rune] ?? 0xffffff);
        const tv = tileViews.get(sp.id);
        if (tv) {
          tv.busy = true;
          try {
            gsap.killTweensOf(tv.wrap);
            gsap.killTweensOf(tv.wrap.scale);
          } catch {}
          tv.wrap.alpha = 0.9;
          void Promise.all([
            gsapTo(tv.wrap.scale, { x: 0.66, y: 0.66 }, 70, "power2.out"),
            gsapTo(tv.wrap, { alpha: 0 }, 85, "power2.out"),
          ]).then(() => {
            tv.wrap.alpha = 0;
            tv.busy = false;
          });
        }
      };

      const runRunicClearChain = async (clearSet: Set<number>, activatedIds = new Set<number>()) => {
        // Runic Clear chain reaction queue:
        // Specials hit by any clear activate immediately, get hidden immediately,
        // then remain in clearSet so the later tile-removal pass deletes them.
        let guard = 0;
        let didChain = false;

        while (guard++ < 20) {
          const specials = tiles.filter((t) => clearSet.has(idx(t.r, t.c)) && t.special !== "none" && !activatedIds.has(t.id));
          if (!specials.length) break;

          if (!didChain) {
            didChain = true;
            playSfx("chain");
            addBoardBannerText(CHAIN_PHRASES[Math.floor(Math.random() * CHAIN_PHRASES.length)], "chain");
          }

          const fxJobs: Promise<void>[] = [];

          for (const sp of specials) {
            if (activatedIds.has(sp.id)) continue;
            activatedIds.add(sp.id);
            clearSet.add(idx(sp.r, sp.c));

            const specialType = sp.special;
            const specialColor = sp.color;
            const specialRune = sp.rune;

            hideActivatedSpecialImmediately(sp);

            // Remove the special state immediately so it cannot remain visually/logic-wise
            // after being hit. We still use specialType above to run its power.
            sp.special = "none";
            sp.rune = sp.color;

            // Do not play generic special sound here.
            // Each activated special plays its own sound so Golden always uses zap.
            if (specialType === "bomb") {
              playSfx("bomb");
              addBombCells(clearSet, sp, 1);
              fxJobs.push(playBombBurst(sp));
            } else if (specialType === "golden") {
              playSfx("golden");
              const dir = addGoldenCells(clearSet, sp);
              fxJobs.push(playGoldenFlash(sp, dir));
            } else if (specialType === "lotus") {
              playSfx("lotus");
              const color = addLotusCells(clearSet, { ...sp, rune: specialRune, color: specialColor, special: "lotus" }, specialColor);
              fxJobs.push(showLotusRings(sp, color));
            }
          }

          // Let all special powers from this wave start together.
          await Promise.all(fxJobs);
          await wait(8);
        }
      };

      const pickRunicClearGoldenSpawn = (clearSet: Set<number>, focus: number): { k: number; special: Special; rune: Rune } | null => {
        const focusCell = clearSet.has(focus) ? focus : null;
        const candidates = [
          ...(focusCell != null ? [focusCell] : []),
          ...Array.from(clearSet),
        ];
        for (const k of candidates) {
          const { r, c } = rc(k);
          if (fog[k]) continue;
          const t = tiles.find((z) => z.r === r && z.c === c);
          if (!t) continue;
          return { k, special: "golden", rune: "golden" };
        }
        return null;
      };

      const clearCells = async (
        clearSet: Set<number>,
        focus: number,
        bonus = 0,
        spawn?: { k: number; special: Special; rune: Rune },
        sfxKey: SfxKey | "none" = "match",
        activatedIds = new Set<number>()
      ) => {
        if (!clearSet.size) return;
        const naturalRunicClear = sfxKey !== "none" && clearSet.size >= 7;
        const spawnsToCreate: { k: number; special: Special; rune: Rune }[] = [];
        if (spawn) spawnsToCreate.push(spawn);
        if (naturalRunicClear && !spawnsToCreate.some((s) => s.special === "golden")) {
          const availableForGolden = new Set(clearSet);
          for (const s of spawnsToCreate) availableForGolden.delete(s.k);
          const goldenSpawn = pickRunicClearGoldenSpawn(availableForGolden, focus);
          if (goldenSpawn) spawnsToCreate.push(goldenSpawn);
        }
        // Keep v70 timing: no pre-clear RUNIC CLEAR text on regular large clears.
        // The natural large clear still gets the Runic Clear sound and guaranteed Golden Toby spawn.
        if (sfxKey !== "none") playSfx(naturalRunicClear ? "runicClear" : sfxKey);
        await runRunicClearChain(clearSet, activatedIds);
        combo += 1;
        const comboBonus = combo > 1 ? combo * BONUS_COMBO : 0;
        const fogWasClearedBefore = fogClearedThisMove;
        damageFogAdjacent(clearSet);
        if (!fogWasClearedBefore && fogClearedThisMove) playSfx("fog");
        collectCleared(clearSet);
        for (const protectedSpawn of spawnsToCreate) {
          clearSet.delete(protectedSpawn.k);
        }
        const idsToPop = tiles.filter((t) => clearSet.has(idx(t.r, t.c))).map((t) => t.id);
        const f = rc(focus);
        const p = xy(f.r, f.c);
        score += clearSet.size * PTS_PER_TILE + bonus + comboBonus;
        addScorePopup(p.x + tileSize / 2, p.y + tileSize / 2, `+${clearSet.size * PTS_PER_TILE + bonus + comboBonus}`, "points");
        if (combo > 1) addScorePopup(boardSize / 2, tileSize * 1.1, `Combo x${combo}`, "combo");
        hud();
        await playSmallPop(idsToPop);

        const beforeFall = new Map<number, { r: number; c: number }>();
        for (const t of tiles) beforeFall.set(t.id, { r: t.r, c: t.c });

        tiles = tiles.filter((t) => !clearSet.has(idx(t.r, t.c)));
        for (const id of idsToPop) instantHiddenSpecialIds.delete(id);
        dropAndFill();
        repairGrid();

        for (const nextSpawn of spawnsToCreate) {
          const loc = rc(nextSpawn.k);
          const t = tiles.find((z) => z.r === loc.r && z.c === loc.c);
          if (t) {
            t.rune = nextSpawn.rune;
            t.special = nextSpawn.special;
            if (nextSpawn.special !== "none") playSfx("spawn");
            playSpawnRing(loc.r, loc.c, nextSpawn.special);
          }
        }

        repairGrid();
        drawBoardBack();
        renderTiles(beforeFall);
        renderFog();
        hud();
        await updateTilePositions(true);
        await wait(14);
      };

      const playSpawnRing = (r: number, c: number, special: Special) => {
        if (special === "none") return;

        const { x, y } = xy(r, c);
        const cx = x + tileSize / 2;
        const cy = y + tileSize / 2;
        const color = special === "lotus" ? 0xffd7f4 : special === "golden" ? 0xffdc78 : 0xffb76d;
        const isPremium = special === "golden" || special === "lotus";

        const flash = new Graphics();
        flash.circle(cx, cy, tileSize * (isPremium ? 0.13 : 0.1));
        flash.fill({ color: 0xffffff, alpha: isPremium ? 0.28 : 0.18 });
        flash.blendMode = "add" as any;
        fxLayer.addChild(flash);

        const ringCount = isPremium ? 2 : 1;
        for (let i = 0; i < ringCount; i++) {
          queueTimer(() => {
            const ring = new Graphics();
            ring.circle(0, 0, tileSize * (isPremium ? 0.32 : 0.26));
            ring.stroke({
              color,
              alpha: i === 0 ? 0.84 : 0.48,
              width: Math.max(2, Math.round(tileSize * (isPremium ? 0.035 : 0.025))),
            });
            ring.x = cx;
            ring.y = cy;
            ring.scale.set(0.42);
            ring.blendMode = "add" as any;
            fxLayer.addChild(ring);

            Promise.all([
              gsapTo(ring.scale, { x: i === 0 ? 1.72 : 2.05, y: i === 0 ? 1.72 : 2.05 }, i === 0 ? 185 : 225, "power3.out"),
              gsapTo(ring, { alpha: 0 }, i === 0 ? 185 : 225, "power2.out"),
            ]).then(() => ring.destroy());
          }, i * 34);
        }

        Promise.all([
          gsapTo(flash.scale, { x: isPremium ? 2.15 : 1.55, y: isPremium ? 2.15 : 1.55 }, 130, "power3.out"),
          gsapTo(flash, { alpha: 0 }, 150, "power2.out"),
        ]).then(() => flash.destroy());

        if (isPremium) {
          luxuryParticleBurst(["sparkle", "star", "spark"], cx, cy, special === "lotus" ? 7 : 5, tileSize * 0.42, tileSize * 0.14, color, 190);
        }
      };

      const resolveCascades = async (firstSpawn: ReturnType<typeof chooseSpawn> | null) => {
        let spawn = firstSpawn;
        let cascadeCount = 0;

        while (cascadeCount++ < 6) {
          repairGrid();
          const m = computeMatches(tiles, fog);
          if (!m.clear.size) break;

          const clearSet = new Set(m.clear);
          const thisSpawn = spawn ?? chooseSpawn(m, []);
          const focus = thisSpawn?.k ?? Array.from(clearSet)[0];

          // If a cascade somehow detects a massive clear, process it, but stop after it.
          // This prevents visual runaway/glitch chains caused by unlucky refill patterns.
          await clearCells(clearSet, focus, 0, thisSpawn ?? undefined);
          spawn = null;
          await wait(CASCADE_WAIT_MS);

          if (clearSet.size > 26) break;
        }
      };

      const playGoldenFlash = async (origin: Tile, dir: "h" | "v") => {
        const p = xy(origin.r, origin.c);
        const cx = p.x + tileSize / 2;
        const cy = p.y + tileSize / 2;
        await pulseTileView(origin, 1.08, 42, 46);

        const len = boardSize - pad * 2;
        const beam = new Container();
        beam.alpha = 0;
        fxLayer.addChild(beam);

        const glow = new Graphics();
        const core = new Graphics();
        const whiteHot = new Graphics();

        const glowHalf = tileSize * 0.05;
        const coreHalf = Math.max(1.3, tileSize * 0.016);
        const whiteHalf = Math.max(0.85, tileSize * 0.007);

        if (dir === "h") {
          beam.x = pad;
          beam.y = cy;
          glow.roundRect(0, -glowHalf, len, glowHalf * 2, 999);
          core.roundRect(0, -coreHalf, len, coreHalf * 2, 999);
          whiteHot.roundRect(0, -whiteHalf, len, whiteHalf * 2, 999);
          beam.scale.x = 0.01;
        } else {
          beam.x = cx;
          beam.y = pad;
          glow.roundRect(-glowHalf, 0, glowHalf * 2, len, 999);
          core.roundRect(-coreHalf, 0, coreHalf * 2, len, 999);
          whiteHot.roundRect(-whiteHalf, 0, whiteHalf * 2, len, 999);
          beam.scale.y = 0.01;
        }

        glow.fill({ color: 0xffc85a, alpha: 0.2 });
        core.fill({ color: 0xffdc84, alpha: 0.96 });
        whiteHot.fill({ color: 0xffffff, alpha: 0.98 });
        beam.addChild(glow, core, whiteHot);

        premiumGlow(beam, 0xffd978, 260, 1.75);
        premiumBloom(beam, 240, 0.92);
        premiumMotionBlur(beam, dir, 170);

        // jagged lightning filaments
        for (let boltIndex = 0; boltIndex < 3; boltIndex++) {
          const bolt = new Graphics();
          const steps = 8;
          if (dir === "h") {
            bolt.moveTo(0, (Math.random() - 0.5) * tileSize * 0.08);
            for (let i = 1; i <= steps; i++) {
              bolt.lineTo((len / steps) * i, (Math.random() - 0.5) * tileSize * 0.18);
            }
          } else {
            bolt.moveTo((Math.random() - 0.5) * tileSize * 0.08, 0);
            for (let i = 1; i <= steps; i++) {
              bolt.lineTo((Math.random() - 0.5) * tileSize * 0.18, (len / steps) * i);
            }
          }
          bolt.stroke({ color: boltIndex === 0 ? 0xffffff : 0xffe19a, alpha: 0.58, width: boltIndex === 0 ? 2 : 1.2 });
          beam.addChild(bolt);
        }

        candySparkBurst(cx, cy, 0xffd978, 0.78);
        await gsapTo(beam, { alpha: 1 }, 22, "power2.out");
        if (dir === "h") await gsapTo(beam.scale, { x: 1, y: 1 }, 68, "power4.out");
        else await gsapTo(beam.scale, { x: 1, y: 1 }, 68, "power4.out");

        const touched = dir === "h"
          ? Array.from({ length: N }, (_, c) => ({ r: origin.r, c }))
          : Array.from({ length: N }, (_, r) => ({ r, c: origin.c }));

        touched.forEach((cell, i) => {
          queueTimer(() => {
            const q = xy(cell.r, cell.c);
            const tx = q.x + tileSize / 2;
            const ty = q.y + tileSize / 2;
            luxuryParticleBurst(["spark", "sparkle", "star"], tx, ty, 4, tileSize * 0.3, tileSize * 0.16, 0xffd978, 150);
            const tile = tiles.find((tt) => tt.r === cell.r && tt.c === cell.c);
            const tv = tile ? tileViews.get(tile.id) : null;
            if (tv) {
              gsapTo(tv.wrap.scale, { x: 1.12, y: 1.12 }, 38, "back.out(1.4)")
                .then(() => gsapTo(tv.wrap.scale, { x: 1, y: 1 }, 58, "power3.out"));
            }
          }, i * 11);
        });

        await wait(105);
        await Promise.all([
          gsapTo(beam, { alpha: 0 }, 62, "power3.out"),
          gsapTo(beam.scale, { x: dir === "h" ? 1.018 : 1, y: dir === "v" ? 1.018 : 1 }, 62, "power3.out"),
        ]);
        beam.destroy({ children: true });
      };

      const playGolden = async (origin: Tile, dir: "h" | "v") => {
        playSfx("golden");
        await playGoldenFlash(origin, dir);
        const clear = new Set<number>();
        if (dir === "h") for (let c = 0; c < N; c++) clear.add(idx(origin.r, c));
        else for (let r = 0; r < N; r++) clear.add(idx(r, origin.c));
        await clearCells(clear, idx(origin.r, origin.c), BONUS_GOLDEN, undefined, "none", new Set([origin.id]));
      };

      const playMassiveGoldenClear = async (a: Tile, b?: Tile) => {
        playSfx("golden");
        queueTimer(() => playSfx("runicClear"), 220);
        const rows = [a.r, b?.r ?? Math.floor(N / 2)];
        const cols = [a.c, b?.c ?? Math.floor(N / 2)];
        await Promise.all([
          playGoldenFlash(a, "h"),
          playGoldenFlash(a, "v"),
          b ? playGoldenFlash(b, "h") : Promise.resolve(),
          b ? playGoldenFlash(b, "v") : Promise.resolve(),
        ]);
        const clear = new Set<number>();
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) clear.add(idx(r, c));
        const activated = new Set<number>([a.id]);
        if (b) activated.add(b.id);
        await clearCells(clear, idx(a.r, a.c), BONUS_GOLDEN * 4, undefined, "none", activated);
      };

      const playGoldenCross = async (origin: Tile) => {
        await playMassiveGoldenClear(origin);
      };

      const playCellRingBurst = (r: number, c: number, color = 0xb7ffbd, delay = 0) => {
        const { x, y } = xy(r, c);
        const cx = x + tileSize / 2;
        const cy = y + tileSize / 2;
        queueTimer(() => {
          lotusTargetGlowPop(cx, cy, color, 0.72);
          candySparkBurst(cx, cy, color, 0.5);
        }, delay);
      };

      const getLuxuryParticleTexture = (i: number) => {
        return luxuryParticleTextures.length ? luxuryParticleTextures[i % luxuryParticleTextures.length] : null;
      };

      const luxuryGlowParticle = (x: number, y: number, color = 0xffd7f4, size = tileSize * 0.14, alpha = 0.72) => {
        const tex = getLuxuryParticleTexture(Math.floor(Math.random() * 999));
        const p: any = tex ? new Sprite(tex) : new Graphics();
        if (tex) {
          p.anchor.set(0.5);
          p.width = size;
          p.height = size;
          p.tint = color;
        } else {
          p.circle(0, 0, size * 0.33);
          p.fill({ color, alpha: 0.6 });
        }
        p.x = x;
        p.y = y;
        p.alpha = alpha;
        p.blendMode = "add" as any;
        fxLayer.addChild(p);
        return p;
      };

      const lotusLuxuryGlowBurst = (x: number, y: number, color = 0xffd7f4, power = 1, intensity = 1) => {
        // Premium glow-burst replacement for the old Lotus special move.
        // Uses optional /public/fx particle pack textures when present, with procedural fallback.
        const core = new Graphics();
        core.roundRect(-tileSize * 0.18 * power, -tileSize * 0.18 * power, tileSize * 0.36 * power, tileSize * 0.36 * power, tileSize * 0.1 * power);
        core.fill({ color: 0xffffff, alpha: 0.22 });
        core.x = x;
        core.y = y;
        core.rotation = Math.PI / 4;
        core.blendMode = "add" as any;
        fxLayer.addChild(core);
        premiumGlow(core, color, 420, 1.25);

        const glow = new Graphics();
        glow.circle(x, y, tileSize * 0.18 * power);
        glow.fill({ color, alpha: 0.18 });
        glow.blendMode = "add" as any;
        fxLayer.addChild(glow);

        const count = Math.max(12, Math.min(24, fxCount(16 * intensity)));
        for (let i = 0; i < count; i++) {
          const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.42;
          const dist = tileSize * (0.34 + Math.random() * 0.56) * power;
          const size = tileSize * (0.08 + Math.random() * 0.1) * power;
          const p = luxuryGlowParticle(x, y, i % 4 === 0 ? 0xffffff : color, size, 0);

          const destX = x + Math.cos(angle) * dist;
          const destY = y + Math.sin(angle) * dist;
          p.scale.set(0.28 + Math.random() * 0.14);
          p.rotation = angle + Math.random() * 0.8;

          gsapTo(p, { alpha: 0.82 }, 45, "power2.out")
            .then(() => Promise.all([
              gsapTo(p, { x: destX, y: destY, rotation: p.rotation + 0.65, alpha: 0 }, 310 + Math.random() * 110, "power3.out"),
              gsapTo(p.scale, { x: 0.8 + Math.random() * 0.32, y: 0.8 + Math.random() * 0.32 }, 310, "power3.out"),
            ]))
            .then(() => p.destroy());
        }

        const streakCount = Math.max(5, Math.min(9, fxCount(7 * intensity)));
        for (let i = 0; i < streakCount; i++) {
          const angle = (Math.PI * 2 * i) / streakCount + Math.random() * 0.28;
          const streak = new Graphics();
          streak.roundRect(-tileSize * 0.011 * power, -tileSize * 0.48 * power, tileSize * 0.022 * power, tileSize * 0.52 * power, 999);
          streak.fill({ color: i % 2 ? 0xffffff : color, alpha: i % 2 ? 0.22 : 0.32 });
          streak.x = x;
          streak.y = y;
          streak.rotation = angle;
          streak.scale.set(0.1, 0.24);
          streak.blendMode = "add" as any;
          fxLayer.addChild(streak);
          Promise.all([
            gsapTo(streak.scale, { x: 1, y: 1.25 }, 240, "power4.out"),
            gsapTo(streak, { alpha: 0, rotation: angle + 0.18 }, 260, "power3.out"),
          ]).then(() => streak.destroy());
        }

        Promise.all([
          gsapTo(core.scale, { x: 1.65 * power, y: 1.65 * power }, 210, "power4.out"),
          gsapTo(core, { alpha: 0 }, 210, "power3.out"),
          gsapTo(glow.scale, { x: 4.2 * power, y: 4.2 * power }, 300, "power4.out"),
          gsapTo(glow, { alpha: 0 }, 300, "power3.out"),
        ]).then(() => {
          core.destroy();
          glow.destroy();
        });
      };

      const lotusTargetGlowPop = (x: number, y: number, color = 0xffd7f4, power = 1) => {
        const pop = luxuryGlowParticle(x, y, color, tileSize * 0.16 * power, 0);
        Promise.all([
          gsapTo(pop, { alpha: 0.75 }, 30, "power2.out").then(() => gsapTo(pop, { alpha: 0 }, 110, "power2.out")),
          gsapTo(pop.scale, { x: 1.45, y: 1.45 }, 145, "back.out(1.35)"),
        ]).then(() => pop.destroy());
      };

      const lotusSparkleTargetRing = (x: number, y: number, color = 0xffd7f4, delay = 0) => {
        queueTimer(() => {
          const ring = new Graphics();
          ring.circle(0, 0, tileSize * 0.34);
          ring.stroke({ color, alpha: 0.70, width: Math.max(1.5, tileSize * 0.026) });
          ring.x = x;
          ring.y = y;
          ring.scale.set(0.72);
          ring.blendMode = "add" as any;
          fxLayer.addChild(ring);

          for (let i = 0; i < 8; i++) {
            const angle = (Math.PI * 2 * i) / 8;
            const spark = new Graphics();
            spark.roundRect(-tileSize * 0.012, -tileSize * 0.075, tileSize * 0.024, tileSize * 0.15, 999);
            spark.fill({ color: i % 2 ? 0xffffff : color, alpha: i % 2 ? 0.70 : 0.58 });
            spark.x = x + Math.cos(angle) * tileSize * 0.34;
            spark.y = y + Math.sin(angle) * tileSize * 0.34;
            spark.rotation = angle;
            spark.scale.set(0.55);
            spark.blendMode = "add" as any;
            fxLayer.addChild(spark);
            Promise.all([
              gsapTo(spark.scale, { x: 1.08, y: 1.08 }, 115, "power3.out"),
              gsapTo(spark, { alpha: 0, x: x + Math.cos(angle) * tileSize * 0.43, y: y + Math.sin(angle) * tileSize * 0.43 }, 165, "power2.out"),
            ]).then(() => spark.destroy());
          }

          Promise.all([
            gsapTo(ring.scale, { x: 1.16, y: 1.16 }, 165, "power3.out"),
            gsapTo(ring, { alpha: 0 }, 175, "power2.out"),
          ]).then(() => ring.destroy());
        }, delay);
      };

      const lotusCandyZap = (fromX: number, fromY: number, toX: number, toY: number, color = 0xffd7f4, delay = 0) => {
        queueTimer(() => {
          const line = new Graphics();
          line.moveTo(fromX, fromY);
          line.lineTo(toX, toY);
          line.stroke({ color: 0xffffff, alpha: 0.34, width: Math.max(1.2, tileSize * 0.032) });
          line.x = 0;
          line.y = 0;
          line.alpha = 0;
          fxLayer.addChild(line);

          const tracer = new Graphics();
          tracer.circle(0, 0, Math.max(1.5, tileSize * 0.045));
          tracer.fill({ color: 0xffffff, alpha: 0.82 });
          tracer.x = fromX;
          tracer.y = fromY;
          tracer.alpha = 0;
          tracer.blendMode = "add" as any;
          fxLayer.addChild(tracer);

          const glint = new Graphics();
          glint.circle(toX, toY, Math.max(1.5, tileSize * 0.062));
          glint.fill({ color, alpha: 0.34 });
          glint.alpha = 0;
          glint.blendMode = "add" as any;
          fxLayer.addChild(glint);

          Promise.all([
            gsapTo(line, { alpha: 0.52 }, 34, "power2.out")
              .then(() => gsapTo(line, { alpha: 0 }, 105, "power2.out")),
            gsapTo(tracer, { alpha: 0.88, x: toX, y: toY }, 92, "power3.out")
              .then(() => gsapTo(tracer, { alpha: 0 }, 45, "power2.out")),
            gsapTo(glint, { alpha: 0.62 }, 54, "power2.out")
              .then(() => Promise.all([
                gsapTo(glint.scale, { x: 2.1, y: 2.1 }, 115, "back.out(1.2)"),
                gsapTo(glint, { alpha: 0 }, 115, "power2.out"),
              ])),
          ]).then(() => {
            line.destroy();
            tracer.destroy();
            glint.destroy();
          });
        }, delay);
      };

      const showLotusRings = async (origin: Tile, color?: Rune) => {
        const chosenColor = color && PALETTE.includes(color) ? color : origin.color;
        const targets = tiles.filter((t) => t.color === chosenColor && t.id !== origin.id);
        const { x, y } = xy(origin.r, origin.c);
        const cx = x + tileSize / 2;
        const cy = y + tileSize / 2;
        const mainColor = RUNE_GLOW[chosenColor] ?? RUNE_GLOW.lotus;

        // New Lotus: premium glowing burst using particle-pack textures + Pixi/GSAP animation.
        microShake(0.72, 62);
        void showBoardDimmer(0.05, 175);
        await pulseTileView(origin, 1.18, 38, 44);
        lotusLuxuryGlowBurst(cx, cy, mainColor, 1.0, 1.0);
        candyFlashPop(cx, cy, mainColor, 0.92);
        await wait(44);

        const ordered = targets
          .slice()
          .sort((a, b) => {
            const da = Math.abs(a.r - origin.r) + Math.abs(a.c - origin.c);
            const db = Math.abs(b.r - origin.r) + Math.abs(b.c - origin.c);
            return da - db;
          });

        ordered.forEach((t, i) => {
          const delay = Math.min(200, i * 7);
          queueTimer(() => {
            const p = xy(t.r, t.c);
            const tx = p.x + tileSize / 2;
            const ty = p.y + tileSize / 2;

            lotusSparkleTargetRing(tx, ty, mainColor, 0);
            lotusCandyZap(cx, cy, tx, ty, mainColor, 0);
            lotusTargetGlowPop(tx, ty, mainColor, 0.78);
            candySparkBurst(tx, ty, mainColor, 0.38);

            const tv = tileViews.get(t.id);
            if (tv) {
              gsapTo(tv.wrap.scale, { x: 1.18, y: 1.18 }, 38, "back.out(1.5)")
                .then(() => gsapTo(tv.wrap.scale, { x: 0.9, y: 0.9 }, 48, "power3.out"))
                .then(() => gsapTo(tv.wrap.scale, { x: 1, y: 1 }, 46, "power3.out"));
            }
          }, delay);
        });

        await wait(Math.min(330, ordered.length * 7 + 105));
        lotusLuxuryGlowBurst(cx, cy, mainColor, 0.72, 0.65);
        await wait(36);
      };

      const showRoyalLotusBloom = async (origin: Tile) => {
        microShake(1.35, 110);
        const { x, y } = xy(origin.r, origin.c);
        const cx = x + tileSize / 2;
        const cy = y + tileSize / 2;

        await pulseTileView(origin, 1.14, 54, 58);
        void showBoardDimmer(0.11, 280);
        await wait(60);

        lotusLuxuryGlowBurst(cx, cy, 0xffd7f4, 1.35, 1.7);
        queueTimer(() => lotusLuxuryGlowBurst(cx, cy, 0xfff1a8, 1.05, 1.1), 120);
        candySparkBurst(cx, cy, 0xffd7f4, 1.75);
        await wait(430);
      };

      const playRoyalLotusBloom = async (a: Tile, b?: Tile) => {
        playSfx("lotus");
        queueTimer(() => playSfx("runicClear"), 420);
        await showRoyalLotusBloom(a);
        const clear = new Set<number>();
        const radius = 3;
        for (const t of tiles) {
          const nearA = Math.abs(t.r - a.r) + Math.abs(t.c - a.c) <= radius;
          const nearB = b ? Math.abs(t.r - b.r) + Math.abs(t.c - b.c) <= radius : false;
          if (nearA || nearB) clear.add(idx(t.r, t.c));
        }
        if (clear.size < Math.floor(N * N * 0.72)) {
          for (const t of tiles) clear.add(idx(t.r, t.c));
        }
        const activated = new Set<number>([a.id]);
        if (b) activated.add(b.id);
        await clearCells(clear, idx(a.r, a.c), BONUS_LOTUS * 3, undefined, "none", activated);
      };

            const withTimeout = async <T,>(promise: Promise<T>, ms: number, label = "timeout"): Promise<T | null> => {
        let timer: ReturnType<typeof window.setTimeout> | null = null;
        try {
          return await Promise.race([
            promise,
            new Promise<null>((resolve) => {
              timer = queueTimer(() => {
                console.warn(`Rune Rush ${label}`);
                resolve(null);
              }, ms);
            }),
          ]);
        } finally {
          if (timer) { window.clearTimeout(timer); timeoutIds.delete(timer); }
        }
      };

const playLotus = async (origin: Tile, color: Rune) => {
        playSfx("lotus");
        const chosenColor = PALETTE.includes(color) ? color : origin.color;
        const clear = new Set<number>();
        addLotusCells(clear, origin, chosenColor);

        await withTimeout(showLotusRings(origin, chosenColor), 1150, "lotus animation timeout");
        await clearCells(clear, idx(origin.r, origin.c), BONUS_LOTUS, undefined, "none", new Set([origin.id]));
      };

      const playLotusMega = async (origin: Tile) => {
        await playRoyalLotusBloom(origin);
      };

      const showGoldenLotusEclipse = async (origin: Tile, color: Rune) => {
        const chosenColor = PALETTE.includes(color) ? color : origin.color;
        const targets = tiles.filter((t) => t.color === chosenColor && t.id !== origin.id);
        const { x, y } = xy(origin.r, origin.c);
        const cx = x + tileSize / 2;
        const cy = y + tileSize / 2;
        const mainColor = 0xffd978;

        void showBoardDimmer(0.065, 180);
        await pulseTileView(origin, 1.15, 38, 44);
        lotusLuxuryGlowBurst(cx, cy, mainColor, 1.08, 1.15);
        candyFlashPop(cx, cy, mainColor, 0.98);
        await wait(48);

        targets.forEach((t, i) => {
          const delay = Math.min(220, i * 8);
          queueTimer(() => {
            const p = xy(t.r, t.c);
            const tx = p.x + tileSize / 2;
            const ty = p.y + tileSize / 2;
            lotusSparkleTargetRing(tx, ty, mainColor, 0);
            lotusCandyZap(cx, cy, tx, ty, mainColor, 0);
            lotusTargetGlowPop(tx, ty, mainColor, 0.82);
            candySparkBurst(tx, ty, mainColor, 0.44);
            const tv = tileViews.get(t.id);
            if (tv) {
              gsapTo(tv.wrap.scale, { x: 1.17, y: 1.17 }, 40, "back.out(1.35)")
                .then(() => gsapTo(tv.wrap.scale, { x: 1, y: 1 }, 56, "power3.out"));
            }
          }, delay);
        });

        await wait(Math.min(360, targets.length * 8 + 115));
        lotusLuxuryGlowBurst(cx, cy, mainColor, 0.78, 0.7);
        await wait(40);
      };

      const playGoldenLotusEclipse = async (lotus: Tile, golden: Tile, color: Rune) => {
        playSfx("lotus");
        const chosenColor = PALETTE.includes(color) ? color : lotus.color;
        const clear = new Set<number>();
        addLotusCells(clear, lotus, chosenColor);
        clear.add(idx(golden.r, golden.c));
        await withTimeout(showGoldenLotusEclipse(lotus, chosenColor), 1150, "golden lotus animation timeout");
        for (let rr = Math.max(0, lotus.r - 1); rr <= Math.min(N - 1, lotus.r + 1); rr++) {
          for (let cc = Math.max(0, lotus.c - 1); cc <= Math.min(N - 1, lotus.c + 1); cc++) clear.add(idx(rr, cc));
        }
        await clearCells(clear, idx(lotus.r, lotus.c), BONUS_LOTUS + BONUS_GOLDEN * 2, undefined, "none", new Set([lotus.id, golden.id]));
      };

      const playLotusGolden = async (origin: Tile, color: Rune) => {
        playSfx("lotus");
        const chosenColor = PALETTE.includes(color) ? color : origin.color;
        const clear = new Set<number>();
        addLotusCells(clear, origin, chosenColor);
        await withTimeout(showGoldenLotusEclipse(origin, chosenColor), 1150, "golden lotus animation timeout");
        await clearCells(clear, idx(origin.r, origin.c), BONUS_LOTUS + BONUS_GOLDEN, undefined, "none", new Set([origin.id]));
      };

      const spreadFog = () => {
        if (level.objectiveKind !== "fog") return;
        if (fogClearedThisMove) return;
        const fogCells = fog.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
        const candidates = new Set<number>();
        for (const k of fogCells) {
          const { r, c } = rc(k);
          const adj = [
            r > 0 ? idx(r - 1, c) : -1,
            r < N - 1 ? idx(r + 1, c) : -1,
            c > 0 ? idx(r, c - 1) : -1,
            c < N - 1 ? idx(r, c + 1) : -1,
          ].filter((x) => x >= 0 && !fog[x]);
          for (const a of adj) candidates.add(a);
        }
        const list = Array.from(candidates);
        if (list.length) fog[list[Math.floor(Math.random() * list.length)]] = true;
      };

      const finishLevelWin = () => {
        phase = "win";
        message = "the pond remembers. level complete.";
        playSfx("win");
        hud();
        onLevelCompleteRef.current?.();
        return true;
      };

      const showRunicClearWin = async () => {
        playSfx("runicClear");
        queueTimer(() => playSfx("win"), 230);
        addBoardBannerText("RUNIC CLEAR!");
        await wait(650);
        return finishLevelWin();
      };

      let finaleStarted = false;

      const chooseFinaleSpecial = (): { special: Special; rune?: Rune } => {
        const roll = Math.random();
        // Rune Rush finale now has a much better chance to awaken Lotus.
        if (roll < 0.18) return { special: "lotus", rune: "lotus" };
        if (roll < 0.52) return { special: "golden", rune: "golden" };
        if (roll < 0.82) return { special: "bomb" };
        return { special: "lotus", rune: "lotus" };
      };

      const playFinaleConvertFx = async (t: Tile) => {
        playSfx("convert");
        const p = xy(t.r, t.c);
        const cx = p.x + tileSize / 2;
        const cy = p.y + tileSize / 2;
        const color = t.special === "lotus" ? 0xffd7f4 : t.special === "golden" ? 0xffdc78 : 0xffb76d;

        luxuryParticleBurst(["star", "sparkle", "star"], cx, cy, 6, tileSize * 0.46, tileSize * 0.2, color, 230);

        candyFlashPop(cx, cy, color, 1.05);
        const flash = new Graphics();
        flash.circle(cx, cy, tileSize * 0.2);
        flash.fill({ color: 0xffffff, alpha: 0.22 });
        fxLayer.addChild(flash);

        await Promise.all([
          addTween(flash.scale, { x: 2.0, y: 2.0 }, 180, easeOutQuart),
          addTween(flash, { alpha: 0 }, 180, easeOutQuart),
        ]);
        flash.destroy();
      };

      const runRuneRushFinale = async () => {
        microShake(1.1, 120);
        if (finaleStarted) return showRunicClearWin();
        finaleStarted = true;
        phase = "finale";
        const unusedMoves = Math.max(0, moves);
        moves = 0;
        combo = Math.max(combo, 1);
        message = unusedMoves > 0 ? "Rune Rush! remaining moves awaken." : "Victory Bloom.";
        playSfx("finale");
        hud();

        if (unusedMoves <= 0) {
          await wait(260);
          return showRunicClearWin();
        }

        addScorePopup(boardSize / 2, tileSize * 0.9, "RUNE RUSH!", "special");

        const converted = new Set<number>();
        for (let i = 0; i < unusedMoves; i++) {
          const candidates = tiles.filter((t) => t.special === "none" && !fog[idx(t.r, t.c)] && !converted.has(idx(t.r, t.c)));
          if (!candidates.length) break;
          const t = candidates[Math.floor(Math.random() * candidates.length)];
          const next = chooseFinaleSpecial();
          t.special = next.special;
          if (next.rune) t.rune = next.rune;
          converted.add(idx(t.r, t.c));
          score += 85;
          message = `Rune Rush converts move ${i + 1}/${unusedMoves}`;
          drawBoardBack();
          renderTiles();
          renderFog();
          hud();
          await playFinaleConvertFx(t);
          await wait(45);
        }

        if (converted.size) {
          const first = Array.from(converted)[0];
          await clearCells(converted, first, unusedMoves * 110, undefined, "none");
          await resolveCascades(null);
        }

        message = "Victory Bloom complete.";
        hud();
        await wait(520);
        return showRunicClearWin();
      };

      const checkWinFail = async () => {
        let won = false;
        if (level.objectiveKind === "score") won = score >= level.targetScore;
        if (level.objectiveKind === "fog") won = fog.filter(Boolean).length === 0;
        if (level.objectiveKind === "collect") won = Object.values(collectRemaining).every((v) => (v ?? 0) <= 0);
        if (won) {
          if (moves > 0 && !finaleStarted) await runRuneRushFinale();
          else await showRunicClearWin();
          return true;
        }
        if (moves <= 0) {
          phase = "fail";
          message = "Out of moves";
          if (!levelFailedNotified) {
            levelFailedNotified = true;
            onLevelFailedRef.current?.();
          }
          hud();
          return true;
        }
        return false;
      };

      const afterMove = async () => {
        // Candy-Crush-style rule: if gravity/refill leaves any 3+ match, auto-clear it before returning control.
        await resolveCascades(null);
        spreadFog();
        fogClearedThisMove = false;
        repairGrid();
        refresh();

        if (await checkWinFail()) return;

        phase = "idle";
        combo = 0;
        message = "";
        hud();
      };

      let selected: Tile | null = null;
      const handleTap = (t: Tile) => {
        if (phase !== "idle" || fog[idx(t.r, t.c)]) return;
        if (!selected) {
          selected = t;
          const tv = tileViews.get(t.id);
          if (tv) {
            tv.rim.clear();
            tv.rim.roundRect(-tileSize / 2 + 1, -tileSize / 2 + 1, tileSize - 2, tileSize - 2, Math.max(11, Math.round(tileSize * 0.21)));
            tv.rim.stroke({ color: 0xffe68c, alpha: 0.85, width: 2 });
          }
          return;
        }
        const prev = selected;
        selected = null;
        refresh();
        if (areNeighbors(prev, t)) attemptSwap(prev, t);
        else handleTap(t);
      };

      const attemptSwap = async (a0: Tile, b0: Tile) => {
        const a = tiles.find((t) => t.id === a0.id);
        const b = tiles.find((t) => t.id === b0.id);
        if (!a || !b || phase !== "idle" || !areNeighbors(a, b)) return;
        if (fog[idx(a.r, a.c)] || fog[idx(b.r, b.c)]) return;

        const ar = a.r, ac = a.c, br = b.r, bc = b.c;
        const startMoves = moves;

        try {
          phase = "busy";
          combo = 0;
          playSfx("swap");
          moves -= 1;
          message = "";
          hud();

          a.r = br; a.c = bc; b.r = ar; b.c = ac;
          await updateTilePositions(true, SWAP_MS, easeInOut);

          if (a.special === "lotus" && b.special === "lotus") {
            await playRoyalLotusBloom(a, b);
            await resolveCascades(null);
            await afterMove();
            return;
          }
          if (a.special === "golden" && b.special === "golden") {
            await playMassiveGoldenClear(a, b);
            await resolveCascades(null);
            await afterMove();
            return;
          }
          if (a.special === "lotus" && b.special === "golden") {
            await playGoldenLotusEclipse(a, b, b.color);
            await resolveCascades(null);
            await afterMove();
            return;
          }
          if (b.special === "lotus" && a.special === "golden") {
            await playGoldenLotusEclipse(b, a, a.color);
            await resolveCascades(null);
            await afterMove();
            return;
          }
          if (a.special === "lotus" && b.special === "bomb") {
            await playLotus(a, b.color);
            await resolveCascades(null);
            await afterMove();
            return;
          }
          if (b.special === "lotus" && a.special === "bomb") {
            await playLotus(b, a.color);
            await resolveCascades(null);
            await afterMove();
            return;
          }
          if ((a.special !== "none" || b.special !== "none") && (a.special === "bomb" || b.special === "bomb")) {
            const clear = new Set<number>([idx(a.r, a.c), idx(b.r, b.c)]);
            await clearCells(clear, idx(a.r, a.c), BONUS_GOLDEN, undefined, "none");
            await resolveCascades(null);
            await afterMove();
            return;
          }
          if (a.special === "lotus") {
            await playLotus(a, b.color);
            await resolveCascades(null);
            await afterMove();
            return;
          }
          if (b.special === "lotus") {
            await playLotus(b, a.color);
            await resolveCascades(null);
            await afterMove();
            return;
          }
          if (a.special === "golden") {
            await playGolden(a, ar === br ? "h" : "v");
            await resolveCascades(null);
            await afterMove();
            return;
          }
          if (b.special === "golden") {
            await playGolden(b, ar === br ? "h" : "v");
            await resolveCascades(null);
            await afterMove();
            return;
          }
          const m = computeMatches(tiles, fog);
          if (!m.clear.size) {
            moves += 1;
            playSfx("bad");
            a.r = ar; a.c = ac; b.r = br; b.c = bc;
            await updateTilePositions(true, SWAP_MS + 38, easeSoftBack);
            message = "Try another move";
            phase = "idle";
            hud();
            return;
          }

          const seed = chooseSpawn(m, [idx(a.r, a.c), idx(b.r, b.c)]);
          const clearSet = new Set(m.clear);
          const focus = seed?.k ?? idx(a.r, a.c);
          await clearCells(clearSet, focus, 0, seed ?? undefined);
          await afterMove();
        } catch (err) {
          console.error("Rune Rush swap failed", err);
          a.r = ar; a.c = ac; b.r = br; b.c = bc;
          moves = startMoves;
          phase = "idle";
          message = "Move reset";
          drawBoardBack();
          renderTiles();
          renderFog();
          await updateTilePositions(false);
          hud();
        }
      };

      const findHint = () => {
        for (const a of tiles) {
          if (fog[idx(a.r, a.c)]) continue;
          for (const [dr, dc] of [[0, 1], [1, 0]] as [number, number][]) {
            const b = tiles.find((t) => t.r === a.r + dr && t.c === a.c + dc);
            if (!b || fog[idx(b.r, b.c)]) continue;
            if (a.special !== "none" || b.special !== "none") return [a, b] as const;
            const ar = a.r, ac = a.c, br = b.r, bc = b.c;
            a.r = br; a.c = bc; b.r = ar; b.c = ac;
            const ok = computeMatches(tiles, fog).clear.size > 0;
            a.r = ar; a.c = ac; b.r = br; b.c = bc;
            if (ok) return [a, b] as const;
          }
        }
        return null;
      };

      const playHint = () => {
        if (phase !== "idle" || Date.now() - lastAction < HINT_IDLE_MS) return;
        const pair = findHint();
        if (!pair) return;
        lastAction = Date.now() - HINT_IDLE_MS + HINT_REPEAT_MS;
        const [a, b] = pair;
        const va = tileViews.get(a.id);
        const vb = tileViews.get(b.id);
        if (!va || !vb) return;
        const dx = (b.c - a.c) * tileSize * 0.18;
        const dy = (b.r - a.r) * tileSize * 0.18;
        va.busy = vb.busy = true;
        Promise.all([
          addTween(va.wrap, { x: va.baseX + dx, y: va.baseY + dy }, 190, easeBack),
          addTween(vb.wrap, { x: vb.baseX - dx, y: vb.baseY - dy }, 190, easeBack),
        ]).then(() =>
          Promise.all([
            addTween(va.wrap, { x: va.baseX, y: va.baseY }, 190, easeBack),
            addTween(vb.wrap, { x: vb.baseX, y: vb.baseY }, 190, easeBack),
          ]).then(() => { va.busy = false; vb.busy = false; })
        );
      };

      let elapsed = 0;
      app.ticker.add((ticker: any) => {
        const dt = ticker.deltaMS || 16.7;
        elapsed += dt / 1000;
        for (let i = tweens.length - 1; i >= 0; i--) {
          const tw = tweens[i];
          if (!tw || !tw.target || tw.target.destroyed || tw.target._destroyed) {
            tweens.splice(i, 1);
            tw?.done?.();
            continue;
          }

          tw.elapsed += dt;
          const p = clamp(tw.elapsed / Math.max(1, tw.ms), 0, 1);
          const e = tw.ease(p);

          try {
            for (const k of Object.keys(tw.to)) {
              if (!tw.target) break;
              tw.target[k] = tw.from[k] + (tw.to[k] - tw.from[k]) * e;
            }
          } catch {
            tweens.splice(i, 1);
            tw.done?.();
            continue;
          }

          if (p >= 1) {
            tweens.splice(i, 1);
            tw.done?.();
          }
        }
        // Performance v73: do not force tile scale to 1 every frame.
        // Pixi/GSAP scale animations now complete cleanly, then each animation returns its own tile to scale 1.
        for (const child of fogLayer.children) {
          const cont = child as Container;
          for (const puff of cont.children) {
            if ((puff as any).__fogPhase === undefined) continue;
            const phaseNum = ((puff as any).__fogPhase ?? 0) as number;
            puff.x = Math.sin(elapsed * 1.45 + phaseNum) * tileSize * 0.09;
            puff.y = Math.cos(elapsed * 1.15 + phaseNum) * tileSize * 0.07;
            puff.alpha = 0.24 + Math.sin(elapsed * 1.8 + phaseNum) * 0.065;
          }
        }
      });

      hintTimer = setInterval(playHint, 900);
      refresh();
      hud();
    };

    run().catch((err) => {
      console.error(err);
      if (host) {
        const msg = err instanceof Error ? err.message : String(err ?? "unknown error");
        host.innerHTML = `<div style="color:#fff1c6;padding:16px;text-align:center;line-height:1.4">Pixi board failed to load.<br/><small>${msg}</small></div>`;
      }
    });

    return () => {
      cancelled = true;
      clearQueuedTimers();
      if (hintTimer) clearInterval(hintTimer);
      try {
        app?.ticker?.stop();
        app?.stage?.removeChildren();
        (app as any)?.destroy?.(true, { children: true, texture: false, textureSource: false });
      } catch {
        try { app?.renderer?.destroy(); } catch {}
      }
      if (host) host.innerHTML = "";
    };
  }, [levelIndex]);

  return <div ref={hostRef} className="pixiHost" />;
}
