"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Texture,
  Text,
} from "pixi.js";

type Rune = "blue" | "spiral" | "orange" | "triangle" | "leaf" | "time" | "moon" | "golden" | "lotus";
type Special = "none" | "bomb" | "golden" | "lotus";
type GoldenDir = "h" | "v";
type ObjectiveKind = "score" | "collect" | "fog" | "ingredient" | "mixed";
type Phase = "idle" | "busy" | "finale" | "win" | "fail";

type IngredientKind = "key" | "coin";
type Ingredient = {
  id: number;
  r: number;
  c: number;
  dropped: boolean;
  kind: IngredientKind;
  prevR?: number;
  prevC?: number;
  fallDistance?: number;
};

type Tile = {
  id: number;
  r: number;
  c: number;
  color: Rune;
  rune: Rune;
  special: Special;
  goldenDir?: GoldenDir;
};

type SpecialSpawn = {
  k: number;
  special: Special;
  rune: Rune;
  goldenDir?: GoldenDir;
  conversion?: boolean;
};

type Level = {
  idx: number;
  moves: number;
  objectiveKind: ObjectiveKind;
  targetScore: number;
  requireScore?: boolean;
  collectTarget: Partial<Record<Rune, number>>;
  fogCount: number;
  ingredientTarget: number;
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
  ingredient?: { dropped: number; total: number };
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
  coveredByIngredient: boolean;
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
  soundVolume?: number;
  onLevelComplete?: () => void;
  onLevelFailed?: () => void;
};

type SfxKey = "swap" | "match" | "clear" | "runicClear" | "chain" | "special" | "spawn" | "lotusSpawn" | "goldenSpawn" | "convert" | "bomb" | "golden" | "lotus" | "finale" | "fog" | "bad" | "win";

const N = 7;
const MAX_LIVES = 7;
const PTS_PER_TILE = 7;
const BONUS_GOLDEN = 65;
const BONUS_LOTUS = 190;
const BONUS_COMBO = 28;
const SWAP_MS = 58;
const DROP_MS = 58;
const POP_MS = 62;
const CLEAR_IMPACT_PAUSE_MS = 8;
const SPECIAL_IMPACT_PAUSE_MS = 18;
const CASCADE_WAIT_MS = 3;
const SURVIVOR_FALL_MS = 70;
const SURVIVOR_BOUNCE_MS = 24;
const NEW_TILE_DROP_DELAY_MS = 1;
const NEW_TILE_DROP_MS = 76;
const NEW_TILE_SETTLE_MS = 24;
const BOARD_CHECK_PAUSE_MS = 3;
const SPECIAL_CHAIN_STAGGER_MS = 26;
const SPECIAL_CHAIN_GROUP_GAP_MS = 40;
const SPECIAL_CHAIN_GAP_MS = 8;
const HINT_IDLE_MS = 8500;
const HINT_REPEAT_MS = 4700;
const BUILD_TAG = "pixifull-v141-easier-snappy-stable";

const PALETTE: Rune[] = ["blue", "spiral", "orange", "triangle", "leaf", "time", "moon"];
const FALLBACK: Record<Rune, string> = {
  blue: "🐸",
  spiral: "🌀",
  orange: "■",
  triangle: "▲",
  leaf: "🍃",
  time: "\u231b",
  moon: "\u263e",
  golden: "🐸",
  lotus: "✦",
};
const RUNE_FILES: Record<Rune, string> = {
  blue: "/runes/blue.png",
  spiral: "/runes/spiral.png",
  orange: "/runes/orange.png",
  triangle: "/runes/triangle.png",
  leaf: "/runes/leaf.png",
  time: "/runes/time.png",
  moon: "/runes/moon.png",
  golden: "/runes/golden.png",
  lotus: "/runes/lotus.png",
};

const ITEM_FILES: Record<IngredientKind, string> = {
  key: "/ingredients/key.png?v=ingredients-old1",
  coin: "/ingredients/coin.png?v=ingredients-old1",
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

// Curated premium FX picks from the uploaded packs.
// These are the strongest modular choices for smooth, premium match-game layering.
// If you copy the nested Kenney light-mask pack into /public/kenney_light_masks/Default,
// the loader will automatically use those textures. Otherwise the effect falls back safely.
const PREMIUM_RING_MASK_SOURCES = [
  ["/kenney_light_masks/Default/circle_rings_a.png", "/kenney_light-masks-1.0/Default/circle_rings_a.png"],
  ["/kenney_light_masks/Default/circle_rings_b.png", "/kenney_light-masks-1.0/Default/circle_rings_b.png"],
  ["/kenney_light_masks/Default/circle_rings_c.png", "/kenney_light-masks-1.0/Default/circle_rings_c.png"],
];

const PREMIUM_GLOW_MASK_SOURCES = [
  ["/kenney_light_masks/Default/circle_a_streaks.png", "/kenney_light-masks-1.0/Default/circle_a_streaks.png"],
  ["/kenney_light_masks/Default/circle_b_streaks.png", "/kenney_light-masks-1.0/Default/circle_b_streaks.png"],
  ["/kenney_light_masks/Default/circle_c_streaks.png", "/kenney_light-masks-1.0/Default/circle_c_streaks.png"],
  ["/kenney_light_masks/Default/circle_d_streaks.png", "/kenney_light-masks-1.0/Default/circle_d_streaks.png"],
];

const PREMIUM_SPARKLE_SOURCES = [
  ["/fx/kenney/spark_04.png", "/fx/spark_04.png"],
  ["/fx/kenney/spark_06.png", "/fx/spark_06.png"],
  ["/fx/kenney/star_03.png", "/fx/star_03.png"],
  ["/fx/kenney/star_06.png", "/fx/star_06.png"],
  ["/fx/kenney/star_08.png", "/fx/star_08.png"],
];

const PREMIUM_MAGIC_SOURCES = [
  ["/fx/kenney/magic_02.png", "/fx/magic_02.png"],
  ["/fx/kenney/magic_04.png", "/fx/magic_04.png"],
  ["/fx/kenney/twirl_01.png", "/fx/twirl_01.png"],
  ["/fx/kenney/twirl_02.png", "/fx/twirl_02.png"],
  ["/fx/kenney/light_02.png", "/fx/light_02.png"],
  ["/fx/kenney/light_03.png", "/fx/light_03.png"],
  ["/fx/beamGlowSprite.png"],
];

const PREMIUM_TRACE_SOURCES = [
  ["/fx/kenney/trace_02.png", "/fx/trace_02.png"],
  ["/fx/kenney/trace_04.png", "/fx/trace_04.png"],
  ["/fx/kenney/trace_06.png", "/fx/trace_06.png"],
];

const ORIGINAL_SFX: Record<SfxKey, string[]> = {
  swap: ["/sfx/swap.mp3", "/sfx/swap.wav", "/sfx/click.mp3", "/sfx/move.mp3", "/sounds/swap.mp3", "/sounds/click.mp3"],
  match: ["/sfx/match.mp3", "/sfx/match.wav", "/sfx/clear.mp3", "/sfx/pop.mp3", "/sounds/match.mp3", "/sounds/clear.mp3"],
  clear: ["/sfx/clear.mp3", "/sfx/pop.mp3", "/sounds/clear.mp3"],
  runicClear: ["/sfx/runic-clear.mp3", "/sfx/clear-special.mp3", "/sfx/sparkle-clear.mp3", "/sounds/runic-clear.mp3"],
  chain: ["/sfx/chain.mp3", "/sfx/combo.mp3", "/sfx/special-chain.mp3", "/sounds/chain.mp3"],
  special: ["/sfx/special.mp3", "/sfx/powerup.mp3", "/sfx/magic.mp3", "/sounds/special.mp3"],
  // Generic spawn is kept only for non-premium specials and never points at spawn.mp3.
  // Lotus spawn must use spawn.mp3. Golden spawn must use goldenspawn.mp3.
  spawn: ["/sfx/special.mp3", "/sfx/powerup.mp3", "/sounds/special.mp3"],
  lotusSpawn: ["/sfx/spawn.mp3"],
  goldenSpawn: ["/sfx/goldenspawn.mp3"],
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
  time: 0xcfe9ff,
  moon: 0xb58cff,
  golden: 0xffdc68,
  lotus: 0xffd8f4,
};

const CHAIN_PHRASES = ["Bushido!", "Rune Rush!", "Mystic Match!", "Sacred Combo!", "Still Water Surge!"];

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

  // Gentle repeating rhythm: easy boards, a mild challenge, then a relief board.
  // The formula is procedural, so levels continue forever without a hard end.
  const rhythm = ["easy", "easy", "relief", "normal", "easy", "hard", "relief", "normal"] as const;
  const tier = rhythm[levelIndex % rhythm.length];
  const wave = Math.floor(levelIndex / rhythm.length);

  const scoreBase: Record<typeof tier, number> = {
    relief: 720,
    easy: 860,
    normal: 1080,
    hard: 1320,
  };

  const scoreRamp: Record<typeof tier, number> = {
    relief: 22,
    easy: 28,
    normal: 36,
    hard: 44,
  };

  const moveBase: Record<typeof tier, number> = {
    relief: 30,
    easy: 29,
    normal: 28,
    hard: 27,
  };

  const minMoves: Record<typeof tier, number> = {
    relief: 26,
    easy: 25,
    normal: 24,
    hard: 24,
  };

  const baseMoves = clamp(moveBase[tier] - Math.floor(wave * 0.08), minMoves[tier], moveBase[tier]);
  const levelOneBonusMoves = levelIndex === 0 ? 5 : 0;
  const targetScore = Math.round(scoreBase[tier] + wave * scoreRamp[tier] + levelIndex * 11);

  const collectTargetFor = (slots: number, perRune: number) => {
    const target: Partial<Record<Rune, number>> = {};
    const safeSlots = clamp(Math.floor(slots), 1, 3);
    const safePerRune = Math.max(3, Math.floor(perRune));
    for (let i = 0; i < safeSlots; i++) {
      const rune = PALETTE[(levelIndex * 2 + 1 + i * 3) % PALETTE.length];
      target[rune] = safePerRune + (i === 0 && safeSlots === 1 ? Math.floor(wave * 0.35) : 0);
    }
    return target;
  };

  const collectTotalBase: Record<typeof tier, number> = {
    relief: 4,
    easy: 5,
    normal: 6,
    hard: 7,
  };

  const fogBase: Record<typeof tier, number> = {
    relief: 2,
    easy: 3,
    normal: 4,
    hard: 5,
  };

  const ingredientBase: Record<typeof tier, number> = {
    relief: 1,
    easy: 1,
    normal: 1,
    hard: 2,
  };

  // Later boards can ask for more than one kind of goal, but the numbers stay forgiving.
  if (num >= 14 && num % 9 === 0) {
    return {
      idx: levelIndex,
      moves: baseMoves + 4,
      objectiveKind: "mixed",
      targetScore,
      collectTarget: collectTargetFor(num >= 28 ? 2 : 1, Math.max(3, collectTotalBase[tier] - 1)),
      fogCount: clamp(fogBase[tier] + Math.floor(wave * 0.2), fogBase[tier], 7),
      ingredientTarget: 0,
    };
  }

  if (num >= 18 && num % 10 === 0) {
    return {
      idx: levelIndex,
      moves: baseMoves + 4,
      objectiveKind: "mixed",
      requireScore: true,
      targetScore: Math.round(targetScore * 0.88),
      collectTarget: collectTargetFor(2, Math.max(3, collectTotalBase[tier] - 2)),
      fogCount: 0,
      ingredientTarget: 0,
    };
  }

  if (num >= 26 && num % 13 === 0) {
    return {
      idx: levelIndex,
      moves: baseMoves + 5,
      objectiveKind: "mixed",
      targetScore,
      collectTarget: collectTargetFor(2, Math.max(3, collectTotalBase[tier] - 3)),
      fogCount: 0,
      ingredientTarget: 1,
    };
  }

  // Ingredient levels start after the opening boards, then repeat on easier rhythm slots.
  // Goal: guide the Sacred Key and Golden Coin to the bottom by clearing runes under them.
  if (num >= 8 && num % 6 === 2) {
    return {
      idx: levelIndex,
      moves: baseMoves + 4,
      objectiveKind: "ingredient",
      targetScore,
      collectTarget: {},
      fogCount: 0,
      ingredientTarget: clamp(ingredientBase[tier] + Math.floor(wave * 0.08), 1, tier === "hard" ? 2 : 1),
    };
  }

  if (num % 3 === 0) {
    return {
      idx: levelIndex,
      moves: baseMoves + 3,
      objectiveKind: "fog",
      targetScore,
      collectTarget: {},
      fogCount: clamp(fogBase[tier] + Math.floor(wave * 0.35), fogBase[tier], tier === "hard" ? 8 : 6),
      ingredientTarget: 0,
    };
  }

  if (num % 4 === 0 || num % 5 === 0) {
    const slots = num >= 10 && (num % 5 === 0 || num % 8 === 0) ? 2 : num >= 32 && num % 11 === 0 ? 3 : 1;
    const perRune = clamp(collectTotalBase[tier] + Math.floor(wave * 0.18), collectTotalBase[tier], tier === "hard" ? 8 : 7);

    return {
      idx: levelIndex,
      moves: baseMoves + (slots > 1 ? 4 : 3),
      objectiveKind: "collect",
      targetScore,
      collectTarget: collectTargetFor(slots, slots > 1 ? Math.max(3, perRune - 2) : perRune),
      fogCount: 0,
      ingredientTarget: 0,
    };
  }

  return {
    idx: levelIndex,
    moves: baseMoves + levelOneBonusMoves,
    objectiveKind: "score",
    targetScore,
    collectTarget: {},
    fogCount: 0,
    ingredientTarget: 0,
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

function initIngredients(count: number): Ingredient[] {
  const safeCount = Math.max(0, Math.min(4, Math.floor(count || 0)));
  if (!safeCount) return [];
  const columns = [1, 3, 5, 2, 4, 0, 6];
  const startRows = [0, 0, 1, 1];
  const ingredients: Ingredient[] = [];
  for (let i = 0; i < safeCount; i++) {
    ingredients.push({ id: i + 1, r: startRows[i] ?? 0, c: columns[i % columns.length], dropped: false, kind: i % 2 === 0 ? "key" : "coin" });
  }
  return ingredients;
}

function toGrid(tiles: Tile[]) {
  const grid: (Tile | null)[] = new Array(N * N).fill(null);
  for (const t of tiles) {
    if (!t || t.r < 0 || t.r >= N || t.c < 0 || t.c >= N) continue;
    const k = idx(t.r, t.c);
    if (!grid[k]) grid[k] = t;
  }
  return grid;
}

function computeMatches(tiles: Tile[], fog: (boolean | null)[], blocked = new Set<number>()) {
  const grid = toGrid(tiles);
  const clear = new Set<number>();
  const hRun = new Array(N * N).fill(0);
  const vRun = new Array(N * N).fill(0);

  for (let r = 0; r < N; r++) {
    let c = 0;
    while (c < N) {
      if (fog[idx(r, c)] || blocked.has(idx(r, c))) {
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
        if (fog[idx(r, end)] || blocked.has(idx(r, end))) break;
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
      if (fog[idx(r, c)] || blocked.has(idx(r, c))) {
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
        if (fog[idx(end, c)] || blocked.has(idx(end, c))) break;
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
  if (is4) return { special: "golden" as const, rune: "golden" as const, goldenDir: h >= 4 ? "h" as const : "v" as const, priority: 2 };
  return null;
}

function chooseSpawn(m: ReturnType<typeof computeMatches>, preferred: number[]) {
  const candidates: { k: number; special: Special; rune: Rune; goldenDir?: GoldenDir; priority: number; preferred: boolean }[] = [];
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

const clampSfxVolume = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.85;
  return Math.max(0, Math.min(1, n));
};

const baseSfxVolumeFor = (key: SfxKey) => {
  if (key === "bad") return 0.34;
  if (key === "lotus") return 0.55;
  if (key === "lotusSpawn") return 0.52;
  if (key === "goldenSpawn") return 0.52;
  if (key === "spawn") return 0.44;
  if (key === "golden") return 0.50;
  if (key === "convert") return 0.52;
  return 0.42;
};

export default function RuneRushPixiBoard({ levelIndex, onHud, soundOn = true, soundVolume = 0.85, onLevelComplete, onLevelFailed }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const onHudRef = useRef(onHud);
  const onLevelCompleteRef = useRef(onLevelComplete);
  const onLevelFailedRef = useRef(onLevelFailed);
  const soundOnRef = useRef(soundOn);
  const soundVolumeRef = useRef(clampSfxVolume(soundVolume));
  const audioCtxRef = useRef<AudioContext | null>(null);
  const originalSfxRef = useRef<Partial<Record<SfxKey, HTMLAudioElement[]>>>({});
  const audioPrimedRef = useRef(false);

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

  useEffect(() => {
    soundVolumeRef.current = clampSfxVolume(soundVolume);
  }, [soundVolume]);

  const getSharedSfxBank = () => {
    if (typeof window === "undefined") return originalSfxRef.current;
    const w = window as any;
    if (!w.__tobyRuneRushSfxBank) w.__tobyRuneRushSfxBank = {};
    originalSfxRef.current = w.__tobyRuneRushSfxBank;
    return originalSfxRef.current;
  };

  const primeOriginalSfxBank = () => {
    if (audioPrimedRef.current || typeof window === "undefined") return;
    audioPrimedRef.current = true;
    const bank = getSharedSfxBank();

    // Mobile/Base-App browsers sometimes refuse HTML audio until the first touch.
    // This tiny muted warmup happens during the user's first pointerdown so later
    // spawn.mp3, goldenspawn.mp3, magic.mp3, zap.mp3, and clickclick.mp3 play more reliably and on time.
    for (const list of Object.values(bank)) {
      for (const audio of list ?? []) {
        try {
          if (audio.error || audio.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) continue;
          const oldMuted = audio.muted;
          const oldVolume = audio.volume;
          audio.muted = true;
          audio.volume = 0;
          audio.currentTime = 0;
          const result = audio.play();
          if (result && typeof result.then === "function") {
            result
              .then(() => {
                audio.pause();
                audio.currentTime = 0;
                audio.muted = oldMuted;
                audio.volume = oldVolume;
              })
              .catch(() => {
                audio.muted = oldMuted;
                audio.volume = oldVolume;
              });
          } else {
            audio.pause();
            audio.currentTime = 0;
            audio.muted = oldMuted;
            audio.volume = oldVolume;
          }
        } catch {}
      }
    }
  };

  const unlockAudio = () => {
    if (!soundOnRef.current) return;
    const ctx = getAudioCtx();
    if (ctx?.state === "suspended") ctx.resume().catch(() => {});
    primeOriginalSfxBank();
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const bank = getSharedSfxBank();

    for (const key of Object.keys(ORIGINAL_SFX) as SfxKey[]) {
      if (bank[key]?.length) continue;
      bank[key] = [];

      // v81: preload several fallback files, not just the first one.
      // This fixes the old issue where one missing mp3 made the real sound disappear on some devices.
      for (const src of ORIGINAL_SFX[key].slice(0, 5)) {
        const audio = new Audio(src);
        audio.preload = "auto";
        audio.volume = baseSfxVolumeFor(key);
        audio.addEventListener("error", () => {}, { once: true });
        bank[key]?.push(audio);
        try { audio.load(); } catch {}
      }
    }

    originalSfxRef.current = bank;
    return () => { cancelled = true; };
  }, []);

  const playOriginalSfx = (key: SfxKey) => {
    if (!soundOnRef.current || soundVolumeRef.current <= 0.001) return false;
    const bank = getSharedSfxBank();
    const candidates = bank[key] ?? [];
    if (!candidates.length) return false;

    // Priority is controlled by ORIGINAL_SFX order:
    // lotus -> /sfx/magic.mp3 first, lotusSpawn -> ONLY /sfx/spawn.mp3,
    // goldenSpawn -> ONLY /sfx/goldenspawn.mp3, convert -> /sfx/clickclick.mp3 first.
    // Clone ready sounds so rapid cascades can overlap without one sound cutting off another.
    for (const audio of candidates) {
      try {
        if (audio.error || audio.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) continue;
        if (audio.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          try { audio.load(); } catch {}
          continue;
        }
        const player = audio.cloneNode(true) as HTMLAudioElement;
        player.volume = baseSfxVolumeFor(key) * soundVolumeRef.current;
        player.muted = false;
        player.currentTime = 0;
        const result = player.play();
        if (result && typeof result.catch === "function") result.catch(() => {});
        return true;
      } catch {}
    }

    return false;
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
    const volume = soundVolumeRef.current;
    if (volume <= 0.001) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    const finalGain = gain * volume;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), start + ms / 1000);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(finalGain, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, start + ms / 1000);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + ms / 1000 + 0.03);
  };

  const crumble = (ms = 70, gain = 0.035, delay = 0, cutoff = 720) => {
    if (!soundOnRef.current) return;
    const volume = soundVolumeRef.current;
    if (volume <= 0.001) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    const finalGain = gain * volume;
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
    g.gain.linearRampToValueAtTime(finalGain, start + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, start + ms / 1000);
    src.buffer = buffer;
    src.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    src.start(start);
    src.stop(start + ms / 1000 + 0.03);
  };

  const playSfx = (key: SfxKey) => {
    if (!soundOnRef.current || soundVolumeRef.current <= 0.001) return;
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

    if (key === "lotusSpawn") {
      // Lotus special appeared: light magical spawn pop. Real file priority: /sfx/spawn.mp3.
      magicRise(0, 260, 0.012);
      crystalTick(0.075, 1080, 0.0065);
      tone(1440, 92, 0.0055, "sine", 0.15);
      return;
    }

    if (key === "goldenSpawn") {
      // Golden Toby special appeared. Real file priority: /sfx/goldenspawn.mp3.
      tone(180, 58, 0.013, "triangle", 0, 330);
      tone(520, 82, 0.010, "triangle", 0.04, 940);
      crystalTick(0.11, 1240, 0.0055);
      return;
    }

    if (key === "spawn") {
      // Generic non-premium spawn fallback only. Does not use /sfx/spawn.mp3 anymore.
      magicRise(0, 230, 0.009);
      crystalTick(0.08, 920, 0.0048);
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
    let runtimeCleanup: (() => void) | null = null;
    let killAllPixiTweens: (() => void) | null = null;
    const effectTimeoutIds = new Set<number>();
    const waitTimeoutIds = new Set<number>();

    const queueTimer = (fn: () => void, ms = 0) => {
      if (typeof window === "undefined") return null;
      const id = window.setTimeout(() => {
        effectTimeoutIds.delete(id);
        if (cancelled) return;
        try {
          fn();
        } catch (err) {
          console.warn("Rune Rush queued effect skipped", err);
        }
      }, ms);
      effectTimeoutIds.add(id);
      return id;
    };

    const queueWaitTimer = (fn: () => void, ms = 0) => {
      if (typeof window === "undefined") return null;
      const id = window.setTimeout(() => {
        waitTimeoutIds.delete(id);
        if (cancelled) return;
        try {
          fn();
        } catch (err) {
          console.warn("Rune Rush wait skipped", err);
        }
      }, ms);
      waitTimeoutIds.add(id);
      return id;
    };

    const clearQueuedTimers = () => {
      effectTimeoutIds.forEach((id) => window.clearTimeout(id));
      effectTimeoutIds.clear();
    };

    const clearAllTimers = () => {
      clearQueuedTimers();
      waitTimeoutIds.forEach((id) => window.clearTimeout(id));
      waitTimeoutIds.clear();
    };

    const run = async () => {
      host.innerHTML = "";
      nextTileId = 1;

      const level = getLevel(levelIndex);
      let moves = level.moves;
      let score = 0;
      let combo = 0;
      let phase: Phase = "idle";
      let message = level.ingredientTarget > 0 ? "Guide the key and golden coin down" : "Swipe runes to match 3+";
      let levelFailedNotified = false;
      let lastAction = Date.now();
      let fogClearedThisMove = false;
      let collectRemaining: Partial<Record<Rune, number>> = { ...level.collectTarget };
      let ingredients = initIngredients(level.ingredientTarget);
      let ingredientDropped = 0;
      let fog = initFog(level.fogCount);
      let tiles = makeInitialTiles(fog);
      const hasCollectGoal = Object.values(level.collectTarget).some((v) => (v ?? 0) > 0);
      const hasFogGoal = level.fogCount > 0;
      const hasIngredientGoal = level.ingredientTarget > 0;
      const hasScoreGoal = level.objectiveKind === "score" || !!level.requireScore;
      const activeGoalTotal = [hasScoreGoal, hasCollectGoal, hasFogGoal, hasIngredientGoal].filter(Boolean).length || 1;

      const collectGoalProgress = () => {
        const total = Object.values(level.collectTarget).reduce((a, b) => a + (b ?? 0), 0) || 0;
        const remain = Object.values(collectRemaining).reduce((a, b) => a + (b ?? 0), 0) || 0;
        return {
          total,
          done: Math.max(0, total - remain),
          complete: !hasCollectGoal || remain <= 0,
          progress: total > 0 ? clamp((total - remain) / total, 0, 1) : 1,
        };
      };

      const fogGoalProgress = () => {
        const remain = fog.filter(Boolean).length;
        return {
          total: level.fogCount,
          done: Math.max(0, level.fogCount - remain),
          complete: !hasFogGoal || remain <= 0,
          progress: level.fogCount > 0 ? clamp((level.fogCount - remain) / level.fogCount, 0, 1) : 1,
        };
      };

      const ingredientGoalProgress = () => {
        const total = Math.max(0, level.ingredientTarget);
        return {
          total,
          done: ingredientDropped,
          complete: !hasIngredientGoal || ingredientDropped >= level.ingredientTarget,
          progress: total > 0 ? clamp(ingredientDropped / total, 0, 1) : 1,
        };
      };

      const scoreGoalProgress = () => ({
        total: level.targetScore,
        done: score,
        complete: !hasScoreGoal || score >= level.targetScore,
        progress: hasScoreGoal ? clamp(score / level.targetScore, 0, 1) : 1,
      });

      const activeIngredientCells = () => {
        const cells = new Set<number>();
        if (!hasIngredientGoal) return cells;
        for (const item of ingredients) {
          if (!item.dropped && item.r >= 0 && item.r < N && item.c >= 0 && item.c < N) {
            cells.add(idx(item.r, item.c));
          }
        }
        return cells;
      };

      const activeIngredientAt = (r: number, c: number) =>
        hasIngredientGoal
          ? ingredients.find((item) => !item.dropped && item.r === r && item.c === c) ?? null
          : null;

      const hasActiveIngredientAt = (r: number, c: number) => activeIngredientAt(r, c) != null;
      const computeBoardMatches = () => computeMatches(tiles, fog, activeIngredientCells());

      const protectIngredientCellsFromClear = (clearSet: Set<number>) => {
        if (!hasIngredientGoal || !clearSet.size) return 0;
        let removed = 0;
        for (const k of activeIngredientCells()) {
          if (clearSet.delete(k)) removed += 1;
        }
        return removed;
      };

      const canClearCell = (r: number, c: number) => !hasActiveIngredientAt(r, c);

      const canClearTile = (t: Tile | null | undefined): t is Tile => !!t && canClearCell(t.r, t.c);

      // Safety: never start a level with automatic matches.
      // Starting matches can immediately trigger a runaway cascade on mobile and make the board look like it is melting/glitching.
      let startGuard = 0;
      while (computeBoardMatches().clear.size > 0 && startGuard++ < 30) {
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
      const userAgent = typeof navigator !== "undefined" ? navigator.userAgent.toLowerCase() : "";
      const isBaseMiniApp = /baseapp|coinbase|farcaster|warpcast|miniprogram|wv|webview/.test(userAgent);
      const isMobileView = typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)")?.matches || boardSize < 430 || isBaseMiniApp);
      const rendererResolution = isMobileView ? Math.min(dpr || 1, isBaseMiniApp || deviceMemory <= 3 ? 1.45 : 1.65) : Math.min(dpr || 1, 2);
      const fxQuality = Math.max(
        isBaseMiniApp ? 0.54 : 0.62,
        Math.min(1.0, (tileSize / 52) * (deviceMemory <= 3 ? 0.68 : 1) * (isMobileView ? 0.76 : 1) * (dpr > 2.4 ? 0.82 : 1))
      );
      const fxCount = (n: number) => Math.max(1, Math.round(n * fxQuality));
      const fxSize = (n: number) => Math.max(2, n * Math.min(1.0, Math.max(0.66, fxQuality)));
      const wait = (ms: number) =>
        new Promise<void>((resolve) => {
          queueWaitTimer(resolve, ms);
        });

      app = new Application();
      await app.init({
        width: boardSize,
        height: boardSize,
        backgroundAlpha: 0,
        antialias: !isMobileView,
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
      try {
        canvas.dataset.runeRushBuild = BUILD_TAG;
        console.info(`[Rune Rush] loaded ${BUILD_TAG}`);
      } catch {}
      const stage = app.stage;
      const board = new Container();
      const tileLayer = new Container();
      const ingredientLayer = new Container();
      const fogLayer = new Container();
      const fxLayer = new Container();
      const tileGlowLayer = new Container();
      const clearFxLayer = new Container();
      const beamFxLayer = new Container();
      const particleFxLayer = new Container();
      const textLayer = new Container();
      fxLayer.sortableChildren = true;
      tileGlowLayer.zIndex = 10;
      clearFxLayer.zIndex = 20;
      beamFxLayer.zIndex = 30;
      particleFxLayer.zIndex = 40;
      fxLayer.addChild(tileGlowLayer, clearFxLayer, beamFxLayer, particleFxLayer);
      stage.addChild(board, tileLayer, ingredientLayer, fogLayer, fxLayer, textLayer);

      const sharpenTexture = (tex: Texture | null | undefined) => {
        if (!tex) return;
        const anyTex = tex as any;
        try {
          // Runes should look clean on phones and laptops, not jagged/pixel-stepped.
          // Linear filtering keeps clarity. Mipmap generation is skipped in mobile mini-apps
          // because it can add avoidable startup cost before the first playable board.
          if (anyTex.source) {
            anyTex.source.scaleMode = "linear";
            if (!isMobileView) {
              anyTex.source.autoGenerateMipmaps = true;
              if (typeof anyTex.source.updateMipmaps === "function") anyTex.source.updateMipmaps();
            }
            if (typeof anyTex.source.update === "function") anyTex.source.update();
          }
          if (anyTex.baseTexture) {
            anyTex.baseTexture.scaleMode = "linear";
            if (!isMobileView) anyTex.baseTexture.mipmap = "on";
            if (typeof anyTex.baseTexture.update === "function") anyTex.baseTexture.update();
          }
        } catch {}
      };

      const [stoneTex, runeEntries, itemEntries] = await Promise.all([
        safeLoadTexture([`/textures/obsidian.png?v=full13`, `/textures/stone.png?v=full13`]).then((tex) => {
          sharpenTexture(tex);
          return tex;
        }),
        Promise.all((Object.keys(RUNE_FILES) as Rune[]).map(async (rune) => {
          const tex = await safeLoadTexture([`${RUNE_FILES[rune]}?v=full17`, RUNE_FILES[rune]]);
          sharpenTexture(tex);
          return [rune, tex] as const;
        })),
        Promise.all((["key", "coin"] as IngredientKind[]).map(async (kind) => {
          const tex = await safeLoadTexture([`${ITEM_FILES[kind]}?v=item108`, ITEM_FILES[kind]]);
          sharpenTexture(tex);
          return [kind, tex] as const;
        })),
      ]);

      const runeTextures: Partial<Record<Rune, Texture | null>> = {};
      for (const [rune, tex] of runeEntries) runeTextures[rune] = tex;

      const itemTextures: Partial<Record<IngredientKind, Texture | null>> = {};
      for (const [kind, tex] of itemEntries) itemTextures[kind] = tex;

      // Do not block the board on optional FX packs.
      // Mobile/Base App can hang if many optional files 404 during startup.
      const lotusPetalTextures: Texture[] = [];
      const luxuryParticleTextures: Texture[] = [];
      const ringMaskTextures: Texture[] = [];
      const glowMaskTextures: Texture[] = [];
      const sparkleTextures: Texture[] = [];
      const magicAccentTextures: Texture[] = [];
      const traceTextures: Texture[] = [];

      if (cancelled || !app) return;

      queueTimer(() => {
        if (cancelled) return;
        const loadInto = async (dest: Texture[], candidatesList: string[][], version = "lux77") => {
          if (isBaseMiniApp && dest.length >= 2) return;
          for (const candidates of candidatesList) {
            if (isBaseMiniApp && dest.length >= 2) break;
            const request = candidates.flatMap((src) => [`${src}?v=${version}`, src]);
            const tex = await safeLoadTexture(request);
            if (tex && !cancelled) dest.push(tex);
          }
        };

        void Promise.allSettled([
          ...LUXURY_PARTICLE_FILES.slice(0, isBaseMiniApp ? 3 : isMobileView ? 5 : LUXURY_PARTICLE_FILES.length).map(async (src) => {
            const tex = await safeLoadTexture([`${src}?v=lux77`, src]);
            if (tex && !cancelled) luxuryParticleTextures.push(tex);
          }),
          loadInto(ringMaskTextures, PREMIUM_RING_MASK_SOURCES, "mask77"),
          loadInto(glowMaskTextures, PREMIUM_GLOW_MASK_SOURCES, "mask77"),
          loadInto(sparkleTextures, PREMIUM_SPARKLE_SOURCES, "spark77"),
          loadInto(magicAccentTextures, PREMIUM_MAGIC_SOURCES, "magic77"),
          loadInto(traceTextures, PREMIUM_TRACE_SOURCES, "trace77"),
        ]);
      }, isBaseMiniApp ? 1200 : isMobileView ? 520 : 80);

      const tileViews = new Map<number, TileView>();
      const ingredientViews = new Map<number, Container>();
      const instantHiddenSpecialIds = new Set<number>();
      const spawnedSpecialShieldIds = new Set<number>();
      const tweens: Tween[] = [];
      const fxBudget = isMobileView
        ? {
          glow: isBaseMiniApp ? 76 : 110,
          clear: isBaseMiniApp ? 140 : 200,
          beam: isBaseMiniApp ? 110 : 170,
          particle: isBaseMiniApp ? 190 : 300,
        }
        : { glow: 220, clear: 420, beam: 320, particle: 620 };

      const killManualTweensOf = (target: any) => {
        if (!target) return;
        for (let i = tweens.length - 1; i >= 0; i--) {
          const tw = tweens[i];
          if (tw?.target !== target) continue;
          tweens.splice(i, 1);
          try { tw.done?.(); } catch {}
        }
      };

      const killPixiTweens = (target: any) => {
        if (!target) return;
        try { gsap.killTweensOf(target); } catch {}
        killManualTweensOf(target);
        try { if (target.position) gsap.killTweensOf(target.position); } catch {}
        try { if (target.position) killManualTweensOf(target.position); } catch {}
        try { if (target.scale) gsap.killTweensOf(target.scale); } catch {}
        try { if (target.scale) killManualTweensOf(target.scale); } catch {}
        try { if (target.pivot) gsap.killTweensOf(target.pivot); } catch {}
        try { if (target.pivot) killManualTweensOf(target.pivot); } catch {}
        try { if (target.skew) gsap.killTweensOf(target.skew); } catch {}
        try { if (target.skew) killManualTweensOf(target.skew); } catch {}
        try { if (target.transform) gsap.killTweensOf(target.transform); } catch {}
        try { if (target.transform) killManualTweensOf(target.transform); } catch {}
        try {
          const filters = Array.isArray(target.filters) ? target.filters : [];
          for (const filter of filters) {
            gsap.killTweensOf(filter);
            killManualTweensOf(filter);
            try { filter?.destroy?.(); } catch {}
          }
          if (Array.isArray(target.filters) && target.filters.length) target.filters = null;
        } catch {}
        try {
          const children = Array.isArray(target.children) ? [...target.children] : [];
          for (const child of children) killPixiTweens(child);
        } catch {}
      };

      killAllPixiTweens = () => {
        try { killPixiTweens(app?.stage); } catch {}
      };

      const destroyFxChild = (child: any) => {
        if (!child) return;
        killPixiTweens(child);
        try { child.parent?.removeChild?.(child); } catch {}
        try {
          child?.destroy?.({ children: true });
        } catch {
          try { child?.destroy?.(); } catch {}
        }
      };

      const addLayerFx = <T,>(layer: Container, child: T, budget: number) => {
        while (layer.children.length >= budget) destroyFxChild(layer.children[0]);
        layer.addChild(child as any);
        return child;
      };

      const addGlowFx = <T,>(child: T) => addLayerFx(tileGlowLayer, child, fxBudget.glow);
      const addClearFx = <T,>(child: T) => addLayerFx(clearFxLayer, child, fxBudget.clear);
      const addBeamFx = <T,>(child: T) => addLayerFx(beamFxLayer, child, fxBudget.beam);
      const addParticleFx = <T,>(child: T) => addLayerFx(particleFxLayer, child, fxBudget.particle);

      const hud = () => {
        let objectiveLabel = "Reach Score";
        let objectiveText = `${score}/${level.targetScore}`;
        let progress = clamp(score / level.targetScore, 0, 1);
        let collect: Partial<Record<Rune, number>> | undefined;
        let ingredient: { dropped: number; total: number } | undefined;
        const scoreProgress = scoreGoalProgress();
        const collectProgress = collectGoalProgress();
        const fogProgress = fogGoalProgress();
        const ingredientProgress = ingredientGoalProgress();

        if (level.objectiveKind === "mixed") {
          objectiveLabel = "Mixed Goals";
          collect = hasCollectGoal ? { ...level.collectTarget } : undefined;
          ingredient = hasIngredientGoal ? { dropped: ingredientDropped, total: Math.max(1, level.ingredientTarget) } : undefined;
          const completed = [
            hasScoreGoal && scoreProgress.complete,
            hasCollectGoal && collectProgress.complete,
            hasFogGoal && fogProgress.complete,
            hasIngredientGoal && ingredientProgress.complete,
          ].filter(Boolean).length;
          objectiveText = `${completed}/${activeGoalTotal} goals`;
          progress = clamp(
            (
              (hasScoreGoal ? scoreProgress.progress : 0) +
              (hasCollectGoal ? collectProgress.progress : 0) +
              (hasFogGoal ? fogProgress.progress : 0) +
              (hasIngredientGoal ? ingredientProgress.progress : 0)
            ) / activeGoalTotal,
            0,
            1
          );
        } else if (hasCollectGoal) {
          objectiveLabel = "Collect Runes";
          collect = { ...level.collectTarget };
          objectiveText = `${collectProgress.done}/${Math.max(1, collectProgress.total)}`;
          progress = collectProgress.progress;
        } else if (hasFogGoal) {
          objectiveLabel = "Clear Fog";
          objectiveText = `${fogProgress.done}/${Math.max(1, fogProgress.total)}`;
          progress = fogProgress.progress;
        } else if (hasIngredientGoal) {
          objectiveLabel = "Guide Sacred Key & Coin";
          objectiveText = `${ingredientProgress.done}/${Math.max(1, ingredientProgress.total)}`;
          progress = ingredientProgress.progress;
          ingredient = { dropped: ingredientDropped, total: Math.max(1, ingredientProgress.total) };
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
          ingredient,
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

      const isDeadPixiTarget = (target: any) => !target || target.destroyed || target._destroyed || target.parent?._destroyed || target.parent?.destroyed;

      const gsapTo = (target: any, to: Record<string, any>, ms: number, ease = "power3.out") =>
        new Promise<void>((resolve) => {
          if (cancelled || isDeadPixiTarget(target)) {
            resolve();
            return;
          }

          let settled = false;
          let tween: any = null;
          const finish = () => {
            if (settled) return;
            settled = true;
            resolve();
          };

          try {
            tween = gsap.to(target, {
              ...to,
              duration: Math.max(0.001, ms / 1000),
              ease,
              overwrite: "auto",
              onStart: () => {
                if (cancelled || isDeadPixiTarget(target)) {
                  try { tween?.kill?.(); } catch {}
                  finish();
                }
              },
              onUpdate: () => {
                if (cancelled || isDeadPixiTarget(target)) {
                  try { tween?.kill?.(); } catch {}
                  finish();
                }
              },
              onComplete: finish,
              onInterrupt: finish,
            });
          } catch {
            finish();
          }
        });

      const settleFxJobs = async (jobs: Promise<unknown>[], label: string) => {
        if (!jobs.length) return;
        const results = await Promise.allSettled(jobs);
        for (const result of results) {
          if (result.status === "rejected") console.warn(`Rune Rush ${label} recovered`, result.reason);
        }
      };

      const withTimeout = async <T,>(promise: Promise<T>, ms: number, label = "timeout"): Promise<T | null> => {
        let timer: number | null = null;
        try {
          const guarded = promise.catch((err) => {
            console.warn(`Rune Rush ${label}`, err);
            return null;
          });
          return await Promise.race([
            guarded,
            new Promise<null>((resolve) => {
              timer = queueWaitTimer(() => {
                console.warn(`Rune Rush ${label}`);
                resolve(null);
              }, ms);
            }),
          ]);
        } finally {
          if (timer) { window.clearTimeout(timer); waitTimeoutIds.delete(timer); }
        }
      };

      const addTempFilter = (target: any, filter: any, ms = 520) => {
        try {
          if (target && Array.isArray(target.filters) && target.filters.length) target.filters = null;
          filter?.destroy?.();
        } catch {}
      };

      const premiumGlow = (target: any, color = 0xfff1b0, ms = 520, strength = 1.8) => {
        try {
          if (cancelled || isDeadPixiTarget(target)) return;
          let x = Number(target.x);
          let y = Number(target.y);
          try {
            const gp = target.getGlobalPosition?.();
            const lp = gp ? tileGlowLayer.toLocal(gp) : null;
            if (lp) {
              x = lp.x;
              y = lp.y;
            }
          } catch {}
          if (!Number.isFinite(x) || !Number.isFinite(y)) return;

          const glow = new Graphics();
          const radius = tileSize * clamp(0.36 + strength * 0.12, 0.42, 0.76);
          glow.circle(0, 0, radius);
          glow.fill({ color, alpha: clamp(0.10 + strength * 0.035, 0.14, 0.30) });
          glow.circle(0, 0, radius * 0.58);
          glow.fill({ color: 0xffffff, alpha: clamp(0.035 + strength * 0.018, 0.04, 0.12) });
          glow.x = x;
          glow.y = y;
          glow.blendMode = "add" as any;
          glow.eventMode = "none";
          addGlowFx(glow);
          const dur = Math.max(90, Math.min(ms, isBaseMiniApp ? 230 : 320));
          Promise.all([
            addTween(glow.scale, { x: 1.18 + Math.min(0.22, strength * 0.06), y: 1.18 + Math.min(0.22, strength * 0.06) }, dur, easeOutQuart),
            addTween(glow, { alpha: 0 }, dur + 35, easeOutQuart),
          ]).then(() => destroyFxChild(glow));
        } catch {}
      };

      const premiumBloom = (target: any, ms = 560, strength = 0.9) => {
        try {
          if (cancelled || isDeadPixiTarget(target)) return;
          let x = Number(target.x);
          let y = Number(target.y);
          try {
            const gp = target.getGlobalPosition?.();
            const lp = gp ? clearFxLayer.toLocal(gp) : null;
            if (lp) {
              x = lp.x;
              y = lp.y;
            }
          } catch {}
          if (!Number.isFinite(x) || !Number.isFinite(y)) return;

          const bloom = new Graphics();
          const radius = tileSize * clamp(0.52 + strength * 0.30, 0.58, 1.18);
          bloom.circle(0, 0, radius);
          bloom.fill({ color: 0xffffff, alpha: clamp(0.045 + strength * 0.035, 0.06, 0.16) });
          bloom.circle(0, 0, radius * 0.72);
          bloom.stroke({ color: 0xfff1b0, alpha: clamp(0.10 + strength * 0.08, 0.12, 0.28), width: Math.max(1.2, tileSize * 0.018) });
          bloom.x = x;
          bloom.y = y;
          bloom.blendMode = "add" as any;
          bloom.eventMode = "none";
          addClearFx(bloom);
          const dur = Math.max(100, Math.min(ms, isBaseMiniApp ? 250 : 340));
          Promise.all([
            addTween(bloom.scale, { x: 1.24 + Math.min(0.26, strength * 0.12), y: 1.24 + Math.min(0.26, strength * 0.12) }, dur, easeOutQuart),
            addTween(bloom, { alpha: 0 }, dur + 35, easeOutQuart),
          ]).then(() => destroyFxChild(bloom));
        } catch {}
      };

      const premiumMotionBlur = (target: any, dir: "h" | "v", ms = 180) => {
        try {
          if (target && Array.isArray(target.filters) && target.filters.length) target.filters = null;
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

        addParticleFx(wrap);
        return wrap;
      };

      const makeFallbackParticle = (x: number, y: number, size: number, alpha = 0.7, tint = 0xffefb0) => {
        const g = new Graphics();
        g.circle(0, 0, Math.max(1.5, size * 0.16));
        g.fill({ color: tint, alpha });
        g.x = x;
        g.y = y;
        addParticleFx(g);
        premiumGlow(g, tint, 260, 0.95);
        return g;
      };

      const makeKennyPackParticle = (
        x: number,
        y: number,
        size: number,
        alpha = 0.7,
        tint = 0xffefb0,
        preferredPool?: Texture[]
      ) => {
        const pool = preferredPool && preferredPool.length ? preferredPool : luxuryParticleTextures;
        if (!pool.length) return null;
        const tex = pool[Math.floor(Math.random() * pool.length)];
        if (!tex) return null;
        const sp = new Sprite(tex);
        sp.anchor.set(0.5);
        sp.x = x;
        sp.y = y;
        sp.width = size;
        sp.height = size;
        sp.alpha = alpha;
        sp.tint = tint;
        sp.blendMode = "add" as any;
        addParticleFx(sp);
        return sp;
      };

      const spawnTexturedAura = (
        pool: Texture[],
        x: number,
        y: number,
        size: number,
        tint: number,
        alpha: number,
        startScale: number,
        endScale: number,
        ms: number,
        rotationJitter = 0.35
      ) => {
        const aura = makeKennyPackParticle(x, y, size, alpha, tint, pool);
        if (!aura) return;
        aura.scale.set(startScale);
        aura.rotation = (Math.random() - 0.5) * rotationJitter;
        Promise.all([
          gsapTo(aura.scale, { x: endScale, y: endScale }, ms, "power3.out"),
          gsapTo(aura, { alpha: 0, rotation: aura.rotation + rotationJitter * 0.6 }, ms, "power2.out"),
        ]).then(() => destroyFxChild(aura));
      };


      const spawnGuaranteedLotusTargetMarker = (
        x: number,
        y: number,
        color = 0xffd7f4,
        power = 1,
        swapped = false,
        delay = 0
      ) => {
        queueTimer(() => {
          if (cancelled) return;

          // v78 guaranteed-visible Lotus marker:
          // This uses plain Pixi Graphics with normal alpha outlines, not only textures/additive blending.
          // It should show consistently on laptop, phone, and in-app browsers even if optional FX textures fail to load.
          const p = swapped ? power * 1.18 : power;
          const holdMs = swapped ? 115 : 95;
          const burstMs = swapped ? 430 : 370;
          const baseRadius = tileSize * 0.42 * p;
          const strokeBig = Math.max(2.6, tileSize * (swapped ? 0.052 : 0.044));
          const strokeSmall = Math.max(1.6, tileSize * 0.026);

          const halo = new Graphics();
          halo.circle(0, 0, tileSize * 0.25 * p);
          halo.fill({ color, alpha: swapped ? 0.24 : 0.18 });
          halo.x = x;
          halo.y = y;
          halo.scale.set(0.35);
          halo.blendMode = "add" as any;
          addGlowFx(halo);

          const whiteFlash = new Graphics();
          whiteFlash.circle(0, 0, tileSize * 0.18 * p);
          whiteFlash.fill({ color: 0xffffff, alpha: swapped ? 0.28 : 0.20 });
          whiteFlash.x = x;
          whiteFlash.y = y;
          whiteFlash.scale.set(0.22);
          addGlowFx(whiteFlash);

          const ringA = new Graphics();
          ringA.circle(0, 0, baseRadius);
          ringA.stroke({ color, alpha: 0.98, width: strokeBig });
          ringA.x = x;
          ringA.y = y;
          ringA.scale.set(0.40);
          addClearFx(ringA);

          const ringB = new Graphics();
          ringB.circle(0, 0, baseRadius * 0.76);
          ringB.stroke({ color: 0xffffff, alpha: 0.92, width: strokeSmall });
          ringB.x = x;
          ringB.y = y;
          ringB.scale.set(0.30);
          addClearFx(ringB);

          const ringC = new Graphics();
          ringC.circle(0, 0, baseRadius * 1.08);
          ringC.stroke({ color: 0xffffff, alpha: swapped ? 0.40 : 0.30, width: Math.max(1.2, strokeSmall * 0.72) });
          ringC.x = x;
          ringC.y = y;
          ringC.scale.set(0.48);
          addClearFx(ringC);

          const sparkCount = swapped ? 14 : 10;
          for (let i = 0; i < sparkCount; i++) {
            const angle = (Math.PI * 2 * i) / sparkCount;
            const spark = new Graphics();
            spark.roundRect(-tileSize * 0.012, -tileSize * 0.11, tileSize * 0.024, tileSize * 0.22, 999);
            spark.fill({ color: i % 2 ? 0xffffff : color, alpha: i % 2 ? 0.92 : 0.82 });
            spark.x = x + Math.cos(angle) * baseRadius * 0.66;
            spark.y = y + Math.sin(angle) * baseRadius * 0.66;
            spark.rotation = angle;
            spark.scale.set(0.42);
            addParticleFx(spark);
            Promise.all([
              gsapTo(spark.scale, { x: swapped ? 1.24 : 1.02, y: swapped ? 1.24 : 1.02 }, holdMs + 70, "power3.out"),
              gsapTo(spark, { x: x + Math.cos(angle) * baseRadius * 1.18, y: y + Math.sin(angle) * baseRadius * 1.18, alpha: 0 }, burstMs, "power2.out"),
            ]).then(() => destroyFxChild(spark));
          }

          Promise.all([
            gsapTo(halo.scale, { x: swapped ? 3.0 : 2.55, y: swapped ? 3.0 : 2.55 }, burstMs, "power4.out"),
            gsapTo(halo, { alpha: 0 }, burstMs, "power2.out"),
            gsapTo(whiteFlash.scale, { x: swapped ? 2.15 : 1.85, y: swapped ? 2.15 : 1.85 }, holdMs + 95, "power3.out"),
            gsapTo(whiteFlash, { alpha: 0 }, holdMs + 95, "power2.out"),
            gsapTo(ringA.scale, { x: swapped ? 1.68 : 1.42, y: swapped ? 1.68 : 1.42 }, burstMs, "power3.out"),
            gsapTo(ringA, { alpha: 0 }, burstMs, "power2.out"),
            gsapTo(ringB.scale, { x: swapped ? 1.88 : 1.62, y: swapped ? 1.88 : 1.62 }, burstMs + 45, "power4.out"),
            gsapTo(ringB, { alpha: 0 }, burstMs + 45, "power2.out"),
            gsapTo(ringC.scale, { x: swapped ? 1.96 : 1.74, y: swapped ? 1.96 : 1.74 }, burstMs + 70, "power4.out"),
            gsapTo(ringC, { alpha: 0 }, burstMs + 70, "power2.out"),
          ]).then(() => {
            destroyFxChild(halo);
            destroyFxChild(whiteFlash);
            destroyFxChild(ringA);
            destroyFxChild(ringB);
            destroyFxChild(ringC);
          });
        }, delay);
      };


      const spawnGuaranteedShockwave = (
        x: number,
        y: number,
        color = 0xffd7f4,
        power = 1,
        label: "normal" | "goldenLotus" | "lotusLotus" = "normal"
      ) => {
        const rings = label === "lotusLotus" ? 5 : label === "goldenLotus" ? 4 : 3;
        const rayCount = label === "lotusLotus" ? 18 : label === "goldenLotus" ? 14 : 10;
        const maxScale = label === "lotusLotus" ? 5.4 : label === "goldenLotus" ? 4.2 : 3.1;
        const baseAlpha = label === "lotusLotus" ? 0.24 : 0.20;

        const flash = new Graphics();
        flash.circle(0, 0, tileSize * 0.22 * power);
        flash.fill({ color: 0xffffff, alpha: label === "normal" ? 0.18 : 0.34 });
        flash.x = x;
        flash.y = y;
        flash.scale.set(0.28);
        addBeamFx(flash);

        const core = new Graphics();
        core.circle(0, 0, tileSize * 0.34 * power);
        core.fill({ color, alpha: baseAlpha });
        core.x = x;
        core.y = y;
        core.scale.set(0.22);
        core.blendMode = "add" as any;
        addBeamFx(core);

        for (let i = 0; i < rings; i++) {
          queueTimer(() => {
            const ring = new Graphics();
            ring.circle(0, 0, tileSize * (0.38 + i * 0.12) * power);
            ring.stroke({
              color: i % 2 === 0 ? color : 0xffffff,
              alpha: label === "normal" ? 0.72 : 0.92 - i * 0.08,
              width: Math.max(2, tileSize * (label === "lotusLotus" ? 0.045 : 0.038)),
            });
            ring.x = x;
            ring.y = y;
            ring.scale.set(0.16 + i * 0.04);
            ring.blendMode = "add" as any;
            addBeamFx(ring);
            Promise.all([
              gsapTo(ring.scale, { x: maxScale - i * 0.42, y: maxScale - i * 0.42 }, 360 + i * 55, "power4.out"),
              gsapTo(ring, { alpha: 0 }, 390 + i * 55, "power2.out"),
            ]).then(() => destroyFxChild(ring));
          }, i * 38);
        }

        for (let i = 0; i < rayCount; i++) {
          const angle = (Math.PI * 2 * i) / rayCount;
          const ray = new Graphics();
          ray.roundRect(-tileSize * 0.010 * power, -tileSize * 0.52 * power, tileSize * 0.020 * power, tileSize * 0.58 * power, 999);
          ray.fill({ color: i % 2 ? 0xffffff : color, alpha: i % 2 ? 0.30 : 0.42 });
          ray.x = x;
          ray.y = y;
          ray.rotation = angle;
          ray.scale.set(0.12, 0.22);
          ray.blendMode = "add" as any;
          addBeamFx(ray);
          Promise.all([
            gsapTo(ray.scale, { x: 1.1, y: label === "lotusLotus" ? 2.2 : 1.65 }, label === "lotusLotus" ? 420 : 320, "power4.out"),
            gsapTo(ray, { alpha: 0, rotation: angle + 0.18 }, label === "lotusLotus" ? 450 : 340, "power2.out"),
          ]).then(() => destroyFxChild(ray));
        }

        Promise.all([
          gsapTo(flash.scale, { x: label === "lotusLotus" ? 3.2 : 2.35, y: label === "lotusLotus" ? 3.2 : 2.35 }, 180, "power3.out"),
          gsapTo(flash, { alpha: 0 }, 190, "power2.out"),
          gsapTo(core.scale, { x: label === "lotusLotus" ? 7.0 : 5.0, y: label === "lotusLotus" ? 7.0 : 5.0 }, label === "lotusLotus" ? 500 : 380, "power4.out"),
          gsapTo(core, { alpha: 0 }, label === "lotusLotus" ? 500 : 380, "power2.out"),
        ]).then(() => {
          destroyFxChild(flash);
          destroyFxChild(core);
        });
      };

      const spawnCascadeRipple = (wave: number, clearSize: number) => {
        const cx = boardSize / 2;
        const cy = boardSize / 2;
        const color = wave % 2 ? 0xffd7f4 : 0xffdc78;
        const alpha = Math.min(0.18, 0.07 + clearSize * 0.004);
        const ring = new Graphics();
        ring.circle(0, 0, tileSize * (0.45 + wave * 0.08));
        ring.stroke({ color, alpha: 0.55, width: Math.max(1.4, tileSize * 0.018) });
        ring.x = cx;
        ring.y = cy;
        ring.scale.set(0.25);
        ring.blendMode = "add" as any;
        addBeamFx(ring);

        const wash = new Graphics();
        wash.circle(0, 0, tileSize * 0.55);
        wash.fill({ color, alpha });
        wash.x = cx;
        wash.y = cy;
        wash.scale.set(0.15);
        wash.blendMode = "add" as any;
        addBeamFx(wash);

        Promise.all([
          gsapTo(ring.scale, { x: 6.4, y: 6.4 }, 330, "power4.out"),
          gsapTo(ring, { alpha: 0 }, 350, "power2.out"),
          gsapTo(wash.scale, { x: 4.8, y: 4.8 }, 260, "power4.out"),
          gsapTo(wash, { alpha: 0 }, 280, "power2.out"),
        ]).then(() => {
          destroyFxChild(ring);
          destroyFxChild(wash);
        });
      };

      const cellsInRadius = (a: Tile, b: Tile | undefined, radius: number, mode: "diamond" | "square" = "square") => {
        const clear = new Set<number>();
        const origins = [a, ...(b ? [b] : [])];
        for (const t of tiles) {
          if (!canClearTile(t)) continue;
          for (const o of origins) {
            const dist = mode === "diamond" ? Math.abs(t.r - o.r) + Math.abs(t.c - o.c) : Math.max(Math.abs(t.r - o.r), Math.abs(t.c - o.c));
            if (dist <= radius) clear.add(idx(t.r, t.c));
          }
        }
        return clear;
      };

      const spawnLayeredKennyRingBurst = (
        x: number,
        y: number,
        color = 0xffd7f4,
        power = 1,
        delay = 0,
        compact = false
      ) => {
        queueTimer(() => {
          if (cancelled) return;

          // v76 Lotus luxury ring burst:
          // Bigger premium rings + Kenny particle-pack sprites when loaded.
          // Compact mode keeps every target readable without overloading mobile/Base App browsers.
          const qualityScale = compact ? 0.64 : 1;
          const outerRadius = tileSize * (compact ? 0.41 : 0.47) * power;
          const midRadius = tileSize * (compact ? 0.34 : 0.38) * power;
          const innerRadius = tileSize * (compact ? 0.25 : 0.29) * power;
          const ringWidth = Math.max(1.6, tileSize * (compact ? 0.022 : 0.03));

          const glowDisc = new Graphics();
          glowDisc.circle(0, 0, tileSize * 0.19 * power);
          glowDisc.fill({ color, alpha: compact ? 0.18 : 0.26 });
          glowDisc.x = x;
          glowDisc.y = y;
          glowDisc.scale.set(0.34);
          glowDisc.blendMode = "add" as any;
          addGlowFx(glowDisc);

          // Optional curated texture overlays for a smoother, more premium burst.
          spawnTexturedAura(ringMaskTextures, x, y, tileSize * (compact ? 0.82 : 1.06) * power, color, compact ? 0.28 : 0.38, 0.18, compact ? 0.98 : 1.16, compact ? 185 : 230, 0.22);
          spawnTexturedAura(glowMaskTextures, x, y, tileSize * (compact ? 0.96 : 1.28) * power, 0xffffff, compact ? 0.18 : 0.28, 0.16, compact ? 1.08 : 1.34, compact ? 170 : 240, 0.18);
          if (!compact) {
            spawnTexturedAura(magicAccentTextures, x, y, tileSize * 0.72 * power, color, 0.22, 0.14, 1.06, 220, 0.55);
          }

          const outerRing = new Graphics();
          outerRing.circle(0, 0, outerRadius);
          outerRing.stroke({ color, alpha: compact ? 0.58 : 0.82, width: ringWidth });
          outerRing.x = x;
          outerRing.y = y;
          outerRing.scale.set(0.34);
          outerRing.blendMode = "add" as any;
          addClearFx(outerRing);

          const midRing = new Graphics();
          midRing.circle(0, 0, midRadius);
          midRing.stroke({ color: 0xffffff, alpha: compact ? 0.50 : 0.72, width: Math.max(1.2, ringWidth * 0.72) });
          midRing.x = x;
          midRing.y = y;
          midRing.scale.set(0.26);
          midRing.blendMode = "add" as any;
          addClearFx(midRing);

          const innerRing = new Graphics();
          innerRing.circle(0, 0, innerRadius);
          innerRing.stroke({ color, alpha: compact ? 0.42 : 0.62, width: Math.max(1.1, ringWidth * 0.54) });
          innerRing.x = x;
          innerRing.y = y;
          innerRing.scale.set(0.18);
          innerRing.blendMode = "add" as any;
          addClearFx(innerRing);

          if (!compact) {
            const diamond = new Graphics();
            diamond.roundRect(-tileSize * 0.10 * power, -tileSize * 0.10 * power, tileSize * 0.20 * power, tileSize * 0.20 * power, Math.max(3, tileSize * 0.035));
            diamond.fill({ color: 0xffffff, alpha: 0.16 });
            diamond.x = x;
            diamond.y = y;
            diamond.rotation = Math.PI / 4;
            diamond.blendMode = "add" as any;
            addClearFx(diamond);
            Promise.all([
              gsapTo(diamond.scale, { x: 1.9, y: 1.9 }, 180, "power4.out"),
              gsapTo(diamond, { alpha: 0, rotation: diamond.rotation + 0.22 }, 185, "power2.out"),
            ]).then(() => destroyFxChild(diamond));
          }

          const burstCount = Math.max(
            compact ? 5 : 10,
            Math.min(compact ? 9 : 18, fxCount((compact ? 8 : 15) * power * qualityScale))
          );

          for (let i = 0; i < burstCount; i++) {
            const angle = (Math.PI * 2 * i) / burstCount + (Math.random() - 0.5) * 0.18;
            const orbitRadius = outerRadius * (0.78 + Math.random() * 0.26);
            const px = x + Math.cos(angle) * orbitRadius;
            const py = y + Math.sin(angle) * orbitRadius;
            const size = tileSize * (compact ? 0.105 : 0.14) * (0.78 + Math.random() * 0.48) * power;
            const particle =
              makeKennyPackParticle(px, py, size, compact ? 0.70 : 0.88, i % 3 === 0 ? 0xffffff : color, sparkleTextures.length ? sparkleTextures : undefined) ??
              makeProceduralParticle(i % 2 ? "sparkle" : "star", px, py, size, compact ? 0.64 : 0.78, i % 3 === 0 ? 0xffffff : color);
            if (!particle) continue;

            particle.scale.set(compact ? 0.18 : 0.22, compact ? 0.18 : 0.22);
            particle.rotation = angle + Math.random() * Math.PI;
            const drift = tileSize * (compact ? 0.08 : 0.13) * (1 + Math.random() * 0.85) * power;

            Promise.all([
              addTween(
                particle,
                { x: px + Math.cos(angle) * drift, y: py + Math.sin(angle) * drift, alpha: 0 },
                (compact ? 185 : 235) + Math.random() * 65,
                easeOutQuart
              ),
              addTween(
                particle.scale,
                { x: (compact ? 0.68 : 0.94) + Math.random() * 0.42, y: (compact ? 0.68 : 0.94) + Math.random() * 0.42 },
                compact ? 180 : 225,
                easeOutQuart
              ),
            ]).then(() => destroyFxChild(particle));
          }

          const rayCount = compact ? 3 : 6;
          for (let i = 0; i < rayCount; i++) {
            const angle = (Math.PI * 2 * i) / rayCount + Math.random() * 0.16;
            const ray = new Graphics();
            ray.roundRect(-tileSize * 0.007 * power, -tileSize * 0.28 * power, tileSize * 0.014 * power, tileSize * (compact ? 0.32 : 0.42) * power, 999);
            ray.fill({ color: i % 2 ? 0xffffff : color, alpha: compact ? 0.18 : 0.28 });
            ray.x = x;
            ray.y = y;
            ray.rotation = angle;
            ray.scale.set(0.18, 0.32);
            ray.blendMode = "add" as any;
            addBeamFx(ray);

            const trace = makeKennyPackParticle(x, y, tileSize * (compact ? 0.26 : 0.34) * power, compact ? 0.16 : 0.24, i % 2 ? 0xffffff : color, traceTextures.length ? traceTextures : undefined);
            if (trace) {
              trace.rotation = angle;
              trace.scale.set(0.24, 0.38);
              Promise.all([
                gsapTo(trace.scale, { x: compact ? 0.78 : 1.02, y: compact ? 0.98 : 1.22 }, compact ? 150 : 185, "power4.out"),
                gsapTo(trace, { alpha: 0, rotation: angle + 0.15 }, compact ? 165 : 205, "power2.out"),
              ]).then(() => destroyFxChild(trace));
            }

            Promise.all([
              gsapTo(ray.scale, { x: 0.95, y: 1.22 }, compact ? 150 : 185, "power4.out"),
              gsapTo(ray, { alpha: 0, rotation: angle + 0.15 }, compact ? 165 : 205, "power2.out"),
            ]).then(() => destroyFxChild(ray));
          }

          const coreCount = Math.max(
            compact ? 3 : 6,
            Math.min(compact ? 6 : 10, fxCount((compact ? 5 : 8) * power * qualityScale))
          );

          for (let i = 0; i < coreCount; i++) {
            const angle = (Math.PI * 2 * i) / coreCount + Math.random() * 0.2;
            const size = tileSize * (compact ? 0.09 : 0.12) * (0.8 + Math.random() * 0.42) * power;
            const p =
              makeKennyPackParticle(x, y, size, compact ? 0.62 : 0.78, i % 2 ? color : 0xffffff, magicAccentTextures.length ? magicAccentTextures : undefined) ??
              makeProceduralParticle(i % 2 ? "spark" : "star", x, y, size, compact ? 0.58 : 0.72, i % 2 ? color : 0xffffff);
            if (!p) continue;

            p.scale.set(compact ? 0.13 : 0.16, compact ? 0.13 : 0.16);
            p.rotation = angle;
            const dist = tileSize * (compact ? 0.24 : 0.36) * (1 + Math.random() * 0.48) * power;

            Promise.all([
              addTween(p, { x: x + Math.cos(angle) * dist, y: y + Math.sin(angle) * dist, alpha: 0 }, (compact ? 170 : 215) + Math.random() * 55, easeOutQuart),
              addTween(p.scale, { x: (compact ? 0.58 : 0.84) + Math.random() * 0.28, y: (compact ? 0.58 : 0.84) + Math.random() * 0.28 }, compact ? 160 : 200, easeOutQuart),
            ]).then(() => destroyFxChild(p));
          }

          if (!compact) {
            luxuryParticleBurst(["sparkle", "star", "spark", "magic"], x, y, 7, tileSize * 0.30 * power, tileSize * 0.16 * power, color, 230);
            softTwirl("magic", x, y, tileSize * 0.58 * power, color, 260);
          } else if (fxQuality > 0.56) {
            luxuryParticleBurst(["sparkle", "spark"], x, y, 3, tileSize * 0.18 * power, tileSize * 0.10 * power, color, 170);
          }

          Promise.all([
            gsapTo(outerRing.scale, { x: compact ? 1.18 : 1.42, y: compact ? 1.18 : 1.42 }, compact ? 170 : 205, "power3.out"),
            gsapTo(outerRing, { alpha: 0 }, compact ? 185 : 225, "power2.out"),
            gsapTo(midRing.scale, { x: compact ? 1.34 : 1.66, y: compact ? 1.34 : 1.66 }, compact ? 180 : 220, "power4.out"),
            gsapTo(midRing, { alpha: 0 }, compact ? 190 : 225, "power2.out"),
            gsapTo(innerRing.scale, { x: compact ? 1.52 : 1.88, y: compact ? 1.52 : 1.88 }, compact ? 185 : 230, "power4.out"),
            gsapTo(innerRing, { alpha: 0 }, compact ? 190 : 230, "power2.out"),
            gsapTo(glowDisc.scale, { x: compact ? 2.1 : 2.7, y: compact ? 2.1 : 2.7 }, compact ? 210 : 245, "power4.out"),
            gsapTo(glowDisc, { alpha: 0 }, compact ? 215 : 250, "power2.out"),
          ]).then(() => {
            destroyFxChild(outerRing);
            destroyFxChild(midRing);
            destroyFxChild(innerRing);
            destroyFxChild(glowDisc);
          });
        }, delay);
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
        const finalCount = Math.min(isMobileView ? 16 : 28, fxCount(count));
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
          ]).then(() => destroyFxChild(particle));
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
        ]).then(() => destroyFxChild(twirl));
      };

      type ShakeTier = "tiny" | "medium" | "large";
      let activeImpactShake: {
        priority: number;
        until: number;
        timers: number[];
        originals: { target: Container; x: number; y: number }[];
      } | null = null;

      const impactShake = (tier: ShakeTier, color = 0xffd978) => {
        const config = tier === "large"
          ? { priority: 3, amount: Math.min(2.8, Math.max(1.6, tileSize * 0.034)), ms: 220, glow: 0.16 }
          : tier === "medium"
            ? { priority: 2, amount: Math.min(1.9, Math.max(1.0, tileSize * 0.024)), ms: 150, glow: 0.10 }
            : { priority: 1, amount: Math.min(1.05, Math.max(0.42, tileSize * 0.013)), ms: 96, glow: 0.00 };
        const now = Date.now();
        if (activeImpactShake && now < activeImpactShake.until && config.priority <= activeImpactShake.priority) return;

        if (activeImpactShake) {
          for (const id of activeImpactShake.timers) {
            window.clearTimeout(id);
            effectTimeoutIds.delete(id);
          }
          for (const item of activeImpactShake.originals) {
            if (!item.target.destroyed) {
              item.target.x = item.x;
              item.target.y = item.y;
            }
          }
        }

        const targets = [board, tileLayer, ingredientLayer, fogLayer, fxLayer];
        const originals = targets.map((target) => ({ target, x: target.x, y: target.y }));
        const state = {
          priority: config.priority,
          until: now + config.ms + 24,
          timers: [] as number[],
          originals,
        };
        activeImpactShake = state;

        if (config.glow > 0) {
          const glow = new Graphics();
          glow.roundRect(0, 0, boardSize, boardSize, Math.round(tileSize * 0.30));
          glow.fill({ color, alpha: 0 });
          glow.blendMode = "add" as any;
          addGlowFx(glow);
          Promise.all([
            gsapTo(glow, { alpha: config.glow }, Math.min(70, config.ms * 0.45), "power2.out")
              .then(() => gsapTo(glow, { alpha: 0 }, config.ms + 85, "power2.out")),
            gsapTo(glow.scale, { x: tier === "large" ? 1.025 : 1.012, y: tier === "large" ? 1.025 : 1.012 }, config.ms + 110, "power2.out"),
          ]).then(() => destroyFxChild(glow));
        }

        const applyOffset = (x: number, y: number) => {
          for (const item of originals) {
            if (!item.target.destroyed) {
              item.target.x = item.x + x;
              item.target.y = item.y + y;
            }
          }
        };

        const schedule = (ms: number, fn: () => void) => {
          const id = queueTimer(fn, ms);
          if (id != null) state.timers.push(id);
        };

        const steps = [
          { t: 0, x: -1, y: 0.35 },
          { t: 0.28, x: 0.74, y: -0.30 },
          { t: 0.56, x: -0.42, y: 0.16 },
          { t: 0.78, x: 0.20, y: -0.08 },
        ];
        for (const [i, step] of steps.entries()) {
          schedule(Math.round(config.ms * step.t), () => {
            if (activeImpactShake !== state) return;
            const fade = 1 - i / steps.length;
            applyOffset(step.x * config.amount * fade, step.y * config.amount * fade);
          });
        }
        schedule(config.ms, () => {
          if (activeImpactShake !== state) return;
          applyOffset(0, 0);
          activeImpactShake = null;
        });
      };

      const candySparkBurst = (x: number, y: number, tint = 0xffefb0, power = 1) => {
        const count = Math.min(isMobileView ? 10 : 16, fxCount(10 * power));
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
          addParticleFx(shard);
          const dist = tileSize * (0.38 + Math.random() * 0.4) * power;
          Promise.all([
            addTween(shard, { x: x + Math.cos(angle) * dist, y: y + Math.sin(angle) * dist, alpha: 0 }, 210 + Math.random() * 90, easeOutQuart),
            addTween(shard.scale, { x: 1.35, y: 1.35 }, 220, easeOutQuart),
          ]).then(() => destroyFxChild(shard));
        }
      };

      const candyPuffBurst = (x: number, y: number, tint = 0xffefb0, power = 1) => {
        const count = Math.min(isMobileView ? 7 : 11, fxCount(7 * power));
        for (let i = 0; i < count; i++) {
          const angle = (Math.PI * 2 * i) / count + Math.random() * 0.2;
          const puff = new Graphics();
          puff.circle(0, 0, tileSize * (0.035 + Math.random() * 0.025) * power);
          puff.fill({ color: i % 2 ? 0xffffff : tint, alpha: 0.22 });
          puff.x = x;
          puff.y = y;
          addParticleFx(puff);
          const dist = tileSize * (0.22 + Math.random() * 0.22) * power;
          Promise.all([
            addTween(puff, { x: x + Math.cos(angle) * dist, y: y + Math.sin(angle) * dist, alpha: 0 }, 260, easeOutQuart),
            addTween(puff.scale, { x: 2.25, y: 2.25 }, 260, easeOutQuart),
          ]).then(() => destroyFxChild(puff));
        }
      };

      const candyFlashPop = (x: number, y: number, tint = 0xffefb0, power = 1) => {
        const flash = new Graphics();
        flash.circle(x, y, tileSize * 0.16 * power);
        flash.fill({ color: 0xffffff, alpha: 0.24 });
        addGlowFx(flash);
        premiumGlow(flash, tint, Math.round(280 * power), 1.38);
        premiumBloom(flash, Math.round(260 * power), 0.58);

        candySparkBurst(x, y, tint, power);
        candyPuffBurst(x, y, tint, power);

        Promise.all([
          addTween(flash.scale, { x: 2.05, y: 2.05 }, 210, easeOutQuart),
          addTween(flash, { alpha: 0 }, 210, easeOutQuart),
        ]).then(() => destroyFxChild(flash));
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
        addParticleFx(petal);
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
            addParticleFx(petal);

            // Lightweight glow duplicate: tiny additive sprite behind the petal.
            glowPetal = new Sprite(tex);
            glowPetal.anchor.set(0.5);
            glowPetal.width = size * 1.65;
            glowPetal.height = size * 1.65;
            glowPetal.tint = 0xffffff;
            glowPetal.alpha = 0;
            glowPetal.blendMode = "add" as any;
            addParticleFx(glowPetal);
          } else {
            glowPetal = new Graphics();
            glowPetal.circle(0, 0, size * 0.22);
            glowPetal.fill({ color: 0xffffff, alpha: 0.16 });
            glowPetal.x = x;
            glowPetal.y = y;
            glowPetal.alpha = 0;
            glowPetal.blendMode = "add" as any;
            addParticleFx(glowPetal);
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
              destroyFxChild(petal);
              destroyFxChild(glowPetal);
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
        addBeamFx(core);
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
          addParticleFx(shard);
          const dist = tileSize * (0.32 + Math.random() * 0.16) * power;
          Promise.all([
            gsapTo(shard, { x: x + Math.cos(angle) * dist, y: y + Math.sin(angle) * dist, alpha: 0, rotation: shard.rotation + 0.25 }, 250, "power3.out"),
            gsapTo(shard.scale, { x: 0.85, y: 0.85 }, 250, "power3.out"),
          ]).then(() => destroyFxChild(shard));
        }

        Promise.all([
          gsapTo(core.scale, { x: 1.55 * power, y: 1.55 * power }, 180, "power4.out"),
          gsapTo(core, { alpha: 0 }, 180, "power4.out"),
        ]).then(() => destroyFxChild(core));
      };

      const lotusTargetBloom = (x: number, y: number, color = 0xffd7f4, power = 1) => {
        // Tiny target bloom only — no heavy full Lotus bloom per target.
        lotusPetalExplosion(x, y, color, power * 0.34, 0.32, false);

        const glimmer = new Graphics();
        glimmer.circle(x, y, tileSize * 0.048 * power);
        glimmer.fill({ color: 0xffffff, alpha: 0.22 });
        addGlowFx(glimmer);
        Promise.all([
          gsapTo(glimmer.scale, { x: 1.9, y: 1.9 }, 135, "power3.out"),
          gsapTo(glimmer, { alpha: 0 }, 135, "power3.out"),
        ]).then(() => destroyFxChild(glimmer));
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
        addGlowFx(dim);
        await addTween(dim, { alpha }, 120, easeOutQuart);
        await wait(holdMs);
        await addTween(dim, { alpha: 0 }, 150, easeOutQuart);
        destroyFxChild(dim);
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
        addClearFx(burst);

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
          addClearFx(ray);
          Promise.all([
            addTween(ray.scale, { x: 1.35, y: 1.35 }, 210, easeOutQuart),
            addTween(ray, { x: cx + Math.cos(angle) * tileSize * 0.23, y: cy + Math.sin(angle) * tileSize * 0.23, alpha: 0 }, 230, easeOutQuart),
          ]).then(() => destroyFxChild(ray));
        }

        luxuryParticleBurst(["sparkle", "star", "star", "spark"], cx, cy, 8, tileSize * 0.42, tileSize * 0.2, color, 280);

        Promise.all([
          addTween(burst.scale, { x: 1.75, y: 1.75 }, 190, easeOutQuart),
          addTween(burst, { alpha: 0 }, 190, easeOutQuart),
        ]).then(() => destroyFxChild(burst));
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
          Promise.all([addTween(t, { y: y - tileSize * 1.12, alpha: 0 }, 420, easeOutCubic)]).then(() => destroyFxChild(t))
        );
      };

      type ComboWordMode = "clear" | "chain" | "small" | "golden" | "lotus" | "ultimate";
      type ComboWordOptions = {
        x?: number;
        y?: number;
        priority?: number;
        palette?: "gold" | "pink" | "green" | "blue";
      };
      let activeComboWord: { priority: number; until: number; wrap: Container } | null = null;

      const comboWordPriority = (txt: string, mode: ComboWordMode, override?: number) => {
        if (override != null) return override;
        const clean = txt.toLowerCase();
        if (clean.includes("level complete")) return 9;
        if (mode === "ultimate" || clean.includes("divine") || clean.includes("legendary")) return 10;
        if (clean.includes("golden lotus") || clean.includes("ultra")) return 9;
        if (clean.includes("golden rush") || clean.includes("bushido")) return 8;
        if (mode === "lotus" || clean.includes("lotus bloom") || clean === "bloom!") return 7;
        if (mode === "golden" || clean.includes("golden bloom")) return 6;
        if (clean.includes("rune storm") || clean.includes("chain bloom") || clean.includes("runic clear")) return 5;
        if (clean.includes("sacred cascade") || clean.includes("sacred combo")) return 4;
        if (clean.includes("rune rush") || clean.includes("nice")) return 3;
        if (clean.includes("sweet")) return 2;
        return mode === "chain" ? 4 : 3;
      };

      const comboWordPalette = (txt: string, mode: ComboWordMode, palette?: ComboWordOptions["palette"]) => {
        const clean = txt.toLowerCase();
        const chosen =
          palette ??
          (mode === "ultimate" || clean.includes("divine") || clean.includes("lotus") || clean.includes("bloom") ? "pink" :
            mode === "golden" || clean.includes("golden") || clean.includes("bushido") ? "gold" :
              mode === "chain" || clean.includes("cascade") || clean.includes("storm") ? "blue" :
                "green");
        if (chosen === "pink") return { main: 0xffffff, glow: 0xffd7f4, stroke: 0x733466, shadow: 0x160612 };
        if (chosen === "blue") return { main: 0xffffff, glow: 0x8ff6ff, stroke: 0x183d67, shadow: 0x041015 };
        if (chosen === "green") return { main: 0xffffff, glow: 0xb8ff8e, stroke: 0x225f28, shadow: 0x061307 };
        return { main: 0xffffff, glow: 0xffd978, stroke: 0x7f3a08, shadow: 0x180b02 };
      };

      const addBoardBannerText = (txt: string, mode: ComboWordMode = "clear", options: ComboWordOptions = {}) => {
        if (!txt || cancelled) return;
        const priority = comboWordPriority(txt, mode, options.priority);
        const now = Date.now();
        if (activeComboWord && now < activeComboWord.until && priority <= activeComboWord.priority) return;
        if (activeComboWord && !activeComboWord.wrap.destroyed) {
          activeComboWord.wrap.alpha = 0;
          destroyFxChild(activeComboWord.wrap);
        }

        const palette = comboWordPalette(txt, mode, options.palette);
        const isUltimate = mode === "ultimate" || priority >= 10;
        const isBig = isUltimate || priority >= 5 || mode === "golden" || mode === "lotus" || mode === "chain";
        const textLength = txt.length;
        const lengthScale = textLength > 21 ? 0.76 : textLength > 17 ? 0.84 : textLength > 13 ? 0.92 : 1;
        const font = Math.round(tileSize * (isUltimate ? 0.78 : isBig ? 0.58 : 0.42) * lengthScale);
        const strokeWidth = Math.max(4, Math.round(tileSize * (isUltimate ? 0.105 : isBig ? 0.082 : 0.060)));
        const targetX = clamp(options.x ?? boardSize / 2, tileSize * 0.72, boardSize - tileSize * 0.72);
        const defaultY = isUltimate ? boardSize * 0.31 : mode === "lotus" ? boardSize * 0.33 : mode === "small" ? boardSize * 0.42 : boardSize * 0.37;
        const targetY = clamp(options.y ?? defaultY, tileSize * 0.78, boardSize - tileSize * 0.9);
        const floatDistance = tileSize * (isUltimate ? 0.62 : isBig ? 0.48 : 0.34);

        const wrap = new Container();
        wrap.x = targetX;
        wrap.y = targetY;
        wrap.alpha = 0;
        wrap.scale.set(0.6);
        wrap.eventMode = "none";
        textLayer.addChild(wrap);
        activeComboWord = { priority, until: now + 1220, wrap };

        const fontFamily = "Arial Rounded MT Bold, Trebuchet MS, Arial, sans-serif";
        const shadow = new Text({
          text: txt,
          style: {
            fontFamily,
            fontSize: font,
            fill: palette.shadow,
            fontWeight: "900",
            letterSpacing: 0,
            stroke: { color: palette.shadow, width: strokeWidth + 2 },
            dropShadow: { color: 0x000000, alpha: 0.58, blur: 5, distance: 3 },
          } as any,
        });
        shadow.anchor.set(0.5);
        shadow.x = 0;
        shadow.y = Math.max(2, tileSize * 0.045);
        shadow.alpha = 0.82;
        wrap.addChild(shadow);

        const glowText = new Text({
          text: txt,
          style: {
            fontFamily,
            fontSize: font,
            fill: palette.glow,
            fontWeight: "900",
            letterSpacing: 0,
            stroke: { color: palette.stroke, width: strokeWidth + 1 },
          } as any,
        });
        glowText.anchor.set(0.5);
        glowText.alpha = isUltimate ? 0.74 : 0.62;
        wrap.addChild(glowText);

        const main = new Text({
          text: txt,
          style: {
            fontFamily,
            fontSize: font,
            fill: palette.main,
            fontWeight: "900",
            letterSpacing: 0,
            stroke: { color: palette.stroke, width: Math.max(3, strokeWidth * 0.62) },
            dropShadow: { color: 0x000000, alpha: 0.42, blur: 3, distance: 2 },
          } as any,
        });
        main.anchor.set(0.5);
        wrap.addChild(main);

        const shine = new Text({
          text: txt,
          style: {
            fontFamily,
            fontSize: font,
            fill: isUltimate ? 0xfffff2 : 0xfff2bc,
            fontWeight: "900",
            letterSpacing: 0,
            stroke: { color: 0xffffff, width: 1 },
          } as any,
        });
        shine.anchor.set(0.5);
        shine.y = -Math.max(2, tileSize * 0.030);
        shine.alpha = 0.24;
        wrap.addChild(shine);

        const maxWidth = boardSize * (isUltimate ? 0.94 : 0.88);
        if (wrap.width > maxWidth) {
          const fit = maxWidth / wrap.width;
          for (const child of wrap.children) child.scale.set(fit);
        }

        const sparkCount = Math.max(6, Math.min(isUltimate ? 28 : isBig ? 20 : 12, fxCount(isUltimate ? 24 : isBig ? 16 : 9)));
        const sparkleRadiusX = Math.min(boardSize * 0.44, Math.max(tileSize * 1.2, main.width * 0.48));
        const sparkleRadiusY = tileSize * (isUltimate ? 0.58 : isBig ? 0.46 : 0.32);
        for (let i = 0; i < sparkCount; i++) {
          const delay = Math.min(420, i * (isUltimate ? 18 : isBig ? 22 : 28));
          queueTimer(() => {
            if (cancelled || wrap.destroyed) return;
            const angle = Math.random() * Math.PI * 2;
            const sx = Math.cos(angle) * sparkleRadiusX * (0.35 + Math.random() * 0.72);
            const sy = Math.sin(angle) * sparkleRadiusY * (0.35 + Math.random() * 0.80);
            const spark = new Graphics();
            const long = tileSize * (isUltimate ? 0.15 : isBig ? 0.12 : 0.085) * (0.78 + Math.random() * 0.34);
            const thick = Math.max(1, tileSize * 0.012);
            spark.roundRect(-thick / 2, -long / 2, thick, long, 999);
            spark.fill({ color: i % 3 === 0 ? 0xffffff : palette.glow, alpha: 0.84 });
            spark.x = sx;
            spark.y = sy;
            spark.rotation = angle + Math.PI / 2;
            spark.scale.set(0.28);
            spark.blendMode = "add" as any;
            wrap.addChild(spark);
            const drift = tileSize * (0.20 + Math.random() * 0.34);
            Promise.all([
              gsapTo(spark, { x: sx + Math.cos(angle) * drift, y: sy + Math.sin(angle) * drift - tileSize * 0.08, alpha: 0 }, 260, "power3.out"),
              gsapTo(spark.scale, { x: 1.22, y: 1.22 }, 250, "power3.out"),
            ]).then(() => destroyFxChild(spark));
          }, delay);
        }

        try {
          premiumGlow(glowText, palette.glow, isUltimate ? 930 : isBig ? 760 : 540, isUltimate ? 2.05 : isBig ? 1.62 : 1.1);
          premiumBloom(main, isUltimate ? 760 : isBig ? 620 : 420, isUltimate ? 0.88 : isBig ? 0.66 : 0.40);
        } catch {}

        void (async () => {
          await Promise.all([
            gsapTo(wrap, { alpha: 1 }, 86, "power2.out"),
            gsapTo(wrap.scale, { x: 1.15, y: 1.15 }, 120, "back.out(1.7)"),
          ]);
          if (wrap.destroyed) return;
          await gsapTo(wrap.scale, { x: 1, y: 1 }, 130, "power3.out");
          if (wrap.destroyed) return;
          await gsapTo(wrap, { y: targetY - floatDistance }, 650, "sine.out");
          if (wrap.destroyed) return;
          await Promise.all([
            gsapTo(wrap, { alpha: 0, y: targetY - floatDistance - tileSize * 0.15 }, 250, "power2.out"),
            gsapTo(wrap.scale, { x: 0.96, y: 0.96 }, 250, "power2.out"),
          ]);
          if (activeComboWord?.wrap === wrap) activeComboWord = null;
          if (!wrap.destroyed) destroyFxChild(wrap);
        })();
      };

      const showComboFlourish = (chainDepth: number, clearSize: number, focus: number) => {
        if (chainDepth <= 1) return;
        const f = rc(focus);
        const p = xy(f.r, f.c);
        const cx = p.x + tileSize / 2;
        const cy = p.y + tileSize / 2;
        const color = chainDepth >= 4 ? 0xffd978 : chainDepth >= 3 ? 0xffd7f4 : 0xb8ffb1;

        playSfx("chain");
        spawnCascadeRipple(chainDepth, clearSize);
        candySparkBurst(cx, cy, color, chainDepth >= 4 ? 0.72 : chainDepth >= 3 ? 0.48 : 0.28);
        if (chainDepth >= 4) impactShake("medium", color);
        else if (chainDepth >= 3 && clearSize >= 4) impactShake("tiny", color);

        if (chainDepth === 2) {
          addBoardBannerText("Bushido!", "small", {
            x: cx,
            y: Math.max(tileSize * 0.9, cy - tileSize * 0.55),
            priority: 3,
            palette: "gold",
          });
          luxuryParticleBurst(["sparkle", "spark"], cx, cy, 5, tileSize * 0.55, tileSize * 0.14, color, 190);
          return;
        }

        addBoardBannerText(
          chainDepth >= 4 ? (chainDepth % 2 === 0 ? "Chain Bloom!" : "Rune Storm!") : "Sacred Cascade!",
          "chain",
          { priority: chainDepth >= 4 ? 6 : 4, palette: chainDepth >= 4 ? "gold" : "pink" }
        );
        if (chainDepth >= 4) {
          void showBoardDimmer(0.045, 290);
          const streaks = Math.min(7, 3 + chainDepth);
          for (let i = 0; i < streaks; i++) {
            queueTimer(() => {
              if (cancelled) return;
              const y = tileSize * (0.8 + Math.random() * (N - 0.8));
              const startX = -tileSize * (0.8 + Math.random() * 0.6);
              const endX = boardSize + tileSize * 0.8;
              const streak = new Graphics();
              streak.moveTo(-tileSize * 0.34, 0);
              streak.lineTo(tileSize * 0.34, 0);
              streak.stroke({ color: i % 2 ? 0xffffff : color, alpha: 0.48, width: Math.max(1.3, tileSize * 0.018), cap: "round" } as any);
              streak.x = startX;
              streak.y = y;
              streak.rotation = -0.18 + Math.random() * 0.12;
              streak.blendMode = "add" as any;
              addBeamFx(streak);
              Promise.all([
                gsapTo(streak, { x: endX, alpha: 0 }, 300 + Math.random() * 90, "power3.out"),
                gsapTo(streak.scale, { x: 1.8, y: 1.25 }, 300, "power3.out"),
              ]).then(() => destroyFxChild(streak));
            }, i * 32);
          }
        }
      };

      const drawBoardBack = () => {
        const oldBoardChildren = board.removeChildren();
        for (const child of oldBoardChildren) destroyFxChild(child);

        const corner = Math.round(tileSize * 0.38);
        const inset = Math.max(5, Math.round(tileSize * 0.09));
        const innerCorner = Math.round(tileSize * 0.31);
        const frameInset = Math.max(3, Math.round(tileSize * 0.045));

        const slabShadow = new Graphics();
        slabShadow.roundRect(5, 12, boardSize, boardSize, corner + 2);
        slabShadow.fill({ color: 0x000000, alpha: 0.34 });
        board.addChild(slabShadow);

        const slab = new Graphics();
        slab.roundRect(0, 0, boardSize, boardSize, corner);
        slab.fill({ color: 0x2a3031, alpha: 1 });
        board.addChild(slab);

        if (stoneTex) {
          const frameStone = new Sprite(stoneTex);
          frameStone.width = boardSize;
          frameStone.height = boardSize;
          frameStone.alpha = 0.38;
          frameStone.tint = 0xaeb7b2;
          board.addChild(frameStone);
        }

        const outerHighlight = new Graphics();
        outerHighlight.roundRect(1.5, 1.5, boardSize - 3, boardSize - 3, Math.max(16, corner - 2));
        outerHighlight.stroke({ color: 0xf3f7f3, alpha: 0.08, width: Math.max(1.5, Math.round(tileSize * 0.026)) });
        board.addChild(outerHighlight);

        const outerShadow = new Graphics();
        outerShadow.roundRect(frameInset, frameInset, boardSize - frameInset * 2, boardSize - frameInset * 2, Math.max(14, corner - 5));
        outerShadow.stroke({ color: 0x050606, alpha: 0.18, width: Math.max(2, Math.round(tileSize * 0.03)) });
        board.addChild(outerShadow);

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
          boardStone.alpha = 0.98;
          boardStone.tint = 0xcfd6d1;
          boardStone.mask = obsidianMask;
          board.addChild(boardStone);
        }

        const boardLift = new Graphics();
        boardLift.roundRect(inset + 2, inset + 2, boardSize - (inset + 2) * 2, boardSize * 0.17, Math.round(tileSize * 0.22));
        boardLift.fill({ color: 0xf7faf8, alpha: 0.026 });
        boardLift.mask = obsidianMask;
        board.addChild(boardLift);

        const obsidianDepth = new Graphics();
        obsidianDepth.roundRect(inset, inset, boardSize - inset * 2, boardSize - inset * 2, innerCorner);
        obsidianDepth.fill({ color: 0x111515, alpha: 0.09 });
        board.addChild(obsidianDepth);

        const bevelTop = new Graphics();
        bevelTop.roundRect(inset, inset, boardSize - inset * 2, boardSize - inset * 2, innerCorner);
        bevelTop.stroke({ color: 0xffffff, alpha: 0.045, width: Math.max(1, Math.round(tileSize * 0.018)) });
        board.addChild(bevelTop);

        const bevelDark = new Graphics();
        bevelDark.roundRect(inset, inset, boardSize - inset * 2, boardSize - inset * 2, innerCorner);
        bevelDark.stroke({ color: 0x000000, alpha: 0.14, width: Math.max(1, Math.round(tileSize * 0.022)) });
        board.addChild(bevelDark);

        const rightDepth = new Graphics();
        rightDepth.roundRect(boardSize - inset - tileSize * 0.24, inset + tileSize * 0.12, tileSize * 0.18, boardSize - inset * 2 - tileSize * 0.24, Math.round(tileSize * 0.08));
        rightDepth.fill({ color: 0x000000, alpha: 0.08 });
        rightDepth.mask = obsidianMask;
        board.addChild(rightDepth);

        const bottomDepth = new Graphics();
        bottomDepth.roundRect(inset + tileSize * 0.12, boardSize - inset - tileSize * 0.24, boardSize - inset * 2 - tileSize * 0.24, tileSize * 0.18, Math.round(tileSize * 0.08));
        bottomDepth.fill({ color: 0x000000, alpha: 0.07 });
        bottomDepth.mask = obsidianMask;
        board.addChild(bottomDepth);

        const ruinSheen = new Graphics();
        ruinSheen.roundRect(inset + 4, inset + 4, boardSize - (inset + 4) * 2, boardSize * 0.12, Math.round(tileSize * 0.20));
        ruinSheen.fill({ color: 0xffffff, alpha: 0.016 });
        board.addChild(ruinSheen);

        if (hasIngredientGoal) {
          const exitY = boardSize - inset - tileSize * 0.11;
          for (let c = 0; c < N; c++) {
            const { x } = xy(N - 1, c);
            const cx = x + tileSize / 2;

            const glow = new Graphics();
            glow.ellipse(0, 0, tileSize * 0.42, tileSize * 0.150);
            glow.fill({ color: 0xfff4c6, alpha: 0.22 });
            glow.ellipse(0, -tileSize * 0.006, tileSize * 0.27, tileSize * 0.082);
            glow.fill({ color: 0xffffff, alpha: 0.17 });
            glow.ellipse(0, tileSize * 0.004, tileSize * 0.34, tileSize * 0.102);
            glow.stroke({ color: 0xffe29a, alpha: 0.36, width: Math.max(1, tileSize * 0.012) });
            glow.x = cx;
            glow.y = exitY;
            glow.blendMode = "add" as any;
            (glow as any).__goalHolePulse = c * 0.38;
            board.addChild(glow);

            const hole = new Graphics();
            hole.ellipse(cx, exitY + tileSize * 0.012, tileSize * 0.29, tileSize * 0.085);
            hole.fill({ color: 0x010202, alpha: 0.50 });
            hole.ellipse(cx, exitY - tileSize * 0.006, tileSize * 0.21, tileSize * 0.052);
            hole.fill({ color: 0xffffff, alpha: 0.11 });
            board.addChild(hole);

            const beam = new Graphics();
            beam.roundRect(-tileSize * 0.030, -tileSize * 0.36, tileSize * 0.060, tileSize * 0.32, 999);
            beam.fill({ color: 0xfff4c6, alpha: 0.12 });
            beam.x = cx;
            beam.y = exitY;
            beam.blendMode = "add" as any;
            (beam as any).__goalHolePulse = c * 0.38 + 1.2;
            board.addChild(beam);

            for (let i = 0; i < 2; i++) {
              const mote = new Graphics();
              mote.circle(0, 0, Math.max(1.1, tileSize * (0.012 + i * 0.003)));
              mote.fill({ color: i % 2 ? 0xffe29a : 0xffffff, alpha: 0.34 });
              mote.x = cx + (i ? 1 : -1) * tileSize * 0.12;
              mote.y = exitY - tileSize * (0.045 + i * 0.03);
              mote.blendMode = "add" as any;
              (mote as any).__goalHoleParticle = c * 0.51 + i * 1.7;
              (mote as any).__goalHoleBaseX = mote.x;
              (mote as any).__goalHoleBaseY = mote.y;
              board.addChild(mote);
            }
          }
        }
      };

      type DragState = { x: number; y: number; id: number; fired: boolean; kind: "tile" | "ingredient" };
      let dragState: DragState | null = null;

      const resetDragPreview = () => {
        if (!dragState) return;
        if (dragState.kind === "ingredient") {
          const view = ingredientViews.get(dragState.id) as any;
          if (view && !view.destroyed) {
            view.x = Number(view.__ingredientFloatBaseX ?? view.x);
            view.y = Number(view.__ingredientFloatBaseY ?? view.y);
          }
        } else {
          const tv = tileViews.get(dragState.id);
          if (tv?.wrap && !tv.wrap.destroyed) {
            tv.wrap.x = Math.round(tv.baseX);
            tv.wrap.y = Math.round(tv.baseY);
            tv.busy = false;
          }
        }
        dragState = null;
      };

      const tileAt = (r: number, c: number) => tiles.find((z) => z.r === r && z.c === c) ?? null;
      const tileForDrag = (state: DragState | null) => {
        if (!state) return null;
        if (state.kind === "ingredient") {
          const item = ingredients.find((it) => it.id === state.id && !it.dropped);
          return item ? tileAt(item.r, item.c) : null;
        }
        return tiles.find((z) => z.id === state.id) ?? null;
      };

      const targetFromDelta = (state: DragState, dx: number, dy: number) => {
        const curTile = tileForDrag(state);
        if (!curTile) return null;
        let tr = curTile.r;
        let tc = curTile.c;
        if (Math.abs(dx) > Math.abs(dy)) tc += dx > 0 ? 1 : -1;
        else tr += dy > 0 ? 1 : -1;
        tr = clamp(tr, 0, N - 1);
        tc = clamp(tc, 0, N - 1);
        if (fog[idx(tr, tc)]) return null;
        if (state.kind === "ingredient" && hasActiveIngredientAt(tr, tc)) return null;
        return tileAt(tr, tc);
      };

      const handleDragMove = (e: any) => {
        if (phase !== "idle" || !dragState || dragState.fired) return;
        const dx = e.global.x - dragState.x;
        const dy = e.global.y - dragState.y;
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);
        const main = Math.max(adx, ady);
        if (main < 3) return;
        const maxPull = tileSize * 0.32;
        const tv = dragState.kind === "tile" ? tileViews.get(dragState.id) : null;
        const ingredientView = dragState.kind === "ingredient" ? ingredientViews.get(dragState.id) as any : null;
        const baseX = dragState.kind === "ingredient" ? Number(ingredientView?.__ingredientFloatBaseX ?? ingredientView?.x ?? 0) : tv?.baseX ?? 0;
        const baseY = dragState.kind === "ingredient" ? Number(ingredientView?.__ingredientFloatBaseY ?? ingredientView?.y ?? 0) : tv?.baseY ?? 0;
        const view = dragState.kind === "ingredient" ? ingredientView : tv?.wrap;
        if (!view || view.destroyed) { dragState = null; return; }
        if (adx > ady) {
          view.x = baseX + clamp(dx, -maxPull, maxPull);
          view.y = baseY;
        } else {
          view.x = baseX;
          view.y = baseY + clamp(dy, -maxPull, maxPull);
        }
        if (main >= tileSize * 0.34) {
          const target = targetFromDelta(dragState, dx, dy);
          const self = tileForDrag(dragState);
          dragState.fired = true;
          view.x = Math.round(baseX);
          view.y = Math.round(baseY);
          if (tv) tv.busy = false;
          dragState = null;
          if (self && target) attemptSwap(self, target);
        }
      };

      const handleDragEnd = (e: any) => {
        if (!dragState) return;
        const dx = e.global.x - dragState.x;
        const dy = e.global.y - dragState.y;
        const main = Math.max(Math.abs(dx), Math.abs(dy));
        const endingDrag = dragState;
        const target = targetFromDelta(endingDrag, dx, dy);
        const self = tileForDrag(endingDrag);
        resetDragPreview();
        if (phase !== "idle" || !self) return;
        if (main < 9) {
          if (endingDrag.kind === "ingredient") handleTap(self);
          else handleTap(self);
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

      const runeVisualScale = (rune: Rune, special: Special) => {
        const tobyRuneScale = 0.82;
        if (rune === "blue") return tobyRuneScale;
        if (rune === "golden") return tobyRuneScale;
        if (rune === "lotus") return 0.78;
        if (rune === "time") return 0.66;
        if (rune === "moon") return 0.67;
        return special === "none" ? 0.68 : 0.76;
      };

      const createTileView = (t: Tile, start?: { r: number; c: number }, spawned = false) => {
        const { x, y } = xy(t.r, t.c);
        const occupiedByIngredient = hasActiveIngredientAt(t.r, t.c);
        const spawnY = pad - tileSize * (1.08 + t.r * 0.46 + Math.random() * 0.16);
        const startXY = start ? xy(start.r, start.c) : { x, y: spawned ? spawnY : y };
        const wrap = new Container();
        wrap.x = Math.round(startXY.x);
        wrap.y = Math.round(startXY.y);
        wrap.eventMode = fog[idx(t.r, t.c)] || occupiedByIngredient ? "none" : "static";
        wrap.cursor = "pointer";
        // Children are drawn around 0,0, so the container position is already the tile center.
        // Do not set pivot here; it shifts the visual tile half a tile left/up and creates empty board space.
        wrap.x = Math.round(wrap.x + tileSize / 2);
        wrap.y = Math.round(wrap.y + tileSize / 2);
        if (spawned) {
          wrap.alpha = 0.36;
          wrap.scale.set(0.88);
        }
        tileLayer.addChild(wrap);

        const radius = Math.max(12, Math.round(tileSize * 0.25));
        const socketSize = Math.round(tileSize * 0.88);
        const tileHalf = socketSize / 2;

        // v74 matte carved floating obsidian:
        // same stone texture as the board, slightly lighter center, darker carved edges, premium 3D lift.
        const floorShadow = new Graphics();
        floorShadow.roundRect(-tileHalf + tileSize * 0.04, -tileHalf + tileSize * 0.105, socketSize - tileSize * 0.08, socketSize - tileSize * 0.015, radius);
        floorShadow.fill({ color: 0x000000, alpha: 0.33 });
        wrap.addChild(floorShadow);

        const socket = new Graphics();
        socket.roundRect(-tileHalf, -tileHalf, socketSize, socketSize, radius);
        socket.fill({ color: 0x171c1d, alpha: 0.99 });
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
          stone.alpha = 0.78;
          stone.tint = 0xd1d8d3;
          stone.mask = stoneMask;
          wrap.addChild(stone);
        }

        // v80 flat matte gradient:
        // Removes the raised inner lip/edge the screenshot circled.
        // The tile keeps a soft obsidian center and dark outer falloff, but no hard inner outline.
        const matteCenter = new Graphics();
        matteCenter.roundRect(-socketSize * 0.37, -socketSize * 0.37, socketSize * 0.74, socketSize * 0.74, Math.max(9, radius - 7));
        matteCenter.fill({ color: 0xf1f6f2, alpha: 0.052 });
        matteCenter.mask = stoneMask;
        wrap.addChild(matteCenter);

        const centerStone = new Graphics();
        centerStone.roundRect(-socketSize * 0.32, -socketSize * 0.32, socketSize * 0.64, socketSize * 0.64, Math.max(9, radius - 8));
        centerStone.fill({ color: 0xf7fbf8, alpha: 0.026 });
        centerStone.mask = stoneMask;
        wrap.addChild(centerStone);

        const softEdgeShade = new Graphics();
        softEdgeShade.roundRect(-tileHalf + 2, -tileHalf + 2, socketSize - 4, socketSize - 4, Math.max(10, radius - 2));
        softEdgeShade.stroke({ color: 0x000000, alpha: 0.105, width: Math.max(3, Math.round(tileSize * 0.060)) });
        softEdgeShade.mask = stoneMask;
        wrap.addChild(softEdgeShade);

        const bottomDepth = new Graphics();
        bottomDepth.roundRect(-tileHalf + 5, socketSize * 0.11, socketSize - 10, socketSize * 0.22, Math.max(8, radius - 6));
        bottomDepth.fill({ color: 0x000000, alpha: 0.060 });
        bottomDepth.mask = stoneMask;
        wrap.addChild(bottomDepth);

        const outerCarve = new Graphics();
        outerCarve.roundRect(-tileHalf + 1, -tileHalf + 1, socketSize - 2, socketSize - 2, Math.max(10, radius - 1));
        outerCarve.stroke({ color: 0x030404, alpha: 0.30, width: Math.max(1.5, Math.round(tileSize * 0.028)) });
        outerCarve.mask = stoneMask;
        wrap.addChild(outerCarve);

        if (occupiedByIngredient) {
          // Ingredient cells are their own clean item spots now. Hide the normal tile body,
          // floor shadow, and carved socket so the key/coin never looks like it is sitting
          // on top of a rune tile or dark tile shadow.
          floorShadow.visible = false;
          socket.visible = false;
          stoneMask.visible = false;
          if (stone) stone.visible = false;
          matteCenter.visible = false;
          centerStone.visible = false;
          softEdgeShade.visible = false;
          bottomDepth.visible = false;
          outerCarve.visible = false;
        }

        const tex = occupiedByIngredient ? undefined : runeTextures[t.rune];

        let runeSprite: Sprite | undefined;
        let fallback: Text | undefined;
        if (occupiedByIngredient) {
          // The key/coin is drawn by renderIngredients on a clean transparent item layer.
          // No rune, no relic socket, no dark shadow is drawn underneath.
        } else if (tex) {
          const runeClarityBack = new Graphics();
          runeClarityBack.circle(0, 0, tileSize * (t.special === "none" ? 0.285 : 0.33));
          runeClarityBack.fill({ color: 0x050606, alpha: 0.10 });
          runeClarityBack.scale.set(1, 0.92);
          wrap.addChild(runeClarityBack);

          runeSprite = new Sprite(tex);
          runeSprite.anchor.set(0.5);
          const runeScale = runeVisualScale(t.rune, t.special);
          const crispRuneSize = Math.round(tileSize * runeScale);
          runeSprite.width = crispRuneSize;
          runeSprite.height = crispRuneSize;
          runeSprite.alpha = 1;
          runeSprite.tint = 0xffffff;
          runeSprite.blendMode = "normal" as any;
          runeSprite.x = 0;
          runeSprite.y = 0;
          (runeSprite as any).roundPixels = false;

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
          coveredByIngredient: occupiedByIngredient,
        };

        tileViews.set(t.id, tv);

        wrap.on("pointerdown", (e: any) => {
          unlockAudio();
          if (phase !== "idle") return;
          const curTile = tiles.find((z) => z.id === t.id);
          if (!curTile || fog[idx(curTile.r, curTile.c)] || hasActiveIngredientAt(curTile.r, curTile.c)) return;
          dragState = { x: e.global.x, y: e.global.y, id: t.id, fired: false, kind: "tile" };
          lastAction = Date.now();
          const tv = tileViews.get(t.id);
          if (tv) tv.busy = true;
        });
      };

      const renderTiles = (startPositions?: Map<number, { r: number; c: number }>) => {
        const old = tileLayer.removeChildren();
        for (const child of old) destroyFxChild(child);
        tileViews.clear();
        for (const t of tiles) {
          const start = startPositions?.get(t.id);
          const spawned = !!startPositions && !start;
          createTileView(t, start, spawned);
        }
      };

      const renderTilesForRefill = (startPositions: Map<number, { r: number; c: number }>) => {
        const aliveIds = new Set(tiles.map((t) => t.id));
        for (const [id, tv] of Array.from(tileViews.entries())) {
          if (aliveIds.has(id)) continue;
          try { tileLayer.removeChild(tv.wrap); } catch {}
          destroyFxChild(tv.wrap);
          tileViews.delete(id);
        }

        for (const t of tiles) {
          const start = startPositions.get(t.id);
          const spawned = !start;
          const occupiedByIngredient = hasActiveIngredientAt(t.r, t.c);
          const tv = tileViews.get(t.id);

          if (!tv || tv.coveredByIngredient !== occupiedByIngredient) {
            if (tv) {
              try { tileLayer.removeChild(tv.wrap); } catch {}
              destroyFxChild(tv.wrap);
              tileViews.delete(t.id);
            }
            createTileView(t, start, spawned);
            continue;
          }

          const target = xy(t.r, t.c);
          tv.tile = t;
          tv.baseX = Math.round(target.x + tileSize / 2);
          tv.baseY = Math.round(target.y + tileSize / 2);
          tv.busy = false;
          tv.coveredByIngredient = occupiedByIngredient;
          tv.wrap.eventMode = fog[idx(t.r, t.c)] || occupiedByIngredient ? "none" : "static";
          tv.wrap.cursor = "pointer";

          if (start) {
            const source = xy(start.r, start.c);
            tv.wrap.x = Math.round(source.x + tileSize / 2);
            tv.wrap.y = Math.round(source.y + tileSize / 2);
            tv.wrap.alpha = 1;
            tv.wrap.scale.set(1);
          } else {
            tv.wrap.x = tv.baseX;
            tv.wrap.y = Math.round(pad - tileSize * (1.08 + t.r * 0.46 + Math.random() * 0.16) + tileSize / 2);
            tv.wrap.alpha = 0.36;
            tv.wrap.scale.set(0.88);
          }
        }
      };

      const renderIngredients = () => {
        const oldIngredients = ingredientLayer.removeChildren();
        for (const child of oldIngredients) destroyFxChild(child);
        ingredientViews.clear();
        if (!hasIngredientGoal) return;

        const drawFallbackCoin = (wrap: Container) => {
          const coin = new Graphics();
          coin.circle(0, 0, tileSize * 0.255);
          coin.fill({ color: 0xe0a737, alpha: 1 });
          coin.stroke({ color: 0xfff2b6, alpha: 0.98, width: Math.max(2, tileSize * 0.030) });
          wrap.addChild(coin);

          const ring = new Graphics();
          ring.circle(0, 0, tileSize * 0.180);
          ring.stroke({ color: 0xffcf65, alpha: 0.72, width: Math.max(1.2, tileSize * 0.018) });
          wrap.addChild(ring);

          const face = new Graphics();
          face.ellipse(0, tileSize * 0.010, tileSize * 0.088, tileSize * 0.058);
          face.fill({ color: 0x70410e, alpha: 0.22 });
          face.circle(-tileSize * 0.050, -tileSize * 0.012, tileSize * 0.017);
          face.fill({ color: 0x70410e, alpha: 0.24 });
          face.circle(tileSize * 0.050, -tileSize * 0.012, tileSize * 0.017);
          face.fill({ color: 0x70410e, alpha: 0.24 });
          wrap.addChild(face);

          const shine = new Graphics();
          shine.ellipse(-tileSize * 0.085, -tileSize * 0.100, tileSize * 0.052, tileSize * 0.090);
          shine.fill({ color: 0xffffff, alpha: 0.42 });
          shine.rotation = -0.52;
          wrap.addChild(shine);
        };

        const drawFallbackKey = (wrap: Container) => {
          const key = new Graphics();
          const shaftW = Math.max(4, tileSize * 0.066);
          key.circle(-tileSize * 0.130, -tileSize * 0.050, tileSize * 0.135);
          key.stroke({ color: 0xfff1b5, alpha: 0.98, width: shaftW });
          key.circle(-tileSize * 0.130, -tileSize * 0.050, tileSize * 0.056);
          key.stroke({ color: 0x7c4b12, alpha: 0.42, width: Math.max(1.2, tileSize * 0.018) });
          key.roundRect(-tileSize * 0.010, -tileSize * 0.078, tileSize * 0.320, tileSize * 0.066, 999);
          key.fill({ color: 0xdf9f2e, alpha: 1 });
          key.stroke({ color: 0xfff0b7, alpha: 0.90, width: Math.max(1.2, tileSize * 0.018) });
          key.roundRect(tileSize * 0.220, -tileSize * 0.020, tileSize * 0.066, tileSize * 0.120, Math.max(1, tileSize * 0.010));
          key.fill({ color: 0xdf9f2e, alpha: 1 });
          key.roundRect(tileSize * 0.130, -tileSize * 0.016, tileSize * 0.056, tileSize * 0.092, Math.max(1, tileSize * 0.010));
          key.fill({ color: 0xdf9f2e, alpha: 1 });
          key.rotation = -0.22;
          wrap.addChild(key);

          const ribbon = new Graphics();
          ribbon.roundRect(-tileSize * 0.145, -tileSize * 0.250, tileSize * 0.060, tileSize * 0.180, tileSize * 0.018);
          ribbon.fill({ color: 0x46a7ff, alpha: 0.86 });
          ribbon.stroke({ color: 0xdcf4ff, alpha: 0.62, width: Math.max(1, tileSize * 0.012) });
          ribbon.rotation = -0.30;
          wrap.addChild(ribbon);

          const shine = new Graphics();
          shine.roundRect(-tileSize * 0.030, -tileSize * 0.090, tileSize * 0.180, tileSize * 0.014, 999);
          shine.fill({ color: 0xffffff, alpha: 0.44 });
          shine.rotation = -0.22;
          wrap.addChild(shine);
        };

        for (const item of ingredients) {
          if (item.dropped) continue;
          const { x, y } = xy(item.r, item.c);
          const wrap = new Container();
          const baseX = x + tileSize / 2;
          const baseY = y + tileSize / 2;
          const hadFallStart = typeof item.prevR === "number" && typeof item.prevC === "number";
          const startCell = hadFallStart ? xy(item.prevR as number, item.prevC as number) : null;
          const startX = startCell ? startCell.x + tileSize / 2 : baseX;
          const startY = startCell ? startCell.y + tileSize / 2 : baseY;
          wrap.x = startX;
          wrap.y = startY;
          wrap.eventMode = "static";
          wrap.cursor = "pointer";
          (wrap as any).__ingredientId = item.id;
          (wrap as any).__ingredientFloatBaseX = baseX;
          (wrap as any).__ingredientFloatBaseY = baseY;
          (wrap as any).__ingredientFloatPhase = item.id * 1.37 + (item.kind === "coin" ? 0.62 : 0);
          (wrap as any).__ingredientFloatKind = item.kind;
          if (hadFallStart) {
            const travel = Math.max(1, Math.abs(item.r - (item.prevR as number)) || item.fallDistance || 1);
            const landMs = Math.min(260, 122 + travel * 34);
            (wrap as any).__ingredientLandingFromX = startX;
            (wrap as any).__ingredientLandingFromY = startY;
            (wrap as any).__ingredientLandingAge = 0;
            (wrap as any).__ingredientLandingMs = landMs;
            queueTimer(() => {
              if (cancelled) return;
              if (item.kind === "coin") {
                spawnLandingPuff(baseX, baseY, 0xffd978, 0.58);
                lotusTargetGlowPop(baseX, baseY, 0xffd978, 0.42);
                candySparkBurst(baseX, baseY, 0xffd978, 0.10);
              }
            }, Math.max(80, landMs - 26));
          }
          ingredientLayer.addChild(wrap);
          ingredientViews.set(item.id, wrap);

          const hit = new Graphics();
          hit.roundRect(-tileSize * 0.42, -tileSize * 0.42, tileSize * 0.84, tileSize * 0.84, Math.max(10, tileSize * 0.18));
          hit.fill({ color: 0xffffff, alpha: 0 });
          wrap.addChild(hit);

          if (item.kind === "coin") {
            const aura = new Graphics();
            aura.circle(0, 0, tileSize * 0.31);
            aura.fill({ color: 0xffd978, alpha: 0.085 });
            aura.circle(0, 0, tileSize * 0.20);
            aura.fill({ color: 0xffffff, alpha: 0.030 });
            aura.blendMode = "add" as any;
            (aura as any).__ingredientAura = true;
            wrap.addChild(aura);
          }

          const tex = itemTextures[item.kind];
          if (tex) {
            const art = new Sprite(tex);
            art.anchor.set(0.5);
            const size = item.kind === "key" ? tileSize * 0.74 : tileSize * 0.70;
            art.width = size;
            art.height = size;
            wrap.addChild(art);
          } else if (item.kind === "coin") {
            drawFallbackCoin(wrap);
          } else {
            drawFallbackKey(wrap);
          }

          // Tiny coin glint only - not a tile shadow or backing plate.
          if (item.kind === "coin") {
            const glint = new Graphics();
            glint.moveTo(0, -tileSize * 0.32);
            glint.lineTo(0, -tileSize * 0.22);
            glint.moveTo(-tileSize * 0.050, -tileSize * 0.270);
            glint.lineTo(tileSize * 0.050, -tileSize * 0.270);
            glint.stroke({ color: 0xffffff, alpha: 0.36, width: Math.max(1, tileSize * 0.012) });
            glint.blendMode = "add" as any;
            (glint as any).__ingredientGlint = true;
            wrap.addChild(glint);

            const shimmer = new Graphics();
            shimmer.circle(0, 0, tileSize * 0.255);
            shimmer.stroke({ color: 0xfff2b6, alpha: 0.20, width: Math.max(1, tileSize * 0.010), cap: "round" } as any);
            shimmer.blendMode = "add" as any;
            (shimmer as any).__ingredientShimmer = true;
            wrap.addChild(shimmer);
          }

          item.prevR = undefined;
          item.prevC = undefined;
          item.fallDistance = undefined;

          wrap.on("pointerdown", (e: any) => {
            unlockAudio();
            if (phase !== "idle" || item.dropped || fog[idx(item.r, item.c)]) return;
            dragState = { x: e.global.x, y: e.global.y, id: item.id, fired: false, kind: "ingredient" };
            lastAction = Date.now();
          });
        }
      };

      const renderFog = () => {
        const oldFog = fogLayer.removeChildren();
        for (const child of oldFog) destroyFxChild(child);
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
          const shadow = new Graphics();
          shadow.roundRect(-tileSize / 2 + 4, -tileSize / 2 + 7, tileSize - 8, tileSize - 8, fogRadius);
          shadow.fill({ color: 0x000000, alpha: 0.20 });
          wrap.addChild(shadow);

          const shell = new Graphics();
          shell.roundRect(-tileSize / 2 + 3, -tileSize / 2 + 3, tileSize - 6, tileSize - 6, fogRadius);
          shell.fill({ color: 0xdff4ff, alpha: 0.18 });
          shell.roundRect(-tileSize / 2 + 8, -tileSize / 2 + 8, tileSize - 16, tileSize - 16, Math.max(7, fogRadius - 4));
          shell.fill({ color: 0xffffff, alpha: 0.045 });
          wrap.addChild(shell);

          const fogMask = new Graphics();
          fogMask.roundRect(-tileSize / 2 + 3, -tileSize / 2 + 3, tileSize - 6, tileSize - 6, fogRadius);
          fogMask.fill({ color: 0xffffff, alpha: 1 });
          wrap.addChild(fogMask);

          for (let k = 0; k < 5; k++) {
            const puff = new Graphics();
            puff.circle(0, 0, tileSize * (0.20 + k * 0.066));
            puff.fill({ color: k % 2 ? 0xdff5ff : 0xffffff, alpha: 0.27 - k * 0.032 });
            puff.x = (k - 1.5) * tileSize * 0.11;
            puff.y = (k % 2 === 0 ? -1 : 1) * tileSize * 0.075;
            puff.mask = fogMask;
            (puff as any).__fogPhase = i * 0.33 + k * 0.7;
            wrap.addChild(puff);
          }

          const glint = new Graphics();
          glint.moveTo(-tileSize * 0.17, -tileSize * 0.22);
          glint.lineTo(tileSize * 0.12, -tileSize * 0.04);
          glint.moveTo(tileSize * 0.05, -tileSize * 0.24);
          glint.lineTo(tileSize * 0.22, -tileSize * 0.12);
          glint.stroke({ color: 0xffffff, alpha: 0.22, width: Math.max(1, tileSize * 0.012), cap: "round" } as any);
          glint.blendMode = "add" as any;
          (glint as any).__fogPhase = i * 0.41 + 4.2;
          wrap.addChild(glint);
        }
      };


      const normalizeTileGrid = () => {
        const seen = new Set<number>();
        tiles = tiles.filter((t) => {
          if (t.r < 0 || t.r >= N || t.c < 0 || t.c >= N) return false;
          const key = idx(t.r, t.c);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      };

      const repairGrid = () => {
        normalizeTileGrid();
        const occupied = new Set<number>(tiles.map((t) => idx(t.r, t.c)));
        for (let r = 0; r < N; r++) {
          for (let c = 0; c < N; c++) {
            const k = idx(r, c);
            if (!occupied.has(k)) {
              tiles.push(newTile(r, c, randRune()));
              occupied.add(k);
            }
          }
        }
      };

      const renderBoardSafely = (startPositions?: Map<number, { r: number; c: number }>, label = "board render") => {
        try {
          drawBoardBack();
          if (startPositions) renderTilesForRefill(startPositions);
          else renderTiles();
          renderIngredients();
          renderFog();
          hud();
        } catch (err) {
          console.warn(`Rune Rush ${label} recovered`, err);
          try {
            repairGrid();
            drawBoardBack();
            renderTiles();
            renderIngredients();
            renderFog();
            hud();
          } catch (fallbackErr) {
            console.warn("Rune Rush board render fallback skipped", fallbackErr);
          }
        }
      };

      const refillAndRenderBoardSafely = (startPositions?: Map<number, { r: number; c: number }>, label = "board refill") => {
        try {
          normalizeTileGrid();
          dropAndFill();
          repairGrid();
        } catch (err) {
          console.warn(`Rune Rush ${label} recovered`, err);
          repairGrid();
        }
        instantHiddenSpecialIds.clear();
        renderBoardSafely(startPositions, label);
      };

      const recoverRuntimeBoard = (label: string, err?: unknown) => {
        if (cancelled) return;
        console.warn(`Rune Rush ${label}`, err);
        try {
          killAllPixiTweens?.();
          tweens.length = 0;
          clearQueuedTimers();
          instantHiddenSpecialIds.clear();
          spawnedSpecialShieldIds.clear();
          refillAndRenderBoardSafely(undefined, label);
          if (phase === "busy") {
            phase = "idle";
            combo = 0;
            message = "";
            hud();
          }
        } catch (recoveryErr) {
          console.warn("Rune Rush runtime recovery fallback skipped", recoveryErr);
        }
      };

      if (typeof window !== "undefined" && !runtimeCleanup) {
        const isRuneRushRuntimeError = (reason: unknown) => {
          if (phase === "busy") return true;
          const text = reason instanceof Error
            ? `${reason.name} ${reason.message} ${reason.stack ?? ""}`
            : String(reason ?? "");
          return /Rune Rush|pixi|gsap|destroy|destroyed|DisplayObject|Container|Sprite|Graphics|Texture|Cannot read properties|Cannot set properties|alpha|scale|x|y/i.test(text);
        };

        const onUnhandledRejection = (event: PromiseRejectionEvent) => {
          if (!isRuneRushRuntimeError(event.reason)) return;
          event.preventDefault();
          event.stopImmediatePropagation?.();
          recoverRuntimeBoard("async animation recovery", event.reason);
        };

        const onRuntimeError = (event: ErrorEvent) => {
          const reason = event.error ?? event.message;
          if (!isRuneRushRuntimeError(reason)) return;
          event.preventDefault();
          event.stopImmediatePropagation?.();
          recoverRuntimeBoard("runtime recovery", reason);
        };

        window.addEventListener("unhandledrejection", onUnhandledRejection, true);
        window.addEventListener("error", onRuntimeError, true);
        runtimeCleanup = () => {
          window.removeEventListener("unhandledrejection", onUnhandledRejection, true);
          window.removeEventListener("error", onRuntimeError, true);
          runtimeCleanup = null;
        };
      }

      const refresh = () => {
        repairGrid();
        renderBoardSafely(undefined, "refresh");
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
            const dur = Math.max(48, Math.min(ms + dist * 0.075, ms + 58));
            jobs.push(gsapTo(tv.wrap, { x: tv.baseX, y: tv.baseY }, dur, ease === easeInOut ? "power2.inOut" : "back.out(1.04)"));
          } else {
            tv.wrap.x = tv.baseX;
            tv.wrap.y = tv.baseY;
          }
        }
        await settleFxJobs(jobs, "tile movement");
      };

      const spawnLandingPuff = (x: number, y: number, color = 0xffefb0, strength = 1) => {
        const count = Math.max(2, Math.min(5, fxCount(3 * strength)));
        for (let i = 0; i < count; i++) {
          const puff = new Graphics();
          const angle = Math.PI + (Math.random() - 0.5) * Math.PI * 0.82;
          const size = tileSize * (0.026 + Math.random() * 0.026) * strength;
          puff.circle(0, 0, size);
          puff.fill({ color: i % 2 ? color : 0xffffff, alpha: i % 2 ? 0.34 : 0.24 });
          puff.x = x + (Math.random() - 0.5) * tileSize * 0.24;
          puff.y = y + tileSize * 0.25 + Math.random() * tileSize * 0.05;
          puff.blendMode = "add" as any;
          addParticleFx(puff);
          const dist = tileSize * (0.12 + Math.random() * 0.18) * strength;
          Promise.all([
            addTween(puff, { x: puff.x + Math.cos(angle) * dist, y: puff.y + Math.sin(angle) * dist, alpha: 0 }, 210, easeOutQuart),
            addTween(puff.scale, { x: 1.55, y: 1.55 }, 210, easeOutQuart),
          ]).then(() => destroyFxChild(puff));
        }
      };

      const settleBoardAfterRefill = async (beforeFall: Map<number, { r: number; c: number }>, chainDepth: number) => {
        const jobs: Promise<void>[] = [];
        const newTileColor = chainDepth >= 4 ? 0xffd978 : chainDepth >= 3 ? 0xffd7f4 : chainDepth >= 2 ? 0xb8ffb1 : 0xffefb0;

        for (const t of tiles) {
          const tv = tileViews.get(t.id);
          if (!tv) continue;
          const start = beforeFall.get(t.id);
          const target = xy(t.r, t.c);
          tv.baseX = target.x + tileSize / 2;
          tv.baseY = target.y + tileSize / 2;

          if (start) {
            const movedRows = Math.max(0, t.r - start.r);
            const dist = Math.abs(tv.wrap.x - tv.baseX) + Math.abs(tv.wrap.y - tv.baseY);
            if (dist < 1) {
              tv.wrap.x = tv.baseX;
              tv.wrap.y = tv.baseY;
              tv.wrap.alpha = 1;
              tv.wrap.scale.set(1);
              continue;
            }

            const delay = Math.min(12, movedRows * 2 + t.c * 0.45);
            const fallMs = Math.min(SURVIVOR_FALL_MS + 28, SURVIVOR_FALL_MS + movedRows * 7);
            jobs.push((async () => {
              await wait(delay);
              tv.busy = true;
              tv.wrap.alpha = 1;
              const overshoot = Math.min(tileSize * 0.075, Math.max(tileSize * 0.026, movedRows * tileSize * 0.012));
              await Promise.all([
                gsapTo(tv.wrap, { x: tv.baseX, y: tv.baseY + overshoot }, fallMs, "power2.in"),
                gsapTo(tv.wrap.scale, { x: 0.985, y: 1.035 }, fallMs, "power2.in"),
              ]);
              spawnLandingPuff(tv.baseX, tv.baseY, 0xb8ffb1, chainDepth >= 3 ? 0.92 : 0.72);
              await Promise.all([
                gsapTo(tv.wrap, { y: tv.baseY }, SURVIVOR_BOUNCE_MS, "back.out(1.45)"),
                gsapTo(tv.wrap.scale, { x: 1.026, y: 0.974 }, 28, "power2.out")
                  .then(() => gsapTo(tv.wrap.scale, { x: 1, y: 1 }, Math.max(28, SURVIVOR_BOUNCE_MS - 8), "power3.out")),
              ]);
              tv.wrap.x = tv.baseX;
              tv.wrap.y = tv.baseY;
              tv.wrap.scale.set(1);
              tv.busy = false;
            })());
          } else {
            const delay = NEW_TILE_DROP_DELAY_MS + Math.min(18, t.r * 2.8 + t.c * 0.45);
            const travelRows = Math.max(1, Math.ceil((tv.baseY - tv.wrap.y) / Math.max(1, tileSize + gap)));
            const dropMs = Math.min(NEW_TILE_DROP_MS + 24, NEW_TILE_DROP_MS + travelRows * 5);
            jobs.push((async () => {
              await wait(delay);
              tv.busy = true;
              tv.wrap.alpha = 0.44;
              tv.wrap.scale.set(0.88);
              if (chainDepth >= 3) candyFlashPop(tv.baseX, Math.max(tileSize * 0.32, tv.wrap.y), newTileColor, 0.14);
              const overshoot = tileSize * 0.060;
              await Promise.all([
                gsapTo(tv.wrap, { x: tv.baseX, y: tv.baseY + overshoot, alpha: 1 }, dropMs, "power2.in"),
                gsapTo(tv.wrap.scale, { x: 1.025, y: 1.055 }, dropMs, "power2.in"),
              ]);
              spawnLandingPuff(tv.baseX, tv.baseY, newTileColor, chainDepth >= 3 ? 0.92 : 0.62);
              if (chainDepth >= 2) candySparkBurst(tv.baseX, tv.baseY, newTileColor, chainDepth >= 4 ? 0.32 : 0.18);
              await Promise.all([
                gsapTo(tv.wrap, { y: tv.baseY }, NEW_TILE_SETTLE_MS, "back.out(1.55)"),
                gsapTo(tv.wrap.scale, { x: 1, y: 1 }, NEW_TILE_SETTLE_MS, "power3.out"),
              ]);
              tv.wrap.x = tv.baseX;
              tv.wrap.y = tv.baseY;
              tv.wrap.alpha = 1;
              tv.wrap.scale.set(1);
              tv.busy = false;
            })());
          }
        }

        await settleFxJobs(jobs, "cascade settle");
        await wait(BOARD_CHECK_PAUSE_MS);
      };

      const playSmallPop = async (cellIds: number[]) => {
        const isTimedRunicClear = cellIds.length >= 7;
        if (!isTimedRunicClear && cellIds.length >= 3) playSfx("clear");

        const spawnSoftClearDetails = (x: number, y: number, power = 1) => {
          const color = 0xfff0b8;
          const sparkCount = Math.max(3, Math.min(7, fxCount(4 * power)));
          for (let i = 0; i < sparkCount; i++) {
            const spark = new Graphics();
            const size = tileSize * (0.015 + Math.random() * 0.018) * power;
            spark.circle(0, 0, size);
            spark.fill({ color: i % 3 === 0 ? 0xffffff : color, alpha: 0.58 });
            spark.x = x;
            spark.y = y;
            spark.blendMode = "add" as any;
            addParticleFx(spark);
            const angle = Math.random() * Math.PI * 2;
            const dist = tileSize * (0.16 + Math.random() * 0.25) * power;
            Promise.all([
              addTween(spark, { x: x + Math.cos(angle) * dist, y: y + Math.sin(angle) * dist, alpha: 0 }, 185, easeOutQuart),
              addTween(spark.scale, { x: 1.8, y: 1.8 }, 185, easeOutQuart),
            ]).then(() => destroyFxChild(spark));
          }

          for (let i = 0; i < 2; i++) {
            const crack = new Graphics();
            const angle = Math.random() * Math.PI * 2;
            const len = tileSize * (0.14 + Math.random() * 0.08) * power;
            crack.moveTo(-len * 0.35, 0);
            crack.lineTo(len * 0.35, 0);
            crack.stroke({ color: i % 2 ? 0xffffff : color, alpha: 0.34, width: Math.max(1, tileSize * 0.010), cap: "round" } as any);
            crack.x = x + Math.cos(angle) * tileSize * 0.08;
            crack.y = y + Math.sin(angle) * tileSize * 0.08;
            crack.rotation = angle + (Math.random() - 0.5) * 0.75;
            crack.blendMode = "add" as any;
            addClearFx(crack);
            Promise.all([
              addTween(crack.scale, { x: 1.35, y: 1.35 }, 170, easeOutQuart),
              addTween(crack, { alpha: 0 }, 180, easeOutQuart),
            ]).then(() => destroyFxChild(crack));
          }
        };

        const ordered = cellIds
          .map((id) => ({ id, tv: tileViews.get(id) }))
          .filter((item): item is { id: number; tv: TileView } => !!item.tv)
          .sort((a, b) => {
            const center = boardSize / 2;
            const da = Math.abs(a.tv.baseX - center) + Math.abs(a.tv.baseY - center);
            const db = Math.abs(b.tv.baseX - center) + Math.abs(b.tv.baseY - center);
            return da - db;
          });

        const jobs: Promise<void>[] = [];
        ordered.forEach(({ id, tv }, i) => {
          jobs.push((async () => {
            await wait(isTimedRunicClear ? Math.min(56, i * 4) : Math.min(22, i * 6));
            if (instantHiddenSpecialIds.has(id)) {
              tv.busy = false;
              tv.wrap.alpha = 0;
              return;
            }

            tv.busy = true;
            tv.wrap.alpha = 1;
            const cx = tv.baseX;
            const cy = tv.baseY;

            premiumGlow(tv.wrap, 0xfff0b8, isTimedRunicClear ? 250 : 300, isTimedRunicClear ? 0.72 : 0.94);

            const halo = new Graphics();
            halo.circle(0, 0, tileSize * (isTimedRunicClear ? 0.22 : 0.26));
            halo.stroke({ color: 0xfff0b8, alpha: isTimedRunicClear ? 0.30 : 0.46, width: Math.max(1.2, tileSize * 0.014) });
            halo.x = cx;
            halo.y = cy;
            halo.scale.set(0.72);
            halo.blendMode = "add" as any;
            addClearFx(halo);
            Promise.all([
              addTween(halo.scale, { x: 1.28, y: 1.28 }, isTimedRunicClear ? 155 : 130, easeOutQuart),
              addTween(halo, { alpha: 0 }, isTimedRunicClear ? 165 : 145, easeOutQuart),
            ]).then(() => destroyFxChild(halo));

            if (isTimedRunicClear && i % 2 === 0) {
              const tick = new Graphics();
              tick.circle(cx, cy, tileSize * 0.16);
              tick.stroke({ color: 0xfff0b8, alpha: 0.34, width: Math.max(1, tileSize * 0.012) });
              tick.blendMode = "add" as any;
              addClearFx(tick);
              Promise.all([
                addTween(tick.scale, { x: 1.38, y: 1.38 }, 150, easeOutQuart),
                addTween(tick, { alpha: 0 }, 155, easeOutQuart),
              ]).then(() => destroyFxChild(tick));
            }

            if (!isTimedRunicClear) {
              await wait(18);
              const wiggle = (i % 2 ? -1 : 1) * tileSize * 0.018;
              await Promise.all([
                gsapTo(tv.wrap, { x: cx + wiggle, y: cy - tileSize * 0.008 }, 20, "power2.out")
                  .then(() => gsapTo(tv.wrap, { x: cx - wiggle * 0.45, y: cy + tileSize * 0.004 }, 18, "power2.inOut"))
                  .then(() => gsapTo(tv.wrap, { x: cx, y: cy }, 18, "power2.out")),
                gsapTo(tv.wrap.scale, { x: 1.08, y: 1.08 }, 32, "back.out(1.45)")
                  .then(() => gsapTo(tv.wrap.scale, { x: 1.025, y: 1.025 }, 20, "power3.out")),
              ]);
              spawnSoftClearDetails(cx, cy, 0.92);
              candyFlashPop(cx, cy, 0xfff0b8, 0.34);
            } else {
              candyFlashPop(cx, cy, 0xfff0b8, 0.36);
            }

            const popInMs = isTimedRunicClear ? Math.round(POP_MS * 0.36) : 26;
            const popOutMs = isTimedRunicClear ? Math.round(POP_MS * 0.50) : 58;
            await Promise.all([
              addTween(tv.wrap.scale, { x: isTimedRunicClear ? 1.14 : 1.16, y: isTimedRunicClear ? 1.14 : 1.16 }, popInMs, easeSoftBack),
              addTween(tv.wrap, { alpha: 1 }, popInMs, easeOutQuart),
            ]);
            await Promise.all([
              addTween(tv.wrap.scale, { x: isTimedRunicClear ? 0.50 : 0.46, y: isTimedRunicClear ? 0.50 : 0.46 }, popOutMs, easeOutQuart),
              addTween(tv.wrap, { alpha: 0 }, popOutMs, easeOutQuart),
            ]);
            tv.wrap.alpha = 0;
            tv.busy = false;
          })());
        });
        await settleFxJobs(jobs, "clear pops");
      };

      const applySpecialArtToTile = (tile: Tile, spawn: SpecialSpawn) => {
        tile.rune = spawn.rune;
        tile.special = spawn.special;
        tile.goldenDir = spawn.special === "golden" ? spawn.goldenDir ?? tile.goldenDir ?? "h" : undefined;

        const tv = tileViews.get(tile.id);
        if (!tv) return;
        const tex = runeTextures[spawn.rune];
        if (tv.rune && tex) {
          tv.rune.texture = tex;
          const size = Math.round(tileSize * runeVisualScale(spawn.rune, spawn.special));
          tv.rune.width = size;
          tv.rune.height = size;
          tv.rune.alpha = 1;
          tv.rune.tint = 0xffffff;
        }
        if (tv.fallback) tv.fallback.text = FALLBACK[spawn.rune];
      };

      const playEnergyTrailToSpecial = (fromX: number, fromY: number, toX: number, toY: number, color: number, delay = 0) => {
        queueTimer(() => {
          if (cancelled) return;
          const line = new Graphics();
          line.moveTo(fromX, fromY);
          line.lineTo(toX, toY);
          line.stroke({ color, alpha: 0.24, width: Math.max(1.2, tileSize * 0.014), cap: "round" } as any);
          line.blendMode = "add" as any;
          addBeamFx(line);

          const mote = new Graphics();
          mote.circle(0, 0, tileSize * 0.045);
          mote.fill({ color: 0xffffff, alpha: 0.72 });
          mote.circle(0, 0, tileSize * 0.085);
          mote.fill({ color, alpha: 0.22 });
          mote.x = fromX;
          mote.y = fromY;
          mote.blendMode = "add" as any;
          addParticleFx(mote);

          Promise.all([
            gsapTo(mote, { x: toX, y: toY, alpha: 0.92 }, 185, "power3.in"),
            gsapTo(mote.scale, { x: 0.72, y: 0.72 }, 185, "power2.in"),
            gsapTo(line, { alpha: 0 }, 210, "power2.out"),
          ]).then(() => {
            destroyFxChild(line);
            destroyFxChild(mote);
          });
        }, delay);
      };

      const playSpecialCreationSequence = async (spawns: SpecialSpawn[], sourceCells: Set<number>) => {
        if (!spawns.length) return;

        await Promise.all(spawns.map(async (spawn, spawnIndex) => {
          try {
          const isGoldenSpawn = spawn.special === "golden";
          const isLotusSpawn = spawn.special === "lotus";
          const spawnDelay = isGoldenSpawn ? 46 : isLotusSpawn ? 56 : 82;
          await wait(spawnIndex * spawnDelay);
          const loc = rc(spawn.k);
          const target = tiles.find((t) => t.r === loc.r && t.c === loc.c);
          if (!canClearTile(target)) return;
          const targetView = tileViews.get(target.id);
          const p = xy(target.r, target.c);
          const tx = p.x + tileSize / 2;
          const ty = p.y + tileSize / 2;
          const color = spawn.special === "lotus" ? 0xffd7f4 : 0xffd978;
          const sources = tiles
            .filter((t) => sourceCells.has(idx(t.r, t.c)) && canClearTile(t))
            .sort((a, b) => {
              const da = Math.abs(a.r - target.r) + Math.abs(a.c - target.c);
              const db = Math.abs(b.r - target.r) + Math.abs(b.c - target.c);
              return da - db;
            });

          for (const source of sources) {
            const tv = tileViews.get(source.id);
            if (!tv) continue;
            premiumGlow(tv.wrap, color, isGoldenSpawn ? 230 : isLotusSpawn ? 275 : 360, source.id === target.id ? 1.25 : 0.88);
            const sp = xy(source.r, source.c);
            const sx = sp.x + tileSize / 2;
            const sy = sp.y + tileSize / 2;
            const halo = new Graphics();
            halo.circle(0, 0, tileSize * (source.id === target.id ? 0.30 : 0.22));
            halo.stroke({ color: source.id === target.id ? 0xffffff : color, alpha: source.id === target.id ? 0.50 : 0.30, width: Math.max(1.1, tileSize * 0.012) });
            halo.x = sx;
            halo.y = sy;
            halo.scale.set(0.64);
            halo.blendMode = "add" as any;
            addClearFx(halo);
            Promise.all([
              gsapTo(halo.scale, { x: 1.30, y: 1.30 }, isGoldenSpawn ? 92 : isLotusSpawn ? 105 : 150, "power3.out"),
              gsapTo(halo, { alpha: 0 }, isGoldenSpawn ? 108 : isLotusSpawn ? 125 : 170, "power2.out"),
            ]).then(() => destroyFxChild(halo));
          }

          await wait(isGoldenSpawn ? 72 : isLotusSpawn ? 86 : 150);

          const trailSources = sources.filter((t) => t.id !== target.id).slice(0, 10);
          trailSources.forEach((source, i) => {
            const sp = xy(source.r, source.c);
            playEnergyTrailToSpecial(sp.x + tileSize / 2, sp.y + tileSize / 2, tx, ty, color, Math.min(isGoldenSpawn ? 60 : isLotusSpawn ? 74 : 110, i * (isGoldenSpawn ? 9 : isLotusSpawn ? 11 : 16)));
          });

          await wait(isGoldenSpawn ? 118 : isLotusSpawn ? 136 : 205);

          const flash = new Graphics();
          flash.circle(0, 0, tileSize * 0.30);
          flash.fill({ color: 0xffffff, alpha: 0.40 });
          flash.circle(0, 0, tileSize * 0.48);
          flash.fill({ color, alpha: 0.18 });
          flash.x = tx;
          flash.y = ty;
          flash.scale.set(0.38);
          flash.blendMode = "add" as any;
          addGlowFx(flash);

          if (targetView) {
            await Promise.all([
              gsapTo(targetView.wrap.scale, { x: isGoldenSpawn ? 1.14 : isLotusSpawn ? 1.16 : 1.18, y: isGoldenSpawn ? 1.14 : isLotusSpawn ? 1.16 : 1.18 }, isGoldenSpawn ? 62 : isLotusSpawn ? 74 : 100, "back.out(1.55)"),
              gsapTo(flash.scale, { x: 1.45, y: 1.45 }, isGoldenSpawn ? 82 : isLotusSpawn ? 94 : 120, "power4.out"),
              gsapTo(flash, { alpha: 0.86 }, isGoldenSpawn ? 54 : isLotusSpawn ? 64 : 90, "power2.out"),
            ]);
          } else {
            await wait(isGoldenSpawn ? 66 : isLotusSpawn ? 78 : 110);
          }

          applySpecialArtToTile(target, spawn);
          spawnedSpecialShieldIds.add(target.id);
          playSpecialSpawnSfx(spawn.special, !!spawn.conversion);

          if (targetView) {
            await Promise.all([
              gsapTo(targetView.wrap.scale, { x: 0.94, y: 0.94 }, isGoldenSpawn ? 42 : isLotusSpawn ? 50 : 70, "power2.out")
                .then(() => gsapTo(targetView.wrap.scale, { x: isGoldenSpawn ? 1.11 : isLotusSpawn ? 1.10 : 1.08, y: isGoldenSpawn ? 1.11 : isLotusSpawn ? 1.10 : 1.08 }, isGoldenSpawn ? 70 : isLotusSpawn ? 84 : 110, "back.out(1.75)"))
                .then(() => gsapTo(targetView.wrap.scale, { x: 1, y: 1 }, isGoldenSpawn ? 58 : isLotusSpawn ? 70 : 95, "power3.out")),
              gsapTo(flash.scale, { x: isGoldenSpawn ? 2.05 : isLotusSpawn ? 2.14 : 2.28, y: isGoldenSpawn ? 2.05 : isLotusSpawn ? 2.14 : 2.28 }, isGoldenSpawn ? 150 : isLotusSpawn ? 175 : 245, "power3.out"),
              gsapTo(flash, { alpha: 0 }, isGoldenSpawn ? 158 : isLotusSpawn ? 185 : 250, "power2.out"),
            ]);
          } else {
            await wait(isGoldenSpawn ? 158 : isLotusSpawn ? 185 : 250);
          }

          destroyFxChild(flash);
          playSpawnRing(target.r, target.c, spawn.special);
          if (spawn.special === "golden" || spawn.special === "lotus") {
            addBoardBannerText(
              spawn.special === "lotus" ? "Lotus Bloom!" : spawn.conversion ? "Rune Rush!" : "Nice!",
              spawn.special === "lotus" ? "lotus" : "small",
              {
                x: spawn.special === "lotus" ? boardSize / 2 : tx,
                y: spawn.special === "lotus" ? boardSize * 0.33 : Math.max(tileSize * 0.9, ty - tileSize * 0.55),
                priority: spawn.special === "lotus" ? 7 : 3,
                palette: spawn.special === "lotus" ? "pink" : "gold",
              }
            );
            impactShake("tiny", spawn.special === "golden" ? 0xffd978 : 0xffd7f4);
          }
          } catch (err) {
            console.warn("Rune Rush special creation animation skipped", err);
          }
        }));
      };

      const showFogBreakFx = (cell: number) => {
        const { r, c } = rc(cell);
        const p = xy(r, c);
        const cx = p.x + tileSize / 2;
        const cy = p.y + tileSize / 2;
        const ice = 0xdff5ff;
        lotusTargetGlowPop(cx, cy, ice, 0.56);
        spawnGuaranteedShockwave(cx, cy, ice, 0.36, "normal");
        luxuryParticleBurst(["sparkle", "spark", "magic"], cx, cy, 5, tileSize * 0.30, tileSize * 0.08, ice, 210);
        const mist = new Graphics();
        mist.circle(cx, cy, tileSize * 0.20);
        mist.fill({ color: 0xffffff, alpha: 0.16 });
        mist.blendMode = "add" as any;
        addParticleFx(mist);
        Promise.all([
          gsapTo(mist.scale, { x: 2.0, y: 1.45 }, 240, "power3.out"),
          gsapTo(mist, { alpha: 0 }, 250, "power2.out"),
        ]).then(() => destroyFxChild(mist));
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
              showFogBreakFx(a);
              fog[a] = null;
              add.add(a);
            }
          }
        }
        for (const k of Array.from(clearSet)) {
          if (fog[k]) {
            showFogBreakFx(k);
            fog[k] = null;
            add.add(k);
          }
        }
        const after = fog.filter(Boolean).length;
        if (after < before) fogClearedThisMove = true;
        for (const a of add) clearSet.add(a);
      };

      const collectCleared = (clearSet: Set<number>) => {
        if (!hasCollectGoal) return;
        for (const t of tiles) {
          if (!clearSet.has(idx(t.r, t.c))) continue;
          if (collectRemaining[t.color] != null && (collectRemaining[t.color] ?? 0) > 0) {
            collectRemaining[t.color] = Math.max(0, (collectRemaining[t.color] ?? 0) - 1);
          }
        }
      };

      const ingredientGoalPoint = (c: number) => {
        const inset = Math.max(5, Math.round(tileSize * 0.09));
        const p = xy(N - 1, c);
        return {
          x: p.x + tileSize / 2,
          y: boardSize - inset - tileSize * 0.11,
        };
      };

      const drawCollectionFallback = (wrap: Container, kind: IngredientKind) => {
        if (kind === "coin") {
          const coin = new Graphics();
          coin.circle(0, 0, tileSize * 0.255);
          coin.fill({ color: 0xe0a737, alpha: 1 });
          coin.stroke({ color: 0xfff2b6, alpha: 0.95, width: Math.max(2, tileSize * 0.030) });
          coin.circle(0, 0, tileSize * 0.172);
          coin.stroke({ color: 0xffcf65, alpha: 0.70, width: Math.max(1.2, tileSize * 0.018) });
          wrap.addChild(coin);
          return;
        }

        const key = new Graphics();
        const shaftW = Math.max(4, tileSize * 0.066);
        key.circle(-tileSize * 0.130, -tileSize * 0.050, tileSize * 0.135);
        key.stroke({ color: 0xfff1b5, alpha: 0.98, width: shaftW });
        key.roundRect(-tileSize * 0.010, -tileSize * 0.078, tileSize * 0.320, tileSize * 0.066, 999);
        key.fill({ color: 0xdf9f2e, alpha: 1 });
        key.stroke({ color: 0xfff0b7, alpha: 0.90, width: Math.max(1.2, tileSize * 0.018) });
        key.roundRect(tileSize * 0.210, -tileSize * 0.020, tileSize * 0.072, tileSize * 0.128, Math.max(1, tileSize * 0.010));
        key.fill({ color: 0xdf9f2e, alpha: 1 });
        key.rotation = -0.22;
        wrap.addChild(key);
      };

      const addCollectionIngredientArt = (wrap: Container, kind: IngredientKind) => {
        const tex = itemTextures[kind];
        if (tex) {
          const art = new Sprite(tex);
          art.anchor.set(0.5);
          const size = kind === "key" ? tileSize * 0.74 : tileSize * 0.70;
          art.width = size;
          art.height = size;
          wrap.addChild(art);
          return;
        }
        drawCollectionFallback(wrap, kind);
      };

      const playIngredientCollectionFx = async (kind: IngredientKind, fromR: number, c: number) => {
        const start = xy(Math.min(N - 1, Math.max(0, fromR)), c);
        const sx = start.x + tileSize / 2;
        const sy = start.y + tileSize / 2;
        const exit = ingredientGoalPoint(c);
        const color = kind === "key" ? 0x7de8ff : 0xffd978;
        const accent = kind === "key" ? 0xd9fbff : 0xfff2b6;

        const portal = new Graphics();
        portal.ellipse(0, 0, tileSize * 0.39, tileSize * 0.125);
        portal.fill({ color, alpha: 0.20 });
        portal.ellipse(0, 0, tileSize * 0.25, tileSize * 0.070);
        portal.fill({ color: 0xffffff, alpha: 0.12 });
        portal.stroke({ color: accent, alpha: 0.44, width: Math.max(1, tileSize * 0.014) });
        portal.x = exit.x;
        portal.y = exit.y;
        portal.alpha = 0;
        portal.scale.set(0.72);
        portal.blendMode = "add" as any;
        addBeamFx(portal);

        const glow = new Graphics();
        glow.ellipse(0, 0, tileSize * 0.46, tileSize * 0.17);
        glow.fill({ color, alpha: 0.16 });
        glow.x = exit.x;
        glow.y = exit.y;
        glow.alpha = 0;
        glow.scale.set(0.70);
        glow.blendMode = "add" as any;
        addGlowFx(glow);

        const wrap = new Container();
        wrap.x = sx;
        wrap.y = sy;
        wrap.eventMode = "none";
        wrap.blendMode = "normal" as any;
        addParticleFx(wrap);

        const aura = new Graphics();
        aura.circle(0, 0, tileSize * 0.34);
        aura.fill({ color, alpha: 0.12 });
        aura.blendMode = "add" as any;
        wrap.addChild(aura);
        addCollectionIngredientArt(wrap, kind);

        luxuryParticleBurst(["sparkle", "spark", "magic"], sx, sy, 4, tileSize * 0.22, tileSize * 0.10, color, 140);

        await Promise.all([
          gsapTo(portal, { alpha: 1 }, 150, "power2.out"),
          gsapTo(portal.scale, { x: 1.12, y: 1.12 }, 150, "power3.out"),
          gsapTo(glow, { alpha: 1 }, 150, "power2.out"),
          gsapTo(glow.scale, { x: 1.08, y: 1.08 }, 150, "power3.out"),
        ]);

        await Promise.all([
          gsapTo(wrap, { x: exit.x, y: exit.y + tileSize * 0.12, rotation: kind === "key" ? -0.12 : 0.18 }, 300, "power2.inOut"),
          gsapTo(wrap.scale, { x: 0.64, y: 0.64 }, 300, "power2.inOut"),
          gsapTo(aura.scale, { x: 1.25, y: 1.25 }, 300, "power2.out"),
        ]);

        playSfx("special");
        addScorePopup(exit.x, exit.y - tileSize * 0.36, kind === "key" ? "+key" : "+coin", "special");
        spawnGuaranteedShockwave(exit.x, exit.y, color, 0.76, "normal");
        lotusTargetGlowPop(exit.x, exit.y, color, 0.68);
        candySparkBurst(exit.x, exit.y, color, 0.42);
        luxuryParticleBurst(["sparkle", "star", "spark", "magic"], exit.x, exit.y, 8, tileSize * 0.45, tileSize * 0.14, color, 240);

        await Promise.all([
          gsapTo(wrap, { y: exit.y + tileSize * 0.34, alpha: 0 }, 250, "power2.in"),
          gsapTo(wrap.scale, { x: 0.34, y: 0.34 }, 250, "power2.in"),
          gsapTo(portal, { alpha: 0 }, 250, "power2.out"),
          gsapTo(portal.scale, { x: 1.46, y: 1.32 }, 250, "power3.out"),
          gsapTo(glow, { alpha: 0 }, 260, "power2.out"),
          gsapTo(glow.scale, { x: 1.46, y: 1.25 }, 260, "power3.out"),
        ]);

        destroyFxChild(wrap);
        destroyFxChild(portal);
        destroyFxChild(glow);
      };

      const queueIngredientCollection = (item: Ingredient, fromR: number) => {
        if (item.dropped) return null;
        const kind = item.kind;
        const startR = Math.min(N - 1, Math.max(0, fromR));
        const column = item.c;
        item.dropped = true;
        item.prevR = undefined;
        item.prevC = undefined;
        item.fallDistance = undefined;

        return (async () => {
          await playIngredientCollectionFx(kind, startR, column);
          if (cancelled) return;
          ingredientDropped = Math.min(level.ingredientTarget, ingredientDropped + 1);
          score += 150;
          message = kind === "key" ? "Sacred key collected" : "Golden coin collected";
          hud();
        })();
      };

      const applyIngredientFall = (clearSet: Set<number>) => {
        const collectionJobs: Promise<void>[] = [];
        if (!hasIngredientGoal || !ingredients.length) return collectionJobs;
        let changed = false;
        for (const item of ingredients) {
          if (item.dropped) continue;
          let holesBelow = 0;
          for (let rr = item.r + 1; rr < N; rr++) {
            if (clearSet.has(idx(rr, item.c))) holesBelow += 1;
          }

          if (holesBelow <= 0) {
            if (item.r >= N - 1) {
              const job = queueIngredientCollection(item, item.r);
              if (job) collectionJobs.push(job);
              changed = true;
            }
            continue;
          }

          const oldR = item.r;
          item.r = Math.min(N - 1, item.r + holesBelow);
          changed = true;

          if (item.r >= N - 1) {
            const job = queueIngredientCollection(item, oldR);
            if (job) collectionJobs.push(job);
          } else {
            item.prevR = oldR;
            item.prevC = item.c;
            item.fallDistance = holesBelow;
          }
        }
        if (changed) hud();
        return collectionJobs;
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

      const randRefillRune = (grid: (Tile | null)[], r: number, c: number) => {
        // v89 cascade feel:
        // Do NOT block accidental refill matches. Only the starting board avoids auto-matches.
        // Refill gets a very small neighbor bias so falls feel alive without becoming chaotic.
        const neighbors: Rune[] = [];
        const add = (rr: number, cc: number, weight = 1) => {
          if (rr < 0 || rr >= N || cc < 0 || cc >= N) return;
          const color = grid[idx(rr, cc)]?.color;
          if (!color || !PALETTE.includes(color)) return;
          for (let i = 0; i < weight; i++) neighbors.push(color);
        };

        // The new tile is filled from bottom-to-top, so below and side neighbors already exist.
        add(r + 1, c, 3);
        add(r + 2, c, 1);
        add(r, c - 1, 2);
        add(r, c + 1, 2);

        if (neighbors.length && Math.random() < 0.18) {
          return neighbors[Math.floor(Math.random() * neighbors.length)];
        }

        return randRune();
      };

      const dropAndFill = () => {
        // Stable Candy-Crush-style gravity: build a fresh grid column by column.
        // v89: refill intentionally allows accidental matches so cascades can continue naturally.
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
              const color = randRefillRune(nextGrid, r, c);
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
          if (!canClearTile(t)) continue;
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

      const goldenLineCells = (origin: Tile, dir: "h" | "v") => {
        const cells: number[] = [];
        if (dir === "h") for (let c = 0; c < N; c++) cells.push(idx(origin.r, c));
        else for (let r = 0; r < N; r++) cells.push(idx(r, origin.c));
        return cells;
      };

      const addGoldenCells = (clearSet: Set<number>, origin: Tile, dir?: "h" | "v") => {
        const chosen = dir ?? origin.goldenDir ?? (origin.id % 2 === 0 ? "h" : "v");
        for (const k of goldenLineCells(origin, chosen)) {
          const cell = rc(k);
          if (!canClearCell(cell.r, cell.c)) continue;
          clearSet.add(k);
        }
        return chosen;
      };

      const addLotusCells = (clearSet: Set<number>, origin: Tile, color?: Rune) => {
        const chosen = color ?? mostCommonColor(clearSet);
        for (const t of tiles) {
          // Lotus clears the whole board of the color/rune it was swapped with.
          // Same-color specials are included so they activate in the chain queue.
          if (!canClearTile(t)) continue;
          if (t.color === chosen) clearSet.add(idx(t.r, t.c));
        }
        if (canClearCell(origin.r, origin.c)) clearSet.add(idx(origin.r, origin.c));
        return chosen;
      };

      const addBombCells = (clearSet: Set<number>, origin: Tile, radius = 1) => {
        for (let rr = Math.max(0, origin.r - radius); rr <= Math.min(N - 1, origin.r + radius); rr++) {
          for (let cc = Math.max(0, origin.c - radius); cc <= Math.min(N - 1, origin.c + radius); cc++) {
            if (!canClearCell(rr, cc)) continue;
            clearSet.add(idx(rr, cc));
          }
        }
      };

      const playBombBurst = async (origin: Tile) => {
        const p = xy(origin.r, origin.c);
        const cx = p.x + tileSize / 2;
        const cy = p.y + tileSize / 2;

        const glow = new Graphics();
        glow.circle(cx, cy, tileSize * 0.34);
        glow.fill({ color: 0xffc872, alpha: 0.2 });
        addGlowFx(glow);

        candyFlashPop(cx, cy, 0xffc06a, 1.25);
        const blast = new Graphics();
        blast.circle(cx, cy, tileSize * 0.24);
        blast.fill({ color: 0xffd08a, alpha: 0.18 });
        addBeamFx(blast);

        luxuryParticleBurst(["smoke", "smoke", "spark", "smoke"], cx, cy, 12, tileSize * 1.02, tileSize * 0.34, 0xffc06a, 340);

        for (let i = 0; i < 8; i++) {
          const chip = new Graphics();
          chip.circle(0, 0, Math.max(1.5, tileSize * 0.025));
          chip.fill({ color: i % 2 ? 0xffffff : 0xffbc62, alpha: 0.72 });
          chip.x = cx;
          chip.y = cy;
          chip.rotation = (Math.PI * 2 * i) / 8;
          addParticleFx(chip);
          const dist = tileSize * 0.82;
          Promise.all([
            addTween(chip, { x: cx + Math.cos(chip.rotation) * dist, y: cy + Math.sin(chip.rotation) * dist, alpha: 0 }, 230, easeOutCubic),
            addTween(chip.scale, { x: 1.8, y: 1.8 }, 230, easeOutCubic),
          ]).then(() => destroyFxChild(chip));
        }

        await Promise.all([
          addTween(glow.scale, { x: 2.15, y: 2.15 }, 260, easeOutCubic),
          addTween(glow, { alpha: 0 }, 260, easeOutCubic),
          addTween(blast.scale, { x: 2.35, y: 2.35 }, 300, easeOutQuart),
          addTween(blast, { alpha: 0 }, 300, easeOutQuart),
        ]);
        destroyFxChild(glow);
        destroyFxChild(blast);
      };

      const playBomb = async (origin: Tile) => {
        playSfx("bomb");
        const clear = new Set<number>();
        addBombCells(clear, origin, 1);
        await playBombBurst(origin);
        await clearCells(clear, idx(origin.r, origin.c), BONUS_GOLDEN, undefined, "none", new Set([origin.id]));
      };

      const playTriggeredSpecialCue = async (sp: Tile, specialType: Special) => {
        const p = xy(sp.r, sp.c);
        const cx = p.x + tileSize / 2;
        const cy = p.y + tileSize / 2;
        const color = specialType === "lotus" ? 0xffd7f4 : specialType === "golden" ? 0xffd978 : 0xffb76d;
        const tv = tileViews.get(sp.id);

        const ring = new Graphics();
        ring.circle(0, 0, tileSize * 0.30);
        ring.stroke({ color, alpha: 0.82, width: Math.max(1.6, tileSize * 0.026) });
        ring.x = cx;
        ring.y = cy;
        ring.scale.set(0.46);
        ring.blendMode = "add" as any;
        addClearFx(ring);

        const spark = new Graphics();
        spark.circle(0, 0, tileSize * 0.15);
        spark.fill({ color: 0xffffff, alpha: 0.22 });
        spark.x = cx;
        spark.y = cy;
        spark.blendMode = "add" as any;
        addParticleFx(spark);

        candyFlashPop(cx, cy, color, specialType === "lotus" ? 0.72 : 0.58);
        luxuryParticleBurst(["spark", "sparkle", "star"], cx, cy, specialType === "lotus" ? 5 : 4, tileSize * 0.26, tileSize * 0.085, color, 150);
        if (tv) {
          tv.busy = true;
          tv.wrap.alpha = 1;
          premiumGlow(tv.wrap, color, 240, specialType === "lotus" ? 1.15 : 0.92);
        }

        await Promise.all([
          gsapTo(ring.scale, { x: 1.28, y: 1.28 }, 128, "power3.out"),
          gsapTo(ring, { alpha: 0 }, 150, "power2.out"),
          gsapTo(spark.scale, { x: 1.9, y: 1.9 }, 118, "power3.out"),
          gsapTo(spark, { alpha: 0 }, 132, "power2.out"),
          tv
            ? gsapTo(tv.wrap.scale, { x: 1.12, y: 1.12 }, 56, "back.out(1.55)")
              .then(() => gsapTo(tv.wrap.scale, { x: 0.96, y: 0.96 }, 48, "power2.out"))
              .then(() => gsapTo(tv.wrap.scale, { x: 1, y: 1 }, 42, "power3.out"))
            : wait(110),
        ]);

        destroyFxChild(ring);
        destroyFxChild(spark);
        if (tv) {
          tv.wrap.scale.set(1);
          tv.busy = false;
        }
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

      const playChainLotusBurst = async (origin: Tile, color: Rune) => {
        const p = xy(origin.r, origin.c);
        const cx = p.x + tileSize / 2;
        const cy = p.y + tileSize / 2;
        const lotusPink = 0xffd7f4;
        const mainColor = RUNE_GLOW[color] ?? lotusPink;
        lotusLuxuryGlowBurst(cx, cy, lotusPink, 0.78, 0.82);
        spawnGuaranteedShockwave(cx, cy, lotusPink, 0.58, "normal");
        candyFlashPop(cx, cy, lotusPink, 0.76);
        const targets = tiles
          .filter((t) => t.color === color && canClearTile(t))
          .sort((a, b) => {
            const da = Math.abs(a.r - origin.r) + Math.abs(a.c - origin.c);
            const db = Math.abs(b.r - origin.r) + Math.abs(b.c - origin.c);
            return da - db;
          })
          .slice(0, isBaseMiniApp ? 8 : 12);

        targets.forEach((t, i) => {
          const q = xy(t.r, t.c);
          const tx = q.x + tileSize / 2;
          const ty = q.y + tileSize / 2;
          queueTimer(() => {
            if (cancelled) return;
            lotusTargetGlowPop(tx, ty, mainColor, 0.52);
            if (i % 2 === 0) lotusSparkleTargetRing(tx, ty, mainColor, 0);
          }, Math.min(140, i * 12));
        });

        await wait(260);
      };

      const runRunicClearChain = async (clearSet: Set<number>, focus: number, activatedIds = new Set<number>()) => {
        // Runic Clear chain reaction queue:
        // Specials hit by any clear get a quick cue, activate with a controlled stagger,
        // then remain in clearSet so the later tile-removal pass deletes them.
        let guard = 0;
        let didChain = false;
        let chainActivationCount = 0;
        let chainTinyShakeDone = false;
        let chainMediumShakeDone = false;
        const chainStartedAt = Date.now();

        while (guard++ < 8 && Date.now() - chainStartedAt < 980) {
          const origin = rc(focus);
          const specials = tiles
            .filter((t) => clearSet.has(idx(t.r, t.c)) && canClearTile(t) && t.special !== "none" && !activatedIds.has(t.id))
            .sort((a, b) => {
              const da = Math.abs(a.r - origin.r) + Math.abs(a.c - origin.c);
              const db = Math.abs(b.r - origin.r) + Math.abs(b.c - origin.c);
              return da - db;
            })
            .slice(0, isBaseMiniApp ? 4 : 6);
          if (!specials.length) break;

          if (!didChain) {
            didChain = true;
            playSfx("chain");
            addBoardBannerText(CHAIN_PHRASES[Math.floor(Math.random() * CHAIN_PHRASES.length)], "chain");
          }

          const fxJobs: Promise<void>[] = [];
          if (!chainMediumShakeDone && specials.length >= 3) {
            impactShake("medium", 0xffd978);
            chainMediumShakeDone = true;
          }

          for (const [i, sp] of specials.entries()) {
            if (activatedIds.has(sp.id)) continue;
            if (Date.now() - chainStartedAt > 860) break;
            if (i > 0) await wait(i % 3 === 0 ? SPECIAL_CHAIN_GROUP_GAP_MS : SPECIAL_CHAIN_STAGGER_MS);
            activatedIds.add(sp.id);
            clearSet.add(idx(sp.r, sp.c));

            const specialType = sp.special;
            const specialColor = sp.color;
            const specialRune = sp.rune;
            const specialGoldenDir = sp.goldenDir;

            try {
              await withTimeout(playTriggeredSpecialCue(sp, specialType), 300, "triggered special cue timeout");
              hideActivatedSpecialImmediately(sp);
              chainActivationCount += 1;
              if (!chainMediumShakeDone && chainActivationCount >= 4) {
                impactShake("medium", 0xffd978);
                chainMediumShakeDone = true;
              } else if (!chainTinyShakeDone && chainActivationCount >= 3) {
                impactShake("tiny", 0xffd7f4);
                chainTinyShakeDone = true;
              }

              // Remove the special state immediately so it cannot remain visually/logic-wise
              // after being hit. We still use specialType above to run its power.
              sp.special = "none";
              sp.rune = sp.color;
              sp.goldenDir = undefined;

              // Do not play generic special sound here.
              // Each activated special plays its own sound so Golden always uses zap.
              if (specialType === "bomb") {
                playSfx("bomb");
                addBombCells(clearSet, sp, 1);
                fxJobs.push(withTimeout(playBombBurst(sp), 430, "bomb chain animation timeout").then(() => undefined));
              } else if (specialType === "golden") {
                playSfx("golden");
                const dir = addGoldenCells(clearSet, sp, specialGoldenDir);
                fxJobs.push(withTimeout(playGoldenFlash(sp, dir), 390, "golden chain animation timeout").then(() => undefined));
              } else if (specialType === "lotus") {
                playSfx("lotus");
                const color = addLotusCells(clearSet, { ...sp, rune: specialRune, color: specialColor, special: "lotus" }, specialColor);
                fxJobs.push(withTimeout(playChainLotusBurst(sp, color), 420, "lotus chain burst timeout").then(() => undefined));
              }
            } catch (err) {
              console.warn("Rune Rush triggered special recovered", err);
            }
          }

          // Let staggered powers finish before the next triggered wave is inspected.
          await settleFxJobs(fxJobs, "special chain effects");
          await wait(SPECIAL_CHAIN_GAP_MS);
        }
      };

      const pickRunicClearGoldenSpawn = (clearSet: Set<number>, focus: number): { k: number; special: Special; rune: Rune; goldenDir?: GoldenDir } | null => {
        const focusCell = clearSet.has(focus) ? focus : null;
        const candidates = [
          ...(focusCell != null ? [focusCell] : []),
          ...Array.from(clearSet),
        ];
        for (const k of candidates) {
          const { r, c } = rc(k);
          if (fog[k]) continue;
          if (!canClearCell(r, c)) continue;
          const t = tiles.find((z) => z.r === r && z.c === c);
          if (!t) continue;
          if (t.special !== "none") continue;
          return { k, special: "golden", rune: "golden", goldenDir: t.r % 2 === 0 ? "h" : "v" };
        }
        return null;
      };

      const filterValidClearSetAfterSpawnShield = (clearSet: Set<number>) => {
        // If a freshly-created special is sitting inside a normal match, do not clear/activate it yet.
        // Also do not accidentally clear only the two leftover tiles from that broken match.
        const grid = toGrid(tiles);
        const isAllowed = (r: number, c: number) => {
          if (r < 0 || r >= N || c < 0 || c >= N) return false;
          const k = idx(r, c);
          const t = grid[k];
          if (!t || !clearSet.has(k)) return false;
          return !(spawnedSpecialShieldIds.has(t.id) && t.special !== "none");
        };

        const keep = new Set<number>();

        for (let r = 0; r < N; r++) {
          let c = 0;
          while (c < N) {
            if (!isAllowed(r, c)) {
              c++;
              continue;
            }
            const start = c;
            const color = grid[idx(r, c)]?.color;
            while (c < N && isAllowed(r, c) && grid[idx(r, c)]?.color === color) c++;
            if (c - start >= 3) {
              for (let cc = start; cc < c; cc++) keep.add(idx(r, cc));
            }
          }
        }

        for (let c = 0; c < N; c++) {
          let r = 0;
          while (r < N) {
            if (!isAllowed(r, c)) {
              r++;
              continue;
            }
            const start = r;
            const color = grid[idx(r, c)]?.color;
            while (r < N && isAllowed(r, c) && grid[idx(r, c)]?.color === color) r++;
            if (r - start >= 3) {
              for (let rr = start; rr < r; rr++) keep.add(idx(rr, c));
            }
          }
        }

        return keep;
      };

      const playClearImpactPause = async (clearSet: Set<number>, focus: number, premium = false) => {
        if (!clearSet.size) return;
        const f = rc(focus);
        const p = xy(f.r, f.c);
        const cx = p.x + tileSize / 2;
        const cy = p.y + tileSize / 2;
        const color = premium ? 0xffe29a : 0xcfffe4;
        const pauseMs = premium ? SPECIAL_IMPACT_PAUSE_MS : CLEAR_IMPACT_PAUSE_MS;

        const pulse = new Graphics();
        pulse.circle(0, 0, tileSize * (premium ? 0.31 : 0.22));
        pulse.stroke({ color, alpha: premium ? 0.78 : 0.48, width: Math.max(1.5, tileSize * (premium ? 0.032 : 0.020)) });
        pulse.x = cx;
        pulse.y = cy;
        pulse.scale.set(0.54);
        pulse.blendMode = "add" as any;
        addClearFx(pulse);

        Promise.all([
          gsapTo(pulse.scale, { x: premium ? 1.72 : 1.34, y: premium ? 1.72 : 1.34 }, pauseMs + 92, "power4.out"),
          gsapTo(pulse, { alpha: 0 }, pauseMs + 100, "power2.out"),
        ]).then(() => destroyFxChild(pulse));

        if (premium) {
          spawnGuaranteedShockwave(cx, cy, color, 0.58, "normal");
        }

        const sample = Array.from(clearSet).slice(0, premium ? 9 : 5);
        sample.forEach((k, i) => {
          const q = rc(k);
          const pos = xy(q.r, q.c);
          queueTimer(() => {
            if (cancelled) return;
            lotusTargetGlowPop(pos.x + tileSize / 2, pos.y + tileSize / 2, color, premium ? 0.36 : 0.22);
          }, i * 6);
        });

        await wait(pauseMs);
      };

      const clearCells = async (
        clearSet: Set<number>,
        focus: number,
        bonus = 0,
        spawn?: SpecialSpawn,
        sfxKey: SfxKey | "none" = "match",
        activatedIds = new Set<number>()
      ) => {
        if (!clearSet.size) return false;

        // v90 spawn shield bug pass:
        // A newly created special should not instantly activate just because gravity/refill
        // leaves it inside a normal cascade match. It should still activate if a special power
        // actually clears/hits it, which uses sfxKey === "none".
        // Also, if removing the shielded special breaks a 3-match into only 1-2 tiles,
        // those leftover tiles must NOT clear. That was the main subtle cascade bug.
        if (sfxKey !== "none" && spawnedSpecialShieldIds.size) {
          const filtered = filterValidClearSetAfterSpawnShield(clearSet);
          clearSet.clear();
          for (const k of filtered) clearSet.add(k);
          if (!clearSet.size) return false;
        }
        protectIngredientCellsFromClear(clearSet);
        if (!clearSet.size) return false;

        const naturalRunicClear = sfxKey !== "none" && clearSet.size >= 7;
        const spawnsToCreate: SpecialSpawn[] = [];
        if (spawn) spawnsToCreate.push({ ...spawn, conversion: false });
        if (naturalRunicClear && !spawnsToCreate.some((s) => s.special === "golden")) {
          const availableForGolden = new Set(clearSet);
          for (const s of spawnsToCreate) availableForGolden.delete(s.k);
          const goldenSpawn = pickRunicClearGoldenSpawn(availableForGolden, focus);
          if (goldenSpawn) spawnsToCreate.push({ ...goldenSpawn, conversion: true });
        }
        // Large natural clears get a concise Runic Clear flourish plus a guaranteed Golden Toby spawn.
        if (sfxKey !== "none") playSfx(naturalRunicClear ? "runicClear" : sfxKey);
        if (naturalRunicClear) {
          const f = rc(focus);
          const p = xy(f.r, f.c);
          const cx = p.x + tileSize / 2;
          const cy = p.y + tileSize / 2;
          addBoardBannerText("Rune Storm!", "chain", { priority: 5, palette: "gold" });
          spawnRunicClearFx(cx, cy, 0xffefb0);
          spawnGuaranteedShockwave(cx, cy, 0xffefb0, 0.74, "normal");
        }
        await withTimeout(
          runRunicClearChain(clearSet, focus, activatedIds),
          naturalRunicClear || clearSet.size >= 7 ? 1250 : 1500,
          "runic clear chain safety timeout"
        );
        protectIngredientCellsFromClear(clearSet);
        if (!clearSet.size) return false;
        for (let i = spawnsToCreate.length - 1; i >= 0; i--) {
          const loc = rc(spawnsToCreate[i].k);
          const target = tiles.find((t) => t.r === loc.r && t.c === loc.c);
          if (!target || !clearSet.has(spawnsToCreate[i].k) || !canClearCell(loc.r, loc.c)) {
            spawnsToCreate.splice(i, 1);
          }
        }
        combo += 1;
        const comboBonus = combo > 1 ? combo * BONUS_COMBO : 0;
        const fogWasClearedBefore = fogClearedThisMove;
        damageFogAdjacent(clearSet);
        protectIngredientCellsFromClear(clearSet);
        if (!fogWasClearedBefore && fogClearedThisMove) playSfx("fog");
        collectCleared(clearSet);
        const creationSourceSet = new Set(clearSet);
        for (const protectedSpawn of spawnsToCreate) {
          clearSet.delete(protectedSpawn.k);
        }
        // Ingredients fall only through cells that truly disappear. Protected special-spawn cells stay filled.
        const ingredientCollectionJobs = applyIngredientFall(clearSet);
        protectIngredientCellsFromClear(clearSet);
        const idsToPop = tiles.filter((t) => clearSet.has(idx(t.r, t.c)) && canClearTile(t)).map((t) => t.id);
        const f = rc(focus);
        const p = xy(f.r, f.c);
        score += clearSet.size * PTS_PER_TILE + bonus + comboBonus;
        addScorePopup(p.x + tileSize / 2, p.y + tileSize / 2, `+${clearSet.size * PTS_PER_TILE + bonus + comboBonus}`, "points");
        showComboFlourish(combo, clearSet.size, focus);
        if (combo === 2) addScorePopup(boardSize / 2, tileSize * 1.1, `Combo x${combo}`, "combo");
        hud();
        if (spawnsToCreate.length) await playSpecialCreationSequence(spawnsToCreate, creationSourceSet);
        await playSmallPop(idsToPop);
        await playClearImpactPause(clearSet, focus, naturalRunicClear || sfxKey === "none" || clearSet.size >= 7);

        const beforeFall = new Map<number, { r: number; c: number }>();
        for (const t of tiles) beforeFall.set(t.id, { r: t.r, c: t.c });

        tiles = tiles.filter((t) => !clearSet.has(idx(t.r, t.c)) || !canClearTile(t));
        for (const id of idsToPop) instantHiddenSpecialIds.delete(id);
        refillAndRenderBoardSafely(beforeFall, "clear refill");

        await settleFxJobs([
          settleBoardAfterRefill(beforeFall, combo),
          ...ingredientCollectionJobs,
        ], "cascade refill");
        await wait(spawnsToCreate.length ? 12 : 4);

        return true;
      };

      const playSpecialSpawnSfx = (special: Special, naturalRunicClear = false) => {
        if (special === "none") return;
        if (naturalRunicClear) {
          playSfx("convert");
          return;
        }
        if (special === "lotus") {
          playSfx("lotusSpawn");
          return;
        }
        if (special === "golden") {
          playSfx("goldenSpawn");
          return;
        }
        playSfx("spawn");
      };

      const playSpawnRing = (r: number, c: number, special: Special) => {
        if (special === "none") return;

        const { x, y } = xy(r, c);
        const cx = x + tileSize / 2;
        const cy = y + tileSize / 2;
        const color = special === "lotus" ? 0xffd7f4 : special === "golden" ? 0xffdc78 : 0xffb76d;
        const isPremium = special === "golden" || special === "lotus";
        const power = special === "lotus" ? 1.18 : special === "golden" ? 1.05 : 0.88;

        // Guaranteed-visible spawn circle burst for Golden and Lotus.
        spawnGuaranteedShockwave(cx, cy, color, power, "normal");

        if (special === "golden") {
          const burst = new Container();
          burst.x = cx;
          burst.y = cy;
          burst.alpha = 0.96;
          burst.scale.set(0.42);
          burst.blendMode = "add" as any;
          addClearFx(burst);

          const outer = new Graphics();
          outer.circle(0, 0, tileSize * 0.47);
          outer.stroke({ color: 0xffffff, alpha: 0.78, width: Math.max(2, tileSize * 0.035) });
          outer.circle(0, 0, tileSize * 0.35);
          outer.stroke({ color, alpha: 0.88, width: Math.max(2, tileSize * 0.030) });
          burst.addChild(outer);

          const glyphCount = Math.max(6, fxCount(8));
          for (let i = 0; i < glyphCount; i++) {
            const a = (Math.PI * 2 * i) / glyphCount;
            const glyph = new Graphics();
            glyph.moveTo(0, -tileSize * 0.042);
            glyph.lineTo(tileSize * 0.033, 0);
            glyph.lineTo(0, tileSize * 0.042);
            glyph.lineTo(-tileSize * 0.033, 0);
            glyph.lineTo(0, -tileSize * 0.042);
            glyph.stroke({ color: i % 2 ? 0xffffff : color, alpha: 0.72, width: Math.max(1, tileSize * 0.010), cap: "round", join: "round" } as any);
            glyph.x = Math.cos(a) * tileSize * 0.34;
            glyph.y = Math.sin(a) * tileSize * 0.34;
            glyph.rotation = a + Math.PI / 4;
            glyph.alpha = 0.86;
            burst.addChild(glyph);
            gsapTo(glyph, {
              x: Math.cos(a) * tileSize * 0.66,
              y: Math.sin(a) * tileSize * 0.66,
              alpha: 0,
              rotation: glyph.rotation + 0.34,
            }, 175, "power3.out");
          }

          Promise.all([
            gsapTo(burst.scale, { x: 1.34, y: 1.34 }, 165, "power4.out"),
            gsapTo(burst, { rotation: 0.30, alpha: 0 }, 190, "power2.out"),
          ]).then(() => destroyFxChild(burst));
        }

        const flash = new Graphics();
        flash.circle(cx, cy, tileSize * (isPremium ? 0.18 : 0.11));
        flash.fill({ color: 0xffffff, alpha: isPremium ? 0.34 : 0.18 });
        flash.blendMode = "add" as any;
        addGlowFx(flash);

        const ringCount = isPremium ? 3 : 1;
        for (let i = 0; i < ringCount; i++) {
          queueTimer(() => {
            const ring = new Graphics();
            ring.circle(0, 0, tileSize * (isPremium ? 0.34 + i * 0.04 : 0.26));
            ring.stroke({
              color: i % 2 ? 0xffffff : color,
              alpha: i === 0 ? 0.92 : 0.58,
              width: Math.max(2, Math.round(tileSize * (isPremium ? 0.04 : 0.025))),
            });
            ring.x = cx;
            ring.y = cy;
            ring.scale.set(0.28);
            ring.blendMode = "add" as any;
            addClearFx(ring);

            Promise.all([
              gsapTo(ring.scale, { x: i === 0 ? 1.75 : 2.18, y: i === 0 ? 1.75 : 2.18 }, special === "golden" ? (i === 0 ? 145 : 178) : (i === 0 ? 215 : 270), "power4.out"),
              gsapTo(ring, { alpha: 0 }, special === "golden" ? (i === 0 ? 155 : 188) : (i === 0 ? 225 : 280), "power2.out"),
            ]).then(() => destroyFxChild(ring));
          }, i * (special === "golden" ? 22 : 38));
        }

        Promise.all([
          gsapTo(flash.scale, { x: isPremium ? 2.5 : 1.55, y: isPremium ? 2.5 : 1.55 }, special === "golden" ? 108 : 160, "power3.out"),
          gsapTo(flash, { alpha: 0 }, special === "golden" ? 120 : 175, "power2.out"),
        ]).then(() => destroyFxChild(flash));

        if (isPremium) {
          luxuryParticleBurst(["sparkle", "star", "spark", "magic"], cx, cy, special === "lotus" ? 10 : 8, tileSize * 0.52, tileSize * 0.16, color, special === "golden" ? 170 : 240);
          const tile = tiles.find((tt) => tt.r === r && tt.c === c);
          const tv = tile ? tileViews.get(tile.id) : null;
          if (tv) {
            tv.wrap.scale.set(0.72);
            gsapTo(tv.wrap.scale, { x: special === "golden" ? 1.14 : 1.12, y: special === "golden" ? 1.14 : 1.12 }, special === "golden" ? 95 : 150, "back.out(1.55)")
              .then(() => gsapTo(tv.wrap.scale, { x: 1, y: 1 }, special === "golden" ? 70 : 110, "power3.out"));
          }
        }
      };

      const resolveCascades = async (firstSpawn: ReturnType<typeof chooseSpawn> | null) => {
        let spawn = firstSpawn;
        let cascadeCount = 0;
        const maxCascadeLoops = 18;
        const seenCascadeSignatures = new Set<string>();

        // Professional cascade loop:
        // player/special clear -> gravity/drop -> refill -> recompute matches -> repeat until stable.
        // Refilled runes are allowed to accidentally create matches. Only the starting board blocks them.
        // The cap is only a safety guard; it should not warn just because the board stabilized on the last check.
        while (cascadeCount < maxCascadeLoops) {
          repairGrid();
          const m = computeBoardMatches();
          if (!m.clear.size) break;

          cascadeCount += 1;
          const clearSet = new Set(m.clear);
          const signatureGrid = toGrid(tiles);
          const signature = Array.from(clearSet)
            .sort((a, b) => a - b)
            .map((k) => `${k}:${signatureGrid[k]?.id ?? "x"}:${signatureGrid[k]?.color ?? "x"}`)
            .join("|");
          if (seenCascadeSignatures.has(signature)) {
            console.warn("Rune Rush cascade repeated the same clear pattern; stopping cleanly");
            break;
          }
          seenCascadeSignatures.add(signature);
          const thisSpawn = spawn ?? chooseSpawn(m, []);
          const focus = thisSpawn?.k ?? Array.from(clearSet)[0];

          let didClear = false;
          try {
            didClear = await clearCells(clearSet, focus, 0, thisSpawn ?? undefined);
          } catch (err) {
            console.warn("Rune Rush cascade step recovered", err);
            tweens.length = 0;
            clearQueuedTimers();
            refillAndRenderBoardSafely(undefined, "cascade recovery");
            break;
          }
          spawn = null;
          if (!didClear) break;
          await wait(cascadeCount > 1 ? CASCADE_WAIT_MS : Math.round(CASCADE_WAIT_MS * 0.68));
        }

        if (cascadeCount >= maxCascadeLoops) {
          refillAndRenderBoardSafely(undefined, "cascade safety cap");
          if (computeBoardMatches().clear.size > 0) {
            console.warn("Rune Rush cascade safety cap reached");
          }
        }
      };

      const playGoldenFlash = async (origin: Tile, dir: "h" | "v") => {
        const p = xy(origin.r, origin.c);
        const cx = p.x + tileSize / 2;
        const cy = p.y + tileSize / 2;
        const color = 0xffd978;
        const amber = 0xffa92f;
        const hot = 0xffffff;
        const isH = dir === "h";
        const cellStep = tileSize + gap;

        const cells: { r: number; c: number; d: number; side: number }[] = [];
        const pushGoldenCell = (cell: { r: number; c: number; d: number; side: number }) => {
          if (!canClearCell(cell.r, cell.c)) return;
          cells.push(cell);
        };
        for (let d = 0; d < N; d++) {
          if (d === 0) {
            pushGoldenCell({ r: origin.r, c: origin.c, d, side: 0 });
            continue;
          }
          const negR = isH ? origin.r : origin.r - d;
          const negC = isH ? origin.c - d : origin.c;
          const posR = isH ? origin.r : origin.r + d;
          const posC = isH ? origin.c + d : origin.c;
          if (negR >= 0 && negR < N && negC >= 0 && negC < N) pushGoldenCell({ r: negR, c: negC, d, side: -1 });
          if (posR >= 0 && posR < N && posC >= 0 && posC < N) pushGoldenCell({ r: posR, c: posC, d, side: 1 });
        }

        const maxD = Math.max(1, cells.reduce((m, cell) => Math.max(m, cell.d), 0));
        const impactBase = 26;
        const impactStep = Math.max(18, Math.min(30, 170 / maxD));

        try {
          void pulseTileView(origin, 1.14, 36, 48);
          impactShake("tiny", color);

          const lengthNeg = (isH ? origin.c : origin.r) * cellStep + tileSize * 0.52;
          const lengthPos = (isH ? N - 1 - origin.c : N - 1 - origin.r) * cellStep + tileSize * 0.52;
          const totalLength = lengthNeg + lengthPos;
          const offset = (lengthPos - lengthNeg) / 2;
          const swipe = new Container();
          swipe.x = isH ? cx + offset : cx;
          swipe.y = isH ? cy : cy + offset;
          swipe.alpha = 0;
          swipe.blendMode = "add" as any;
          swipe.scale.set(isH ? 0.04 : 1, isH ? 1 : 0.04);
          addBeamFx(swipe);

          const drawBand = (thick: number, tint: number, alpha: number) => {
            const band = new Graphics();
            if (isH) band.roundRect(-totalLength / 2, -thick / 2, totalLength, thick, 999);
            else band.roundRect(-thick / 2, -totalLength / 2, thick, totalLength, 999);
            band.fill({ color: tint, alpha });
            swipe.addChild(band);
          };

          drawBand(Math.max(7, tileSize * 0.120), color, 0.14);
          drawBand(Math.max(3, tileSize * 0.050), amber, 0.38);
          drawBand(Math.max(1.5, tileSize * 0.020), hot, 0.86);

          Promise.all([
            gsapTo(swipe, { alpha: 1 }, 22, "power2.out")
              .then(() => gsapTo(swipe, { alpha: 0 }, 150, "power2.out")),
            gsapTo(swipe.scale, { x: 1, y: 1 }, 82, "power4.out"),
          ]).then(() => destroyFxChild(swipe));

          cells.forEach((cell, i) => {
            queueTimer(() => {
              if (cancelled) return;
              const q = xy(cell.r, cell.c);
              const tx = q.x + tileSize / 2;
              const ty = q.y + tileSize / 2;
              const spark = new Graphics();
              spark.circle(0, 0, tileSize * 0.075);
              spark.fill({ color: hot, alpha: 0.42 });
              spark.circle(0, 0, tileSize * 0.18);
              spark.fill({ color, alpha: 0.15 });
              spark.x = tx;
              spark.y = ty;
              spark.blendMode = "add" as any;
              addClearFx(spark);
              Promise.all([
                gsapTo(spark.scale, { x: 1.48, y: 1.48 }, 92, "power3.out"),
                gsapTo(spark, { alpha: 0 }, 112, "power2.out"),
              ]).then(() => destroyFxChild(spark));

              const tv = tileViews.get(tiles.find((tt) => tt.r === cell.r && tt.c === cell.c && canClearTile(tt))?.id ?? -1);
              if (tv) {
                const kickX = isH ? (cell.side || 1) * tileSize * 0.020 : 0;
                const kickY = isH ? 0 : (cell.side || 1) * tileSize * 0.020;
                void gsapTo(tv.wrap, { x: tv.baseX + kickX, y: tv.baseY + kickY }, 24, "power2.out")
                  .then(() => gsapTo(tv.wrap, { x: tv.baseX, y: tv.baseY }, 34, "power2.out"));
              }
            }, impactBase + cell.d * impactStep + i * 2);
          });

          await wait(impactBase + maxD * impactStep + 92);
        } catch (err) {
          console.warn("Rune Rush Golden swipe recovered", err);
        }
        return;

        const charge = new Container();
        charge.x = cx;
        charge.y = cy;
        charge.blendMode = "add" as any;
        addBeamFx(charge);

        const chargeCore = new Graphics();
        chargeCore.circle(0, 0, tileSize * 0.24);
        chargeCore.fill({ color: hot, alpha: 0.18 });
        chargeCore.circle(0, 0, tileSize * 0.39);
        chargeCore.fill({ color, alpha: 0.13 });
        charge.addChild(chargeCore);

        for (let i = 0; i < 8; i++) {
          const glyph = new Graphics();
          const a = (Math.PI * 2 * i) / 8;
          glyph.moveTo(-tileSize * 0.035, 0);
          glyph.lineTo(0, -tileSize * 0.060);
          glyph.lineTo(tileSize * 0.035, 0);
          glyph.stroke({ color: i % 2 ? hot : color, alpha: 0.48, width: Math.max(1, tileSize * 0.010), cap: "round", join: "round" } as any);
          glyph.x = Math.cos(a) * tileSize * 0.31;
          glyph.y = Math.sin(a) * tileSize * 0.31;
          glyph.rotation = a + Math.PI / 2;
          charge.addChild(glyph);
        }

        premiumGlow(charge, color, 360, 1.45);
        void pulseTileView(origin, 1.18, 48, 70);
        impactShake("tiny", color);
        luxuryParticleBurst(["sparkle", "star", "spark"], cx, cy, 5, tileSize * 0.30, tileSize * 0.11, color, 140);
        await Promise.all([
          gsapTo(charge.scale, { x: 1.20, y: 1.20 }, 108, "back.out(1.55)"),
          gsapTo(charge, { rotation: charge.rotation + 0.28 }, 108, "power2.out"),
        ]);

        const spawnBeamRail = () => {
          const rail = new Container();
          rail.x = cx;
          rail.y = cy;
          rail.alpha = 0;
          rail.blendMode = "add" as any;
          addBeamFx(rail);

          const lengthNeg = (isH ? origin.c : origin.r) * cellStep + tileSize * 0.52;
          const lengthPos = (isH ? N - 1 - origin.c : N - 1 - origin.r) * cellStep + tileSize * 0.52;
          const totalLength = lengthNeg + lengthPos;
          const offset = (lengthPos - lengthNeg) / 2;
          rail.x = isH ? cx + offset : cx;
          rail.y = isH ? cy : cy + offset;

          const drawLine = (width: number, tint: number, alpha: number) => {
            const g = new Graphics();
            if (isH) {
              g.moveTo(-totalLength / 2, 0);
              g.lineTo(totalLength / 2, 0);
            } else {
              g.moveTo(0, -totalLength / 2);
              g.lineTo(0, totalLength / 2);
            }
            g.stroke({ color: tint, alpha, width, cap: "round", join: "round" } as any);
            rail.addChild(g);
          };

          drawLine(Math.max(10, tileSize * 0.12), color, 0.18);
          drawLine(Math.max(5, tileSize * 0.060), amber, 0.42);
          drawLine(Math.max(2, tileSize * 0.025), hot, 0.90);
          try { premiumGlow(rail, color, 310, 1.25); } catch {}

          rail.scale.set(isH ? 0.04 : 1, isH ? 1 : 0.04);
          Promise.all([
            gsapTo(rail, { alpha: 1 }, 34, "power2.out")
              .then(() => gsapTo(rail, { alpha: 0 }, 240, "power2.out")),
            gsapTo(rail.scale, { x: 1, y: 1 }, 145, "power4.out"),
          ]).then(() => destroyFxChild(rail));
        };

        const spawnMovingHead = (side: -1 | 1) => {
          const endpointD = side < 0
            ? (isH ? origin.c : origin.r)
            : (isH ? N - 1 - origin.c : N - 1 - origin.r);
          if (endpointD <= 0) return;
          const head = new Container();
          head.x = cx;
          head.y = cy;
          head.blendMode = "add" as any;
          addBeamFx(head);

          const core = new Graphics();
          core.circle(0, 0, tileSize * 0.10);
          core.fill({ color: hot, alpha: 0.94 });
          core.circle(0, 0, tileSize * 0.22);
          core.fill({ color, alpha: 0.28 });
          head.addChild(core);

          for (let i = 0; i < 4; i++) {
            const mote = new Graphics();
            mote.circle(0, 0, tileSize * (0.015 + i * 0.003));
            mote.fill({ color: i % 2 ? hot : color, alpha: 0.52 });
            mote.x = (Math.random() - 0.5) * tileSize * 0.20;
            mote.y = (Math.random() - 0.5) * tileSize * 0.20;
            head.addChild(mote);
          }

          try { premiumGlow(head, color, 260, 1.18); } catch {}
          try { premiumMotionBlur(head, dir, 260); } catch {}
          const endX = isH ? cx + side * endpointD * cellStep : cx;
          const endY = isH ? cy : cy + side * endpointD * cellStep;
          Promise.all([
            gsapTo(head, { x: endX, y: endY }, 170, "power3.out"),
            gsapTo(head.scale, { x: 1.14, y: 1.14 }, 170, "power2.out"),
          ]).then(() => Promise.all([
            gsapTo(head, { alpha: 0 }, 82, "power2.out"),
            gsapTo(head.scale, { x: 1.72, y: 1.72 }, 82, "power3.out"),
          ])).then(() => destroyFxChild(head));
        };

        const spawnSlashSegment = (tx: number, ty: number, side: number) => {
          const slash = new Container();
          slash.x = tx;
          slash.y = ty;
          slash.alpha = 0;
          slash.blendMode = "add" as any;
          addBeamFx(slash);

          const makeStroke = (width: number, tint: number, alpha: number, jitter = 0) => {
            const g = new Graphics();
            const length = tileSize * (side === 0 ? 0.76 : 1.03);
            if (isH) {
              g.moveTo(-length / 2, jitter);
              g.lineTo(length / 2, -jitter);
            } else {
              g.moveTo(jitter, -length / 2);
              g.lineTo(-jitter, length / 2);
            }
            g.stroke({ color: tint, alpha, width, cap: "round", join: "round" } as any);
            slash.addChild(g);
          };

          makeStroke(Math.max(8, tileSize * 0.120), color, 0.18);
          makeStroke(Math.max(5, tileSize * 0.066), amber, 0.34, tileSize * 0.014);
          makeStroke(Math.max(2, tileSize * 0.032), color, 0.82);
          makeStroke(Math.max(1.2, tileSize * 0.016), hot, 0.95, -tileSize * 0.012);
          try { premiumGlow(slash, color, 220, 1.05); } catch {}
          Promise.all([
            gsapTo(slash, { alpha: 1 }, 30, "power2.out"),
            gsapTo(slash.scale, { x: isH ? 1.16 : 1.0, y: isH ? 1.0 : 1.16 }, 62, "power3.out"),
          ]).then(() => Promise.all([
            gsapTo(slash, { alpha: 0 }, 118, "power2.out"),
            gsapTo(slash.scale, { x: isH ? 1.28 : 1.0, y: isH ? 1.0 : 1.28 }, 118, "power2.out"),
          ])).then(() => destroyFxChild(slash));
        };

        const spawnGoldenLightSwipe = () => {
          const lengthNeg = (isH ? origin.c : origin.r) * cellStep + tileSize * 0.52;
          const lengthPos = (isH ? N - 1 - origin.c : N - 1 - origin.r) * cellStep + tileSize * 0.52;
          const totalLength = lengthNeg + lengthPos;
          const offset = (lengthPos - lengthNeg) / 2;
          const swipe = new Container();
          swipe.x = isH ? cx + offset : cx;
          swipe.y = isH ? cy : cy + offset;
          swipe.alpha = 0;
          swipe.blendMode = "add" as any;
          swipe.scale.set(isH ? 0.06 : 1, isH ? 1 : 0.06);
          addBeamFx(swipe);

          const drawBand = (thick: number, tint: number, alpha: number) => {
            const band = new Graphics();
            if (isH) {
              band.roundRect(-totalLength / 2, -thick / 2, totalLength, thick, 999);
            } else {
              band.roundRect(-thick / 2, -totalLength / 2, thick, totalLength, 999);
            }
            band.fill({ color: tint, alpha });
            swipe.addChild(band);
          };

          drawBand(Math.max(9, tileSize * 0.16), color, 0.12);
          drawBand(Math.max(5, tileSize * 0.075), amber, 0.22);
          drawBand(Math.max(2, tileSize * 0.028), hot, 0.64);

          const originOffset = isH ? cx - swipe.x : cy - swipe.y;
          const makeHead = (side: -1 | 1) => {
            const head = new Graphics();
            head.circle(0, 0, tileSize * 0.105);
            head.fill({ color: hot, alpha: 0.88 });
            head.circle(0, 0, tileSize * 0.24);
            head.fill({ color, alpha: 0.22 });
            head.x = isH ? originOffset : 0;
            head.y = isH ? 0 : originOffset;
            head.blendMode = "add" as any;
            swipe.addChild(head);
            const end = side < 0 ? -totalLength / 2 : totalLength / 2;
            const travel: any = isH ? { x: end } : { y: end };
            gsapTo(head, travel, 190, "power3.out")
              .then(() => gsapTo(head, { alpha: 0 }, 70, "power2.out"));
          };
          makeHead(-1);
          makeHead(1);

          Promise.all([
            gsapTo(swipe, { alpha: 1 }, 26, "power2.out")
              .then(() => gsapTo(swipe, { alpha: 0 }, 245, "power2.out")),
            gsapTo(swipe.scale, { x: 1, y: 1 }, 126, "power4.out"),
          ]).then(() => destroyFxChild(swipe));
        };

        const spawnRunicGlyphTrail = (x: number, y: number, cell: { side: number }) => {
          const count = Math.max(2, fxCount(3));
          for (let i = 0; i < count; i++) {
            const glyph = new Graphics();
            glyph.moveTo(-tileSize * 0.020, 0);
            glyph.lineTo(0, -tileSize * 0.040);
            glyph.lineTo(tileSize * 0.020, 0);
            glyph.stroke({ color: i % 2 ? hot : color, alpha: 0.50, width: Math.max(1, tileSize * 0.008), cap: "round", join: "round" } as any);
            glyph.x = x + (Math.random() - 0.5) * tileSize * 0.32;
            glyph.y = y + (Math.random() - 0.5) * tileSize * 0.32;
            glyph.rotation = (isH ? 0 : Math.PI / 2) + (Math.random() - 0.5) * 1.4;
            glyph.blendMode = "add" as any;
            addParticleFx(glyph);
            const drift = tileSize * (0.12 + Math.random() * 0.18);
            const driftX = isH ? -(cell.side || 1) * drift : (Math.random() - 0.5) * drift;
            const driftY = isH ? (Math.random() - 0.5) * drift : -(cell.side || 1) * drift;
            Promise.all([
              gsapTo(glyph, { x: glyph.x + driftX, y: glyph.y + driftY, alpha: 0 }, 170, "power3.out"),
              gsapTo(glyph.scale, { x: 1.48, y: 1.48 }, 170, "power3.out"),
            ]).then(() => destroyFxChild(glyph));
          }
        };

        const spawnCrackAndPop = (cell: { r: number; c: number; d: number; side: number }, orderIndex: number) => {
          const q = xy(cell.r, cell.c);
          const tx = q.x + tileSize / 2;
          const ty = q.y + tileSize / 2;
          spawnRunicGlyphTrail(tx, ty, cell);

          const glow = new Graphics();
          glow.circle(0, 0, tileSize * 0.25);
          glow.fill({ color, alpha: 0.20 });
          glow.circle(0, 0, tileSize * 0.14);
          glow.fill({ color: hot, alpha: 0.18 });
          glow.x = tx;
          glow.y = ty;
          glow.blendMode = "add" as any;
          addGlowFx(glow);
          Promise.all([
            gsapTo(glow.scale, { x: 1.30, y: 1.30 }, 112, "power4.out"),
            gsapTo(glow, { alpha: 0 }, 130, "power2.out"),
          ]).then(() => destroyFxChild(glow));

          const crack = new Graphics();
          crack.x = tx;
          crack.y = ty;
          crack.alpha = 0.92;
          crack.blendMode = "add" as any;
          const crackLen = tileSize * 0.19;
          const crackCount = 3;
          for (let i = 0; i < crackCount; i++) {
            const a = (Math.PI * 2 * i) / crackCount + (isH ? 0 : Math.PI / 2) + (Math.random() - 0.5) * 0.42;
            crack.moveTo(0, 0);
            crack.lineTo(Math.cos(a) * crackLen * (0.72 + Math.random() * 0.26), Math.sin(a) * crackLen * (0.72 + Math.random() * 0.26));
          }
          crack.stroke({ color: orderIndex % 2 ? hot : color, alpha: 0.62, width: Math.max(1.0, tileSize * 0.015), cap: "round" } as any);
          addClearFx(crack);
          Promise.all([
            gsapTo(crack.scale, { x: 1.24, y: 1.24 }, 96, "power3.out"),
            gsapTo(crack, { alpha: 0 }, 112, "power2.out"),
          ]).then(() => destroyFxChild(crack));

          luxuryParticleBurst(["spark", "sparkle", "star"], tx, ty, 3, tileSize * 0.20, tileSize * 0.085, color, 135);
          if (orderIndex % 2 === 0) candySparkBurst(tx, ty, color, 0.24);

          const tile = tiles.find((tt) => tt.r === cell.r && tt.c === cell.c);
          const tv = tile ? tileViews.get(tile.id) : null;
          if (tile) instantHiddenSpecialIds.add(tile.id);
          if (tv) {
            tv.busy = true;
            const bumpX = isH ? (cell.side || 1) * tileSize * 0.030 : 0;
            const bumpY = isH ? 0 : (cell.side || 1) * tileSize * 0.030;
            try {
              gsap.killTweensOf(tv.wrap);
              gsap.killTweensOf(tv.wrap.scale);
            } catch {}
            Promise.all([
              gsapTo(tv.wrap, { x: tv.baseX + bumpX, y: tv.baseY + bumpY }, 24, "power2.out")
                .then(() => gsapTo(tv.wrap, { x: tv.baseX - bumpX * 0.48, y: tv.baseY - bumpY * 0.48 }, 26, "power2.out"))
                .then(() => gsapTo(tv.wrap, { x: tv.baseX, y: tv.baseY }, 28, "power2.out")),
              gsapTo(tv.wrap.scale, { x: 1.10, y: 1.10 }, 34, "back.out(1.45)")
                .then(() => gsapTo(tv.wrap.scale, { x: 0.48, y: 0.48 }, 96, "power3.in")),
              gsapTo(tv.wrap, { alpha: 0 }, 118, "power2.in"),
            ]).then(() => {
              tv.wrap.alpha = 0;
              tv.wrap.scale.set(0.48);
              tv.busy = false;
            });
          }
        };

        spawnGoldenLightSwipe();
        for (const [i, cell] of cells.entries()) {
          queueTimer(() => spawnCrackAndPop(cell, i), impactBase + cell.d * impactStep);
        }

        await Promise.all([
          gsapTo(chargeCore, { alpha: 0 }, 170, "power2.out"),
          gsapTo(charge.scale, { x: 1.62, y: 1.62 }, 170, "power3.out"),
          gsapTo(charge, { alpha: 0 }, 185, "power2.out"),
        ]).then(() => destroyFxChild(charge));

        await wait(330);
      };

      const playGolden = async (origin: Tile, dir?: "h" | "v") => {
        const chosenDir = dir ?? origin.goldenDir ?? "h";
        const focus = idx(origin.r, origin.c);
        const clear = new Set<number>();
        for (const k of goldenLineCells(origin, chosenDir)) {
          const cell = rc(k);
          if (!canClearCell(cell.r, cell.c)) continue;
          clear.add(k);
        }
        if (canClearCell(origin.r, origin.c)) clear.add(focus);
        playSfx("golden");
        addBoardBannerText("Golden Bloom!", "golden", { priority: 6, palette: "gold" });
        await withTimeout(playGoldenFlash(origin, chosenDir), 1250, "golden line animation timeout");
        const didClear = await clearCells(clear, focus, BONUS_GOLDEN, undefined, "none", new Set([origin.id]));
        if (!didClear) console.warn("Rune Rush Golden clear had no valid row/column cells", { row: origin.r, column: origin.c, chosenDir });
      };

      const showGoldenRushBlast = async (a: Tile, b?: Tile) => {
        const gold = 0xffd978;
        const amber = 0xffa92f;
        const hot = 0xffffff;
        const aPos = xy(a.r, a.c);
        const bPos = b ? xy(b.r, b.c) : aPos;
        const ax = aPos.x + tileSize / 2;
        const ay = aPos.y + tileSize / 2;
        const bx = b ? bPos.x + tileSize / 2 : ax;
        const by = b ? bPos.y + tileSize / 2 : ay;
        const cx = b ? (ax + bx) / 2 : ax;
        const cy = b ? (ay + by) / 2 : ay;
        const activated = new Set<number>([a.id]);
        if (b) activated.add(b.id);

        const targetTiles = tiles
          .filter((t) => canClearTile(t))
          .sort((ta, tb) => {
            const pa = xy(ta.r, ta.c);
            const pb = xy(tb.r, tb.c);
            const da = Math.hypot(pa.x + tileSize / 2 - cx, pa.y + tileSize / 2 - cy);
            const db = Math.hypot(pb.x + tileSize / 2 - cx, pb.y + tileSize / 2 - cy);
            return da - db;
          });

        const spawnSourceCharge = (tile: Tile, x: number, y: number) => {
          const charge = new Container();
          charge.x = x;
          charge.y = y;
          charge.blendMode = "add" as any;
          addBeamFx(charge);

          const core = new Graphics();
          core.circle(0, 0, tileSize * 0.20);
          core.fill({ color: hot, alpha: 0.26 });
          core.circle(0, 0, tileSize * 0.36);
          core.fill({ color: gold, alpha: 0.16 });
          charge.addChild(core);

          for (let i = 0; i < 10; i++) {
            const angle = (Math.PI * 2 * i) / 10;
            const glyph = new Graphics();
            glyph.moveTo(-tileSize * 0.028, 0);
            glyph.lineTo(0, -tileSize * 0.056);
            glyph.lineTo(tileSize * 0.028, 0);
            glyph.stroke({ color: i % 2 ? hot : gold, alpha: 0.58, width: Math.max(1, tileSize * 0.009), cap: "round", join: "round" } as any);
            glyph.x = Math.cos(angle) * tileSize * 0.33;
            glyph.y = Math.sin(angle) * tileSize * 0.33;
            glyph.rotation = angle + Math.PI / 2;
            charge.addChild(glyph);
          }

          premiumGlow(tileViews.get(tile.id)?.wrap, gold, 560, 1.45);
          premiumGlow(charge, gold, 480, 1.35);
          candySparkBurst(x, y, gold, 0.42);

          Promise.all([
            gsapTo(charge.scale, { x: 1.55, y: 1.55 }, 210, "back.out(1.35)"),
            gsapTo(charge, { alpha: 0 }, 360, "power2.out"),
          ]).then(() => destroyFxChild(charge));
        };

        const spawnConnector = () => {
          if (!b) return;
          const rail = new Graphics();
          rail.moveTo(ax, ay);
          rail.lineTo(bx, by);
          rail.stroke({ color: gold, alpha: 0.28, width: Math.max(7, tileSize * 0.11), cap: "round" } as any);
          rail.moveTo(ax, ay);
          rail.lineTo(bx, by);
          rail.stroke({ color: hot, alpha: 0.54, width: Math.max(2, tileSize * 0.034), cap: "round" } as any);
          rail.alpha = 0;
          rail.blendMode = "add" as any;
          addBeamFx(rail);
          premiumGlow(rail, gold, 430, 1.2);

          const tracerA = new Graphics();
          tracerA.circle(0, 0, tileSize * 0.065);
          tracerA.fill({ color: hot, alpha: 0.92 });
          tracerA.circle(0, 0, tileSize * 0.16);
          tracerA.fill({ color: gold, alpha: 0.22 });
          tracerA.x = ax;
          tracerA.y = ay;
          tracerA.blendMode = "add" as any;
          addBeamFx(tracerA);

          const tracerB = new Graphics();
          tracerB.circle(0, 0, tileSize * 0.055);
          tracerB.fill({ color: hot, alpha: 0.78 });
          tracerB.x = bx;
          tracerB.y = by;
          tracerB.blendMode = "add" as any;
          addBeamFx(tracerB);

          const glyphCount = Math.max(5, fxCount(8));
          for (let i = 0; i < glyphCount; i++) {
            const t = (i + 1) / (glyphCount + 1);
            const gx = ax + (bx - ax) * t;
            const gy = ay + (by - ay) * t;
            queueTimer(() => {
              if (cancelled) return;
              const glyph = new Graphics();
              glyph.moveTo(-tileSize * 0.026, 0);
              glyph.lineTo(0, -tileSize * 0.056);
              glyph.lineTo(tileSize * 0.026, 0);
              glyph.stroke({ color: i % 2 ? hot : gold, alpha: 0.72, width: Math.max(1, tileSize * 0.009), cap: "round", join: "round" } as any);
              glyph.x = gx;
              glyph.y = gy;
              glyph.rotation = Math.atan2(by - ay, bx - ax) + Math.PI / 2 + (Math.random() - 0.5) * 0.5;
              glyph.scale.set(0.42);
              glyph.blendMode = "add" as any;
              addParticleFx(glyph);
              Promise.all([
                gsapTo(glyph.scale, { x: 1.26, y: 1.26 }, 150, "power3.out"),
                gsapTo(glyph, { alpha: 0, y: glyph.y - tileSize * 0.10 }, 180, "power2.out"),
              ]).then(() => destroyFxChild(glyph));
            }, 26 * i);
          }

          Promise.all([
            gsapTo(rail, { alpha: 1 }, 70, "power2.out").then(() => gsapTo(rail, { alpha: 0 }, 250, "power2.out")),
            gsapTo(tracerA, { x: cx, y: cy, alpha: 0.98 }, 145, "power3.in"),
            gsapTo(tracerB, { x: cx, y: cy, alpha: 0.9 }, 145, "power3.in"),
          ]).then(() => Promise.all([
            gsapTo(tracerA.scale, { x: 2.1, y: 2.1 }, 140, "power4.out"),
            gsapTo(tracerB.scale, { x: 1.8, y: 1.8 }, 135, "power4.out"),
            gsapTo(tracerA, { alpha: 0 }, 145, "power2.out"),
            gsapTo(tracerB, { alpha: 0 }, 145, "power2.out"),
          ])).then(() => {
            destroyFxChild(rail);
            destroyFxChild(tracerA);
            destroyFxChild(tracerB);
          });
        };

        const spawnBlastCore = () => {
          spawnGuaranteedShockwave(cx, cy, gold, 1.22, "goldenLotus");
          candyFlashPop(cx, cy, gold, 1.22);
          luxuryParticleBurst(["sparkle", "star", "spark", "magic"], cx, cy, 16, tileSize * 1.15, tileSize * 0.18, gold, 360);
          for (let i = 0; i < 14; i++) {
            const angle = (Math.PI * 2 * i) / 14;
            const ray = new Graphics();
            ray.roundRect(-tileSize * 0.014, -tileSize * 0.68, tileSize * 0.028, tileSize * 0.82, 999);
            ray.fill({ color: i % 2 ? hot : amber, alpha: i % 2 ? 0.30 : 0.42 });
            ray.x = cx;
            ray.y = cy;
            ray.rotation = angle;
            ray.scale.set(0.14, 0.26);
            ray.blendMode = "add" as any;
            addBeamFx(ray);
            Promise.all([
              gsapTo(ray.scale, { x: 1.08, y: 2.10 }, 300, "power4.out"),
              gsapTo(ray, { alpha: 0, rotation: angle + 0.16 }, 330, "power2.out"),
            ]).then(() => destroyFxChild(ray));
          }
        };

        const markGoldenTarget = (t: Tile, delay = 0) => {
          queueTimer(() => {
            if (cancelled) return;
            const p = xy(t.r, t.c);
            const tx = p.x + tileSize / 2;
            const ty = p.y + tileSize / 2;
            const ring = new Graphics();
            ring.circle(0, 0, tileSize * 0.34);
            ring.stroke({ color: t.special !== "none" ? hot : gold, alpha: t.special !== "none" ? 0.72 : 0.50, width: Math.max(1.2, tileSize * 0.020) });
            ring.x = tx;
            ring.y = ty;
            ring.scale.set(0.48);
            ring.blendMode = "add" as any;
            addClearFx(ring);

            const tv = tileViews.get(t.id);
            if (tv && t.special !== "none" && !activated.has(t.id)) {
              gsapTo(tv.wrap.scale, { x: 1.08, y: 1.08 }, 54, "back.out(1.2)")
                .then(() => gsapTo(tv.wrap.scale, { x: 1, y: 1 }, 70, "power3.out"));
            }

            Promise.all([
              gsapTo(ring.scale, { x: 1.22, y: 1.22 }, 180, "power3.out"),
              gsapTo(ring, { alpha: 0 }, 205, "power2.out"),
            ]).then(() => destroyFxChild(ring));
          }, delay);
        };

        const popGoldenTarget = (t: Tile, orderIndex: number, delay = 0) => {
          queueTimer(() => {
            if (cancelled) return;
            const p = xy(t.r, t.c);
            const tx = p.x + tileSize / 2;
            const ty = p.y + tileSize / 2;
            const tv = tileViews.get(t.id);
            const isActivatedGolden = activated.has(t.id);
            const shouldHideNow = t.special === "none" || isActivatedGolden;

            const glow = new Graphics();
            glow.circle(0, 0, tileSize * 0.23);
            glow.fill({ color: gold, alpha: 0.18 });
            glow.circle(0, 0, tileSize * 0.12);
            glow.fill({ color: hot, alpha: 0.16 });
            glow.x = tx;
            glow.y = ty;
            glow.blendMode = "add" as any;
            addGlowFx(glow);

            const crack = new Graphics();
            crack.x = tx;
            crack.y = ty;
            crack.alpha = 0.9;
            crack.blendMode = "add" as any;
            const crackLen = tileSize * (isActivatedGolden ? 0.25 : 0.18);
            for (let i = 0; i < 4; i++) {
              const angle = (Math.PI * 2 * i) / 4 + (Math.random() - 0.5) * 0.62;
              crack.moveTo(Math.cos(angle) * crackLen * 0.12, Math.sin(angle) * crackLen * 0.12);
              crack.lineTo(Math.cos(angle) * crackLen, Math.sin(angle) * crackLen);
            }
            crack.stroke({ color: orderIndex % 2 ? hot : gold, alpha: 0.62, width: Math.max(1.1, tileSize * 0.014), cap: "round" } as any);
            addClearFx(crack);

            for (let i = 0; i < 2; i++) {
              const glyph = new Graphics();
              glyph.moveTo(-tileSize * 0.020, 0);
              glyph.lineTo(0, -tileSize * 0.042);
              glyph.lineTo(tileSize * 0.020, 0);
              glyph.stroke({ color: i % 2 ? hot : gold, alpha: 0.56, width: Math.max(1, tileSize * 0.008), cap: "round", join: "round" } as any);
              glyph.x = tx + (Math.random() - 0.5) * tileSize * 0.22;
              glyph.y = ty + (Math.random() - 0.5) * tileSize * 0.22;
              glyph.rotation = Math.random() * Math.PI * 2;
              glyph.blendMode = "add" as any;
              addParticleFx(glyph);
              const drift = tileSize * (0.13 + Math.random() * 0.14);
              Promise.all([
                gsapTo(glyph, { x: glyph.x + Math.cos(glyph.rotation) * drift, y: glyph.y + Math.sin(glyph.rotation) * drift, alpha: 0 }, 190, "power3.out"),
                gsapTo(glyph.scale, { x: 1.5, y: 1.5 }, 190, "power3.out"),
              ]).then(() => destroyFxChild(glyph));
            }

            luxuryParticleBurst(["spark", "sparkle", "star"], tx, ty, isActivatedGolden ? 6 : 3, tileSize * 0.24, tileSize * 0.09, gold, 180);
            if (orderIndex % 3 === 0 || isActivatedGolden) candySparkBurst(tx, ty, gold, isActivatedGolden ? 0.54 : 0.28);

            Promise.all([
              gsapTo(glow.scale, { x: 1.42, y: 1.42 }, 150, "power4.out"),
              gsapTo(glow, { alpha: 0 }, 170, "power2.out"),
              gsapTo(crack.scale, { x: 1.32, y: 1.32 }, 135, "power3.out"),
              gsapTo(crack, { alpha: 0 }, 150, "power2.out"),
            ]).then(() => {
              destroyFxChild(glow);
              destroyFxChild(crack);
            });

            if (!tv || !shouldHideNow) return;
            instantHiddenSpecialIds.add(t.id);
            tv.busy = true;
            try {
              gsap.killTweensOf(tv.wrap);
              gsap.killTweensOf(tv.wrap.scale);
            } catch {}
            const kickX = (Math.random() - 0.5) * tileSize * 0.040;
            const kickY = (Math.random() - 0.5) * tileSize * 0.040;
            Promise.all([
              gsapTo(tv.wrap, { x: tv.baseX + kickX, y: tv.baseY + kickY }, 34, "power2.out")
                .then(() => gsapTo(tv.wrap, { x: tv.baseX, y: tv.baseY }, 46, "power2.out")),
              gsapTo(tv.wrap.scale, { x: isActivatedGolden ? 1.18 : 1.11, y: isActivatedGolden ? 1.18 : 1.11 }, 48, "back.out(1.45)")
                .then(() => gsapTo(tv.wrap.scale, { x: 0.42, y: 0.42 }, 140, "power3.in")),
              gsapTo(tv.wrap, { alpha: 0 }, 165, "power2.in"),
            ]).then(() => {
              tv.wrap.alpha = 0;
              tv.wrap.scale.set(0.42);
              tv.busy = false;
            });
          }, delay);
        };

        addBoardBannerText("Golden Rush!", "golden", { priority: 8, palette: "gold" });
        spawnSourceCharge(a, ax, ay);
        if (b) spawnSourceCharge(b, bx, by);
        await Promise.all([
          pulseTileView(a, 1.18, 88, 108),
          b ? pulseTileView(b, 1.18, 88, 108) : Promise.resolve(),
        ]);

        spawnConnector();
        await wait(250);

        void showBoardDimmer(0.12, 620);
        spawnBlastCore();
        impactShake("medium", gold);
        await wait(200);

        targetTiles.forEach((t, i) => {
          markGoldenTarget(t, Math.min(300, i * (targetTiles.length > 35 ? 5 : 7)));
        });

        targetTiles.forEach((t, i) => {
          popGoldenTarget(t, i, Math.min(430, i * (targetTiles.length > 35 ? 7 : 10)));
        });

        await wait(620);
        luxuryParticleBurst(["sparkle", "star", "spark"], cx, cy, 12, tileSize * 0.82, tileSize * 0.12, gold, 320);
        await wait(210);
      };

      const playMassiveGoldenClear = async (a: Tile, b?: Tile, swipeDir?: GoldenDir) => {
        playSfx("golden");
        queueTimer(() => playSfx("chain"), 220);

        const primaryDir: GoldenDir = swipeDir ?? a.goldenDir ?? "h";
        const secondaryDir: GoldenDir = primaryDir === "h" ? "v" : "h";
        const secondOrigin = b ?? a;
        const clear = new Set<number>();
        addGoldenCells(clear, a, primaryDir);
        addGoldenCells(clear, secondOrigin, secondaryDir);
        if (canClearCell(a.r, a.c)) clear.add(idx(a.r, a.c));
        if (canClearCell(secondOrigin.r, secondOrigin.c)) clear.add(idx(secondOrigin.r, secondOrigin.c));

        const activated = new Set<number>([a.id]);
        if (b) activated.add(b.id);

        addBoardBannerText("Golden Rush!", "golden", { priority: 8, palette: "gold" });
        impactShake("medium", 0xffd978);
        await Promise.all([
          pulseTileView(a, 1.18, 58, 76),
          b ? pulseTileView(b, 1.18, 58, 76) : Promise.resolve(),
        ]);

        const firstLine = withTimeout(playGoldenFlash(a, primaryDir), 1200, "golden golden first line timeout");
        await wait(72);
        const secondLine = withTimeout(playGoldenFlash(secondOrigin, secondaryDir), 1200, "golden golden second line timeout");
        await settleFxJobs([firstLine, secondLine], "golden double-line combo");
        await wait(36);

        const didClear = await clearCells(clear, idx(a.r, a.c), BONUS_GOLDEN * 2, undefined, "none", activated);
        if (!didClear) console.warn("Rune Rush Golden + Golden clear had no valid double-line cells", { primaryDir, secondaryDir });
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
        addParticleFx(p);
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
        addBeamFx(core);
        premiumGlow(core, color, 420, 1.25);

        const glow = new Graphics();
        glow.circle(x, y, tileSize * 0.18 * power);
        glow.fill({ color, alpha: 0.18 });
        glow.blendMode = "add" as any;
        addGlowFx(glow);

        const count = Math.max(isMobileView ? 8 : 12, Math.min(isMobileView ? 14 : 24, fxCount(16 * intensity)));
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
            .then(() => destroyFxChild(p));
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
          addBeamFx(streak);
          Promise.all([
            gsapTo(streak.scale, { x: 1, y: 1.25 }, 240, "power4.out"),
            gsapTo(streak, { alpha: 0, rotation: angle + 0.18 }, 260, "power3.out"),
          ]).then(() => destroyFxChild(streak));
        }

        Promise.all([
          gsapTo(core.scale, { x: 1.65 * power, y: 1.65 * power }, 210, "power4.out"),
          gsapTo(core, { alpha: 0 }, 210, "power3.out"),
          gsapTo(glow.scale, { x: 4.2 * power, y: 4.2 * power }, 300, "power4.out"),
          gsapTo(glow, { alpha: 0 }, 300, "power3.out"),
        ]).then(() => {
          destroyFxChild(core);
          destroyFxChild(glow);
        });
      };

      const lotusTargetGlowPop = (x: number, y: number, color = 0xffd7f4, power = 1) => {
        const pop = luxuryGlowParticle(x, y, color, tileSize * 0.16 * power, 0);
        Promise.all([
          gsapTo(pop, { alpha: 0.75 }, 30, "power2.out").then(() => gsapTo(pop, { alpha: 0 }, 110, "power2.out")),
          gsapTo(pop.scale, { x: 1.45, y: 1.45 }, 145, "back.out(1.35)"),
        ]).then(() => destroyFxChild(pop));
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
          addClearFx(ring);

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
            addParticleFx(spark);
            Promise.all([
              gsapTo(spark.scale, { x: 1.08, y: 1.08 }, 115, "power3.out"),
              gsapTo(spark, { alpha: 0, x: x + Math.cos(angle) * tileSize * 0.43, y: y + Math.sin(angle) * tileSize * 0.43 }, 165, "power2.out"),
            ]).then(() => destroyFxChild(spark));
          }

          Promise.all([
            gsapTo(ring.scale, { x: 1.16, y: 1.16 }, 165, "power3.out"),
            gsapTo(ring, { alpha: 0 }, 175, "power2.out"),
          ]).then(() => destroyFxChild(ring));
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
          addBeamFx(line);

          const tracer = new Graphics();
          tracer.circle(0, 0, Math.max(1.5, tileSize * 0.045));
          tracer.fill({ color: 0xffffff, alpha: 0.82 });
          tracer.x = fromX;
          tracer.y = fromY;
          tracer.alpha = 0;
          tracer.blendMode = "add" as any;
          addBeamFx(tracer);

          const glint = new Graphics();
          glint.circle(toX, toY, Math.max(1.5, tileSize * 0.062));
          glint.fill({ color, alpha: 0.34 });
          glint.alpha = 0;
          glint.blendMode = "add" as any;
          addClearFx(glint);

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
            destroyFxChild(line);
            destroyFxChild(tracer);
            destroyFxChild(glint);
          });
        }, delay);
      };

      const showLotusRings = async (origin: Tile, color?: Rune, swappedWith?: Tile) => {
        const chosenColor = color && PALETTE.includes(color) ? color : origin.color;
        const targets = tiles.filter((t) => t.color === chosenColor && t.id !== origin.id && canClearTile(t));
        const { x, y } = xy(origin.r, origin.c);
        const cx = x + tileSize / 2;
        const cy = y + tileSize / 2;
        const mainColor = RUNE_GLOW[chosenColor] ?? RUNE_GLOW.lotus;
        const lotusPink = 0xffd7f4;
        const lotusGold = 0xfff0b8;

        const ordered = targets
          .slice()
          .sort((a, b) => {
            if (swappedWith && a.id === swappedWith.id) return -1;
            if (swappedWith && b.id === swappedWith.id) return 1;
            const da = Math.abs(a.r - origin.r) + Math.abs(a.c - origin.c);
            const db = Math.abs(b.r - origin.r) + Math.abs(b.c - origin.c);
            return da - db;
          });

        const centerOf = (t: Tile) => {
          const p = xy(t.r, t.c);
          return { x: p.x + tileSize / 2, y: p.y + tileSize / 2 };
        };

        const spawnLotusVine = (toX: number, toY: number, delay = 0, strong = false) => {
          queueTimer(() => {
            if (cancelled) return;
            const bend = tileSize * (0.16 + Math.random() * 0.22);
            const mx = (cx + toX) / 2 + (Math.random() > 0.5 ? 1 : -1) * bend;
            const my = (cy + toY) / 2 - tileSize * (0.18 + Math.random() * 0.22);

            const glow = new Graphics();
            glow.moveTo(cx, cy);
            glow.quadraticCurveTo(mx, my, toX, toY);
            glow.stroke({ color: lotusPink, alpha: strong ? 0.30 : 0.22, width: Math.max(3, tileSize * (strong ? 0.055 : 0.042)), cap: "round" } as any);
            glow.blendMode = "add" as any;
            glow.alpha = 0;
            addBeamFx(glow);

            const thread = new Graphics();
            thread.moveTo(cx, cy);
            thread.quadraticCurveTo(mx, my, toX, toY);
            thread.stroke({ color: 0xffffff, alpha: strong ? 0.58 : 0.42, width: Math.max(1.2, tileSize * 0.016), cap: "round" } as any);
            thread.blendMode = "add" as any;
            thread.alpha = 0;
            addBeamFx(thread);

            const tracer = new Graphics();
            tracer.circle(0, 0, tileSize * (strong ? 0.060 : 0.048));
            tracer.fill({ color: strong ? lotusGold : 0xffffff, alpha: 0.86 });
            tracer.x = cx;
            tracer.y = cy;
            tracer.alpha = 0;
            tracer.blendMode = "add" as any;
            addBeamFx(tracer);

            const drift = (from: number, control: number, to: number, t: number) => (1 - t) * (1 - t) * from + 2 * (1 - t) * t * control + t * t * to;
            const glimmerCount = strong ? 4 : 2;
            for (let i = 0; i < glimmerCount; i++) {
              const t = (i + 1) / (glimmerCount + 1);
              const spark = luxuryGlowParticle(drift(cx, mx, toX, t), drift(cy, my, toY, t), i % 2 ? lotusPink : lotusGold, tileSize * 0.06, 0);
              queueTimer(() => {
                if (cancelled) return;
                Promise.all([
                  gsapTo(spark, { alpha: 0.62 }, 45, "power2.out").then(() => gsapTo(spark, { alpha: 0 }, 150, "power2.out")),
                  gsapTo(spark.scale, { x: 1.35, y: 1.35 }, 190, "power3.out"),
                ]).then(() => destroyFxChild(spark));
              }, 36 * i);
            }

            Promise.all([
              gsapTo(glow, { alpha: 1 }, 72, "power2.out").then(() => gsapTo(glow, { alpha: 0 }, 260, "power2.out")),
              gsapTo(thread, { alpha: 1 }, 56, "power2.out").then(() => gsapTo(thread, { alpha: 0 }, 215, "power2.out")),
              gsapTo(tracer, { alpha: 0.88, x: toX, y: toY }, strong ? 155 : 135, "power3.out")
                .then(() => gsapTo(tracer, { alpha: 0 }, 70, "power2.out")),
            ]).then(() => {
              destroyFxChild(glow);
              destroyFxChild(thread);
              destroyFxChild(tracer);
            });
          }, delay);
        };

        const spawnLotusLightCrack = (x: number, y: number, tint: number, delay = 0) => {
          queueTimer(() => {
            if (cancelled) return;
            const crack = new Graphics();
            crack.x = x;
            crack.y = y;
            crack.alpha = 0.9;
            crack.blendMode = "add" as any;
            for (let i = 0; i < 3; i++) {
              const a = (Math.PI * 2 * i) / 3 + (Math.random() - 0.5) * 0.56;
              const len = tileSize * (0.15 + Math.random() * 0.08);
              crack.moveTo(Math.cos(a) * len * 0.16, Math.sin(a) * len * 0.16);
              crack.lineTo(Math.cos(a) * len, Math.sin(a) * len);
            }
            crack.stroke({ color: tint, alpha: 0.58, width: Math.max(1.0, tileSize * 0.014), cap: "round" } as any);
            addClearFx(crack);
            Promise.all([
              gsapTo(crack.scale, { x: 1.34, y: 1.34 }, 150, "power3.out"),
              gsapTo(crack, { alpha: 0 }, 165, "power2.out"),
            ]).then(() => destroyFxChild(crack));
          }, delay);
        };

        const popLotusTile = (t: Tile, delay = 0, strong = false) => {
          queueTimer(() => {
            if (cancelled) return;
            const tv = tileViews.get(t.id);
            const p = centerOf(t);
            instantHiddenSpecialIds.add(t.id);
            lotusTargetGlowPop(p.x, p.y, strong ? lotusGold : mainColor, strong ? 0.96 : 0.72);
            candySparkBurst(p.x, p.y, strong ? lotusGold : mainColor, strong ? 0.62 : 0.42);
            luxuryParticleBurst(["spark", "sparkle", "star"], p.x, p.y, strong ? 7 : 4, tileSize * 0.28, tileSize * 0.10, strong ? lotusGold : lotusPink, 210);
            if (strong || t.id % 2 === 0) lotusPetalExplosion(p.x, p.y, lotusPink, strong ? 0.46 : 0.34, 0.34, false);
            spawnLotusLightCrack(p.x, p.y, strong ? lotusGold : lotusPink, 0);

            if (!tv) return;
            tv.busy = true;
            try {
              gsap.killTweensOf(tv.wrap);
              gsap.killTweensOf(tv.wrap.scale);
            } catch {}

            const jitter = tileSize * (strong ? 0.030 : 0.022);
            Promise.all([
              gsapTo(tv.wrap, { x: tv.baseX + jitter, y: tv.baseY - jitter * 0.55 }, 26, "power2.out")
                .then(() => gsapTo(tv.wrap, { x: tv.baseX - jitter * 0.55, y: tv.baseY + jitter * 0.35 }, 28, "power2.out"))
                .then(() => gsapTo(tv.wrap, { x: tv.baseX, y: tv.baseY }, 28, "power2.out")),
              gsapTo(tv.wrap.scale, { x: strong ? 1.15 : 1.10, y: strong ? 1.15 : 1.10 }, 38, "back.out(1.45)")
                .then(() => gsapTo(tv.wrap.scale, { x: 0.42, y: 0.42 }, 100, "power3.in")),
              gsapTo(tv.wrap, { alpha: 0 }, 120, "power2.in"),
            ]).then(() => {
              tv.wrap.alpha = 0;
              tv.wrap.scale.set(0.42);
              tv.busy = false;
            });
          }, delay);
        };

        impactShake("tiny", lotusPink);
        void showBoardDimmer(0.085, 340);
        premiumGlow(tileViews.get(origin.id)?.wrap, lotusPink, 860, 1.6);
        spawnGuaranteedLotusTargetMarker(cx, cy, lotusPink, 1.0, true, 0);
        lotusLuxuryGlowBurst(cx, cy, lotusPink, 0.78, 0.75);
        await wait(90);

        queueTimer(() => {
          if (cancelled) return;
          void pulseTileView(origin, 1.15, 52, 60);
          rareLotusBloom(cx, cy, lotusPink, 0.64, 0.62);
        }, 80);
        await pulseTileView(origin, 1.20, 56, 62);
        lotusLuxuryGlowBurst(cx, cy, lotusPink, 1.08, 1.1);
        luxuryParticleBurst(["sparkle", "star", "magic", "sparkle"], cx, cy, isBaseMiniApp ? 8 : 13, tileSize * 0.72, tileSize * 0.14, lotusPink, 260);
        candyFlashPop(cx, cy, lotusPink, 0.92);
        await wait(70);

        ordered.forEach((t, i) => {
          const p = centerOf(t);
          const isSwapTarget = !!swappedWith && swappedWith.id === t.id;
          const delay = Math.min(160, i * (ordered.length > 24 ? 6 : 9));
          queueTimer(() => {
            if (cancelled) return;
            spawnGuaranteedLotusTargetMarker(p.x, p.y, mainColor, isSwapTarget ? 1.05 : 0.74, isSwapTarget, 0);
            lotusSparkleTargetRing(p.x, p.y, mainColor, 0);
            lotusTargetGlowPop(p.x, p.y, mainColor, isSwapTarget ? 0.92 : 0.64);
            premiumGlow(tileViews.get(t.id)?.wrap, isSwapTarget ? lotusGold : mainColor, 820, isSwapTarget ? 1.05 : 0.74);
            if (isSwapTarget || i % 3 === 0) candySparkBurst(p.x, p.y, mainColor, isSwapTarget ? 0.42 : 0.20);
            if (isSwapTarget || i % 4 === 0) luxuryParticleBurst(["sparkle", "star"], p.x, p.y, isSwapTarget ? 5 : 3, tileSize * 0.20, tileSize * 0.08, isSwapTarget ? lotusGold : lotusPink, 160);
            const tv = tileViews.get(t.id);
            if (tv) {
              const up = isSwapTarget ? 1.18 : 1.09;
              gsapTo(tv.wrap.scale, { x: up, y: up }, 46, "back.out(1.5)")
                .then(() => gsapTo(tv.wrap.scale, { x: 1, y: 1 }, 56, "power3.out"));
            }
          }, delay);
        });
        await wait(170);

        ordered.forEach((t, i) => {
          const p = centerOf(t);
          const isSwapTarget = !!swappedWith && swappedWith.id === t.id;
          const beamDelay = Math.min(260, i * (ordered.length > 24 ? 9 : 14));
          lotusCandyZap(cx, cy, p.x, p.y, isSwapTarget ? lotusGold : mainColor, beamDelay);
          spawnLotusVine(p.x, p.y, beamDelay + 10, isSwapTarget);
        });
        await wait(270);

        ordered.forEach((t, i) => {
          const isSwapTarget = !!swappedWith && swappedWith.id === t.id;
          popLotusTile(t, Math.min(280, i * (ordered.length > 24 ? 8 : 13)), isSwapTarget);
        });
        queueTimer(() => popLotusTile(origin, 230, true), 0);
        await wait(290);

        rareLotusBloom(cx, cy, lotusPink, 1.18, 1.28);
        lotusPetalExplosion(cx, cy, lotusPink, 1.05, 1.24, true);
        lotusLuxuryGlowBurst(cx, cy, lotusGold, 0.96, 1.05);
        candyFlashPop(cx, cy, lotusGold, 1.05);
        await wait(130);
      };

      const showRoyalLotusBloom = async (origin: Tile, partner?: Tile) => {
        const { x, y } = xy(origin.r, origin.c);
        const p2 = partner ? xy(partner.r, partner.c) : { x, y };
        const cx = partner ? (x + p2.x) / 2 + tileSize / 2 : x + tileSize / 2;
        const cy = partner ? (y + p2.y) / 2 + tileSize / 2 : y + tileSize / 2;
        const lotusPink = 0xffd7f4;
        const lotusGold = 0xfff0b8;

        const targetTiles = tiles.filter((t) => canClearTile(t)).sort((a, b) => {
          const pa = xy(a.r, a.c);
          const pb = xy(b.r, b.c);
          const da = Math.hypot(pa.x + tileSize / 2 - cx, pa.y + tileSize / 2 - cy);
          const db = Math.hypot(pb.x + tileSize / 2 - cx, pb.y + tileSize / 2 - cy);
          return da - db;
        });

        const popTile = (t: Tile, delay = 0) => {
          queueTimer(() => {
            if (cancelled) return;
            const tv = tileViews.get(t.id);
            const p = xy(t.r, t.c);
            const tx = p.x + tileSize / 2;
            const ty = p.y + tileSize / 2;
            instantHiddenSpecialIds.add(t.id);
            lotusTargetGlowPop(tx, ty, t.special === "lotus" ? lotusPink : lotusGold, 0.72);
            if (t.id % 2 === 0) lotusPetalExplosion(tx, ty, lotusPink, 0.30, 0.28, false);
            luxuryParticleBurst(["spark", "sparkle", "star"], tx, ty, 4, tileSize * 0.26, tileSize * 0.09, t.special === "lotus" ? lotusPink : lotusGold, 190);
            if (!tv) return;
            tv.busy = true;
            try {
              gsap.killTweensOf(tv.wrap);
              gsap.killTweensOf(tv.wrap.scale);
            } catch {}
            Promise.all([
              gsapTo(tv.wrap.scale, { x: 1.12, y: 1.12 }, 52, "back.out(1.45)")
                .then(() => gsapTo(tv.wrap.scale, { x: 0.38, y: 0.38 }, 165, "power3.in")),
              gsapTo(tv.wrap, { alpha: 0 }, 195, "power2.in"),
            ]).then(() => {
              tv.wrap.alpha = 0;
              tv.wrap.scale.set(0.38);
              tv.busy = false;
            });
          }, delay);
        };

        addBoardBannerText("Divine Lotus!", "ultimate", { priority: 10, palette: "pink" });
        premiumGlow(tileViews.get(origin.id)?.wrap, lotusPink, 620, 1.5);
        if (partner) premiumGlow(tileViews.get(partner.id)?.wrap, lotusPink, 620, 1.5);
        await Promise.all([
          pulseTileView(origin, 1.20, 70, 85),
          partner ? pulseTileView(partner, 1.20, 70, 85) : Promise.resolve(),
        ]);

        void showBoardDimmer(0.16, 420);
        lotusLuxuryGlowBurst(cx, cy, lotusPink, 1.22, 1.45);
        queueTimer(() => lotusLuxuryGlowBurst(cx, cy, lotusGold, 1.05, 1.1), 80);
        await wait(190);

        spawnGuaranteedShockwave(cx, cy, lotusPink, 1.50, "lotusLotus");
        rareLotusBloom(cx, cy, lotusPink, 1.28, 1.45);
        lotusPetalExplosion(cx, cy, lotusPink, 1.10, 1.35, true);
        candySparkBurst(cx, cy, lotusPink, 2.1);
        impactShake("large", lotusPink);
        await wait(210);

        const markStep = targetTiles.length > 35 ? 3 : 4;
        targetTiles.forEach((t, i) => {
          const p = xy(t.r, t.c);
          const tx = p.x + tileSize / 2;
          const ty = p.y + tileSize / 2;
          const isLotus = t.id === origin.id || t.id === partner?.id;
          queueTimer(() => {
            if (cancelled) return;
            spawnGuaranteedLotusTargetMarker(tx, ty, isLotus ? lotusPink : lotusGold, isLotus ? 1.04 : 0.70, isLotus, 0);
            if (i % 2 === 0 || isLotus) lotusSparkleTargetRing(tx, ty, isLotus ? lotusPink : lotusGold, 0);
            const tv = tileViews.get(t.id);
            if (tv) {
              gsapTo(tv.wrap.scale, { x: isLotus ? 1.15 : 1.07, y: isLotus ? 1.15 : 1.07 }, 48, "back.out(1.35)")
                .then(() => gsapTo(tv.wrap.scale, { x: 1, y: 1 }, 70, "power3.out"));
            }
          }, Math.min(170, i * markStep));
        });
        await wait(180);

        const popStep = targetTiles.length > 35 ? 8 : 11;
        targetTiles.forEach((t, i) => popTile(t, Math.min(440, i * popStep)));
        await wait(480);

        rareLotusBloom(cx, cy, lotusGold, 1.52, 1.62);
        lotusLuxuryGlowBurst(cx, cy, lotusGold, 1.35, 1.65);
        lotusPetalExplosion(cx, cy, lotusGold, 1.24, 1.42, true);
        candyFlashPop(cx, cy, lotusGold, 1.28);
        await wait(220);
      };

      const playRoyalLotusBloom = async (a: Tile, b?: Tile) => {
        playSfx("lotus");
        queueTimer(() => playSfx("runicClear"), 280);
        queueTimer(() => playSfx("chain"), 520);
        await withTimeout(showRoyalLotusBloom(a, b), 2100, "lotus lotus animation timeout");
        const clear = new Set<number>();
        for (const t of tiles) {
          if (!canClearTile(t)) continue;
          clear.add(idx(t.r, t.c));
        }
        const activated = new Set<number>([a.id]);
        if (b) activated.add(b.id);
        await clearCells(clear, idx(a.r, a.c), BONUS_LOTUS * 5, undefined, "none", activated);
      };

      const playLotus = async (origin: Tile, color: Rune, swappedWith?: Tile) => {
        // Lotus activation uses ORIGINAL_SFX.lotus, which prioritizes /sfx/magic.mp3.
        playSfx("lotus");
        addBoardBannerText("Bloom!", "lotus", { priority: 7, palette: "pink" });
        const chosenColor = PALETTE.includes(color) ? color : origin.color;
        const clear = new Set<number>();
        addLotusCells(clear, origin, chosenColor);

        await withTimeout(showLotusRings(origin, chosenColor, swappedWith), 1750, "lotus animation timeout");
        await clearCells(clear, idx(origin.r, origin.c), BONUS_LOTUS, undefined, "none", new Set([origin.id]));
      };

      const showGoldenLotusEclipse = async (lotus: Tile, golden: Tile, clear: Set<number>) => {
        const p0 = xy(lotus.r, lotus.c);
        const p1 = xy(golden.r, golden.c);
        const lx = p0.x + tileSize / 2;
        const ly = p0.y + tileSize / 2;
        const gx = p1.x + tileSize / 2;
        const gy = p1.y + tileSize / 2;
        const cx = (lx + gx) / 2;
        const cy = (ly + gy) / 2;
        const mainColor = 0xffd978;
        const accentColor = 0xffecb3;

        const scenicRibbon = async () => {
          const ribbon = new Graphics();
          ribbon.moveTo(lx, ly);
          const mx = cx + (Math.random() > 0.5 ? 1 : -1) * tileSize * 0.18;
          const my = cy - tileSize * 0.34;
          ribbon.quadraticCurveTo(mx, my, gx, gy);
          ribbon.stroke({ color: accentColor, alpha: 0.46, width: Math.max(3, tileSize * 0.05) });
          ribbon.blendMode = "add" as any;
          ribbon.alpha = 0;
          addBeamFx(ribbon);

          const ribbonGlow = new Graphics();
          ribbonGlow.moveTo(lx, ly);
          ribbonGlow.quadraticCurveTo(mx, my, gx, gy);
          ribbonGlow.stroke({ color: mainColor, alpha: 0.22, width: Math.max(6, tileSize * 0.09) });
          ribbonGlow.blendMode = "add" as any;
          ribbonGlow.alpha = 0;
          addBeamFx(ribbonGlow);

          const orbCount = Math.max(6, Math.min(10, fxCount(8)));
          for (let i = 0; i < orbCount; i++) {
            const t = (i + 1) / (orbCount + 1);
            const qx = (1 - t) * (1 - t) * lx + 2 * (1 - t) * t * mx + t * t * gx;
            const qy = (1 - t) * (1 - t) * ly + 2 * (1 - t) * t * my + t * t * gy;
            queueTimer(() => {
              const orb = new Graphics();
              orb.circle(qx, qy, tileSize * 0.055);
              orb.fill({ color: i % 2 ? accentColor : 0xffffff, alpha: 0.34 });
              orb.blendMode = "add" as any;
              addParticleFx(orb);
              Promise.all([
                gsapTo(orb.scale, { x: 1.9, y: 1.9 }, 220, "power3.out"),
                gsapTo(orb, { alpha: 0 }, 220, "power3.out"),
              ]).then(() => destroyFxChild(orb));
            }, i * 32);
          }

          await Promise.all([
            gsapTo(ribbon, { alpha: 1 }, 180, "power2.out"),
            gsapTo(ribbonGlow, { alpha: 1 }, 180, "power2.out"),
          ]);
          await wait(220);
          await Promise.all([
            gsapTo(ribbon, { alpha: 0 }, 220, "power2.out"),
            gsapTo(ribbonGlow, { alpha: 0 }, 220, "power2.out"),
          ]);
          destroyFxChild(ribbon);
          destroyFxChild(ribbonGlow);
        };

        void showBoardDimmer(0.09, 620);
        impactShake("medium", mainColor);
        await Promise.all([
          pulseTileView(lotus, 1.18, 54, 72),
          pulseTileView(golden, 1.18, 54, 72),
        ]);

        addBoardBannerText("Golden Lotus!", "golden", { priority: 9, palette: "gold" });
        const scenicHalo = new Graphics();
        scenicHalo.circle(0, 0, tileSize * 0.72);
        scenicHalo.fill({ color: mainColor, alpha: 0.16 });
        scenicHalo.circle(0, 0, tileSize * 0.42);
        scenicHalo.fill({ color: 0xffffff, alpha: 0.10 });
        scenicHalo.x = cx;
        scenicHalo.y = cy;
        scenicHalo.scale.set(0.35);
        addGlowFx(scenicHalo);
        Promise.all([
          gsapTo(scenicHalo.scale, { x: 1.25, y: 1.25 }, 780, "power3.out"),
          gsapTo(scenicHalo, { alpha: 0 }, 820, "power2.out"),
        ]).then(() => destroyFxChild(scenicHalo));
        spawnGuaranteedLotusTargetMarker(lx, ly, mainColor, 1.0, true, 0);
        spawnGuaranteedLotusTargetMarker(gx, gy, mainColor, 1.0, true, 0);
        lotusLuxuryGlowBurst(lx, ly, 0xffd7f4, 0.84, 0.86);
        lotusLuxuryGlowBurst(gx, gy, mainColor, 0.96, 1.0);
        rareLotusBloom(cx, cy, mainColor, 1.06, 1.18);
        lotusPetalExplosion(cx, cy, 0xffead0, 1.0, 1.15, true);
        await scenicRibbon();

        const targets = tiles
          .filter((t) => clear.has(idx(t.r, t.c)) && t.id !== lotus.id && t.id !== golden.id && canClearTile(t))
          .sort((a, b) => {
            const da = Math.min(Math.abs(a.r - lotus.r) + Math.abs(a.c - lotus.c), Math.abs(a.r - golden.r) + Math.abs(a.c - golden.c));
            const db = Math.min(Math.abs(b.r - lotus.r) + Math.abs(b.c - lotus.c), Math.abs(b.r - golden.r) + Math.abs(b.c - golden.c));
            return da - db;
          });

        targets.forEach((t, i) => {
          const delay = Math.min(360, i * 22);
          queueTimer(() => {
            const p = xy(t.r, t.c);
            const tx = p.x + tileSize / 2;
            const ty = p.y + tileSize / 2;
            const distLotus = Math.abs(t.r - lotus.r) + Math.abs(t.c - lotus.c);
            const distGolden = Math.abs(t.r - golden.r) + Math.abs(t.c - golden.c);
            const fromX = distLotus <= distGolden ? lx : gx;
            const fromY = distLotus <= distGolden ? ly : gy;

            spawnGuaranteedLotusTargetMarker(tx, ty, mainColor, 0.92, false, 0);
            lotusCandyZap(fromX, fromY, tx, ty, mainColor, 0);
            lotusTargetBloom(tx, ty, mainColor, 0.94);
            lotusTargetGlowPop(tx, ty, mainColor, 0.64);
            if (i % 3 !== 1) spawnLayeredKennyRingBurst(tx, ty, mainColor, 0.74, 0, targets.length > 22);
            if (i % 2 === 0) lotusPetalExplosion(tx, ty, 0xfff0cf, 0.40, 0.42, false);
            const tv = tileViews.get(t.id);
            if (tv) {
              gsapTo(tv.wrap.scale, { x: 1.12, y: 1.12 }, 46, "back.out(1.4)")
                .then(() => gsapTo(tv.wrap.scale, { x: 1, y: 1 }, 76, "power3.out"));
            }
          }, delay);
        });

        await wait(Math.min(920, targets.length * 22 + 320));
        rareLotusBloom(cx, cy, mainColor, 0.92, 0.86);
        lotusLuxuryGlowBurst(cx, cy, mainColor, 0.82, 0.78);
        candyFlashPop(cx, cy, mainColor, 0.86);
        await wait(60);
      };

      const playGoldenLotusEclipse = async (lotus: Tile, golden: Tile, color: Rune) => {
        playSfx("lotus");
        queueTimer(() => playSfx("golden"), 120);
        queueTimer(() => playSfx("runicClear"), 360);

        // Golden + Lotus is now a real radius power move:
        // clear everything in a 5x5 blast around both swapped specials.
        const clear = cellsInRadius(lotus, golden, 2, "square");
        if (canClearCell(lotus.r, lotus.c)) clear.add(idx(lotus.r, lotus.c));
        if (canClearCell(golden.r, golden.c)) clear.add(idx(golden.r, golden.c));

        await withTimeout(showGoldenLotusEclipse(lotus, golden, clear), 2350, "golden lotus radius animation timeout");
        await clearCells(clear, idx(lotus.r, lotus.c), BONUS_LOTUS + BONUS_GOLDEN * 3, undefined, "none", new Set([lotus.id, golden.id]));
      };

      const spreadFog = () => {
        if (!hasFogGoal || level.objectiveKind === "mixed") return;
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
        await showLevelCompleteNotice();
        playSfx("runicClear");
        queueTimer(() => playSfx("win"), 230);
        addBoardBannerText("RUNIC CLEAR!");
        await wait(650);
        return finishLevelWin();
      };

      let finaleStarted = false;
      let levelCompleteNoticeShown = false;

      const showLevelCompleteNotice = async () => {
        if (levelCompleteNoticeShown) return;
        levelCompleteNoticeShown = true;
        message = "Level Complete";
        hud();
        playSfx("win");
        addBoardBannerText("LEVEL COMPLETE");
        await wait(720);
      };

      const chooseFinaleSpecial = (wave = 0, lotusCreated = 0): { special: Special; rune: Rune } => {
        const roll = Math.random();
        // Runic Clear should visibly transform regular runes into board specials.
        // Golden carries most leftover moves; Lotus appears rarely so the finale stays snappy.
        if (lotusCreated < 2 && ((wave === 0 && roll < 0.30) || roll < 0.16)) return { special: "lotus", rune: "lotus" };
        return { special: "golden", rune: "golden" };
      };

      const shuffleFinaleList = <T,>(items: T[]) => {
        const out = items.slice();
        for (let i = out.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [out[i], out[j]] = [out[j], out[i]];
        }
        return out;
      };

      const finaleQuadrant = (t: Tile) => `${t.r < N / 2 ? 0 : 1}:${t.c < N / 2 ? 0 : 1}`;

      const pickFinaleTargetTiles = (count: number) => {
        const candidates = shuffleFinaleList(
          tiles.filter((t) => t.special === "none" && !fog[idx(t.r, t.c)] && canClearTile(t))
        );
        const picked: Tile[] = [];
        const center = (N - 1) / 2;

        while (picked.length < count && candidates.length) {
          let bestIndex = 0;
          let bestScore = -Infinity;
          const usedQuadrants = new Set(picked.map(finaleQuadrant));

          for (let i = 0; i < candidates.length; i++) {
            const t = candidates[i];
            const minDistance = picked.length
              ? Math.min(...picked.map((p) => Math.abs(p.r - t.r) + Math.abs(p.c - t.c)))
              : 4 + Math.random() * 2;
            const edgeSpread = Math.max(Math.abs(t.r - center), Math.abs(t.c - center));
            const rowColumnPenalty = picked.some((p) => p.r === t.r || p.c === t.c) ? -5 : 0;
            const quadrantBonus = usedQuadrants.has(finaleQuadrant(t)) ? 0 : 10;
            const score = minDistance * 34 + edgeSpread * 7 + rowColumnPenalty + quadrantBonus + Math.random() * 18;
            if (score > bestScore) {
              bestScore = score;
              bestIndex = i;
            }
          }

          const [next] = candidates.splice(bestIndex, 1);
          if (next) picked.push(next);
        }

        return picked;
      };

      const playFinaleConvertFx = async (t: Tile) => {
        // Runic Clear conversion only: regular rune becomes a special, so this uses clickclick.mp3.
        playSfx("convert");
        const p = xy(t.r, t.c);
        const cx = p.x + tileSize / 2;
        const cy = p.y + tileSize / 2;
        const color = t.special === "lotus" ? 0xffd7f4 : t.special === "golden" ? 0xffdc78 : 0xffb76d;

        playSpawnRing(t.r, t.c, t.special);
        candyFlashPop(cx, cy, color, 1.0);
        const flash = new Graphics();
        flash.circle(cx, cy, tileSize * 0.2);
        flash.fill({ color: 0xffffff, alpha: 0.20 });
        flash.blendMode = "add" as any;
        addGlowFx(flash);

        await Promise.all([
          addTween(flash.scale, { x: 1.8, y: 1.8 }, 170, easeOutQuart),
          addTween(flash, { alpha: 0 }, 175, easeOutQuart),
        ]);
        destroyFxChild(flash);
      };

      const activateFinaleSpecial = async (origin: Tile, wave: number) => {
        if (origin.special === "lotus") {
          playSfx("lotus");
          const clear = new Set<number>();
          const color = addLotusCells(clear, origin, origin.color);
          await withTimeout(playChainLotusBurst(origin, color), 620, "runic clear lotus burst timeout");
          await clearCells(clear, idx(origin.r, origin.c), BONUS_LOTUS, undefined, "none", new Set([origin.id]));
          return;
        }
        if (origin.special === "golden") {
          await playGolden(origin, origin.goldenDir ?? (wave % 2 === 0 ? "h" : "v"));
          return;
        }

        await playBomb(origin);
      };

      const runRuneRushFinale = async () => {
        await showLevelCompleteNotice();
        if (finaleStarted) return showRunicClearWin();
        finaleStarted = true;
        phase = "finale";
        const unusedMoves = Math.max(0, moves);
        const stagedMoves = Math.min(isBaseMiniApp ? 4 : isMobileView ? 5 : 6, unusedMoves);
        const bonusOnlyMoves = Math.max(0, unusedMoves - stagedMoves);
        moves = 0;
        combo = Math.max(combo, 1);
        message = unusedMoves > 0 ? "Runic Clear awakens the remaining moves." : "Victory Bloom.";
        playSfx("finale");
        hud();

        addBoardBannerText("RUNIC CLEAR!");
        await wait(unusedMoves > 0 ? 320 : 180);

        if (bonusOnlyMoves > 0) {
          const extraBonus = bonusOnlyMoves * 160;
          score += extraBonus;
          addScorePopup(boardSize / 2, tileSize * 1.55, `+${extraBonus} extra move bonus`, "special");
          hud();
          await wait(90);
        }

        if (stagedMoves <= 0) {
          return showRunicClearWin();
        }

        repairGrid();
        const finaleTargets = pickFinaleTargetTiles(stagedMoves);
        if (!finaleTargets.length) {
          return showRunicClearWin();
        }

        const activationIds: number[] = [];
        let lotusCreated = 0;
        message = `Runic Clear awakens ${finaleTargets.length} runes.`;
        hud();

        const forgeJobs: Promise<void>[] = [];
        for (let i = 0; i < finaleTargets.length; i++) {
          const target = tiles.find((t) => t.id === finaleTargets[i].id);
          if (!target || target.special !== "none" || fog[idx(target.r, target.c)] || !canClearTile(target)) continue;

          const next = chooseFinaleSpecial(i, lotusCreated);
          if (next.special === "lotus") lotusCreated += 1;
          target.special = next.special;
          target.rune = next.rune;
          target.goldenDir = next.special === "golden" ? (Math.random() < 0.5 ? "h" : "v") : undefined;
          spawnedSpecialShieldIds.delete(target.id);
          activationIds.push(target.id);

          applySpecialArtToTile(target, {
            k: idx(target.r, target.c),
            special: target.special,
            rune: target.rune,
            goldenDir: target.goldenDir,
          });

          const forgedCount = activationIds.length;
          forgeJobs.push((async () => {
            await wait(i * (isBaseMiniApp ? 18 : 24));
            message = `Runic Clear forges ${forgedCount}/${finaleTargets.length}`;
            hud();
            await playFinaleConvertFx(target);
          })());
        }

        await settleFxJobs(forgeJobs, "runic clear forge");
        await wait(36);

        let activationsSinceCascade = 0;
        for (let i = 0; i < activationIds.length; i++) {
          const target = tiles.find((t) => t.id === activationIds[i] && t.special !== "none");
          if (!target || fog[idx(target.r, target.c)] || !canClearTile(target)) continue;

          message = `Runic Clear wave ${i + 1}/${activationIds.length}`;
          hud();
          try {
            await activateFinaleSpecial(target, i);
          } catch (err) {
            console.warn("Rune Rush finale activation recovered", err);
            recoverRuntimeBoard("runic clear finale activation recovery", err);
          }
          activationsSinceCascade += 1;

          const shouldSettle = activationsSinceCascade >= 2 || i === activationIds.length - 1;
          if (shouldSettle) {
            // Settle in small batches so Runic Clear stays smooth instead of doing a full
            // match/cascade/refill pass after every single forged special.
            await resolveCascades(null);
            repairGrid();
            refresh();
            activationsSinceCascade = 0;
            await wait(isBaseMiniApp ? 28 : 40);
          } else {
            repairGrid();
            await wait(18);
          }
        }

        if (activationsSinceCascade > 0) {
          await resolveCascades(null);
          repairGrid();
          refresh();
        }

        message = "Victory Bloom complete.";
        hud();
        await wait(220);
        return showRunicClearWin();
      };

      const checkWinFail = async () => {
        const won =
          (!hasScoreGoal || score >= level.targetScore) &&
          (!hasFogGoal || fog.filter(Boolean).length === 0) &&
          (!hasCollectGoal || Object.values(collectRemaining).every((v) => (v ?? 0) <= 0)) &&
          (!hasIngredientGoal || ingredientDropped >= level.ingredientTarget);
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

      const findAvailableMove = () => {
        for (const a of tiles) {
          if (fog[idx(a.r, a.c)] || !canClearTile(a)) continue;
          for (const [dr, dc] of [[0, 1], [1, 0]] as [number, number][]) {
            const b = tiles.find((t) => t.r === a.r + dr && t.c === a.c + dc);
            if (!b || fog[idx(b.r, b.c)] || !canClearTile(b)) continue;
            if (a.special !== "none" || b.special !== "none") return [a, b] as const;
            const ar = a.r, ac = a.c, br = b.r, bc = b.c;
            a.r = br; a.c = bc; b.r = ar; b.c = ac;
            const ok = computeBoardMatches().clear.size > 0;
            a.r = ar; a.c = ac; b.r = br; b.c = bc;
            if (ok) return [a, b] as const;
          }
        }
        return null;
      };

      const forceSimpleMove = () => {
        const canUse = (r: number, c: number) => {
          const t = tileAt(r, c);
          return !!t && !fog[idx(r, c)] && canClearTile(t) && t.special === "none";
        };
        const paint = (cells: { r: number; c: number; color: Rune }[]) => {
          for (const cell of cells) {
            const t = tileAt(cell.r, cell.c);
            if (!t) continue;
            t.color = cell.color;
            t.rune = cell.color;
            t.special = "none";
            t.goldenDir = undefined;
          }
        };

        for (let r = 0; r < N; r++) {
          for (let c = 0; c <= N - 4; c++) {
            if (![0, 1, 2, 3].every((d) => canUse(r, c + d))) continue;
            const a: Rune = "blue";
            const b: Rune = "leaf";
            paint([
              { r, c, color: a },
              { r, c: c + 1, color: a },
              { r, c: c + 2, color: b },
              { r, c: c + 3, color: a },
            ]);
            return true;
          }
        }

        for (let c = 0; c < N; c++) {
          for (let r = 0; r <= N - 4; r++) {
            if (![0, 1, 2, 3].every((d) => canUse(r + d, c))) continue;
            const a: Rune = "spiral";
            const b: Rune = "orange";
            paint([
              { r, c, color: a },
              { r: r + 1, c, color: a },
              { r: r + 2, c, color: b },
              { r: r + 3, c, color: a },
            ]);
            return true;
          }
        }

        return false;
      };

      const reshuffleBoardIfNoMoves = async (initial = false) => {
        if (findAvailableMove()) return false;

        const shuffleTiles = tiles.filter((t) =>
          !fog[idx(t.r, t.c)] &&
          canClearTile(t) &&
          t.special === "none"
        );
        if (shuffleTiles.length < 4) return false;

        const beforeShuffle = new Map<number, { r: number; c: number }>();
        for (const t of tiles) beforeShuffle.set(t.id, { r: t.r, c: t.c });

        const originalCells = shuffleTiles.map((t) => ({ r: t.r, c: t.c }));
        const shuffle = <T,>(items: T[]) => {
          const copy = items.slice();
          for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
          }
          return copy;
        };

        let solved = false;
        for (let attempt = 0; attempt < 42; attempt++) {
          const cells = shuffle(originalCells);
          shuffleTiles.forEach((t, i) => {
            t.r = cells[i].r;
            t.c = cells[i].c;
          });
          if (computeBoardMatches().clear.size === 0 && findAvailableMove()) {
            solved = true;
            break;
          }
        }

        if (!solved) {
          shuffleTiles.forEach((t, i) => {
            t.r = originalCells[i].r;
            t.c = originalCells[i].c;
          });
          for (let attempt = 0; attempt < 80; attempt++) {
            for (const t of shuffleTiles) {
              const color = randRune();
              t.color = color;
              t.rune = color;
              t.special = "none";
              t.goldenDir = undefined;
            }
            if (computeBoardMatches().clear.size === 0 && findAvailableMove()) {
              solved = true;
              break;
            }
          }
        }

        if (!solved) {
          solved = forceSimpleMove();
        }

        spawnedSpecialShieldIds.clear();
        instantHiddenSpecialIds.clear();
        message = "Reshuffle";
        addBoardBannerText("Reshuffle!", "chain", { priority: 6, palette: "gold" });
        hud();
        playSfx("chain");
        await wait(initial ? 80 : 160);

        try {
          drawBoardBack();
          renderTilesForRefill(beforeShuffle);
          renderIngredients();
          renderFog();
          hud();
          await updateTilePositions(true, initial ? 150 : 210, easeInOut);
          luxuryParticleBurst(["sparkle", "star", "spark"], boardSize / 2, boardSize * 0.42, 14, tileSize * 1.2, tileSize * 0.18, 0xffd978, 300);
          candyFlashPop(boardSize / 2, boardSize * 0.42, 0xffd978, 0.84);
          await wait(120);
        } catch (err) {
          console.warn("Rune Rush reshuffle animation recovered", err);
          refillAndRenderBoardSafely(undefined, "reshuffle recovery");
        }

        if (!findAvailableMove()) {
          forceSimpleMove();
          renderBoardSafely(undefined, "reshuffle force move");
        }

        return true;
      };

      const afterMove = async () => {
        // Candy-Crush-style rule: if gravity/refill leaves any 3+ match, auto-clear it before returning control.
        await resolveCascades(null);
        spreadFog();
        fogClearedThisMove = false;
        refillAndRenderBoardSafely(undefined, "after move stable refill");

        if (await checkWinFail()) return;
        await reshuffleBoardIfNoMoves();

        spawnedSpecialShieldIds.clear();
        phase = "idle";
        combo = 0;
        if (message !== "Reshuffle") message = "";
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

        // Once the player starts a new move, spawned specials are normal specials again.
        spawnedSpecialShieldIds.clear();

        const ar = a.r, ac = a.c, br = b.r, bc = b.c;
        const startMoves = moves;
        const ingredientA = activeIngredientAt(ar, ac);
        const ingredientB = activeIngredientAt(br, bc);
        const ingredientSwap = !!ingredientA || !!ingredientB;
        const beforeIngredientSwap = ingredientSwap ? new Map(tiles.map((t) => [t.id, { r: t.r, c: t.c }])) : null;

        try {
          phase = "busy";
          combo = 0;
          playSfx("swap");
          if (!ingredientSwap) moves -= 1;
          message = "";
          if (!ingredientSwap) hud();

          a.r = br; a.c = bc; b.r = ar; b.c = ac;
          if (ingredientA) {
            ingredientA.prevR = ar;
            ingredientA.prevC = ac;
            ingredientA.fallDistance = Math.abs(ar - br) + Math.abs(ac - bc);
            ingredientA.r = br;
            ingredientA.c = bc;
          }
          if (ingredientB) {
            ingredientB.prevR = br;
            ingredientB.prevC = bc;
            ingredientB.fallDistance = Math.abs(ar - br) + Math.abs(ac - bc);
            ingredientB.r = ar;
            ingredientB.c = ac;
          }
          if (ingredientSwap && beforeIngredientSwap) {
            drawBoardBack();
            renderTiles(beforeIngredientSwap);
            renderIngredients();
            renderFog();
          }
          await updateTilePositions(true, SWAP_MS, easeInOut);

          if (ingredientSwap) {
            moves = startMoves;
            playSfx("bad");
            const returnStart = new Map(tiles.map((t) => [t.id, { r: t.r, c: t.c }]));
            a.r = ar; a.c = ac; b.r = br; b.c = bc;
            if (ingredientA) {
              ingredientA.prevR = br;
              ingredientA.prevC = bc;
              ingredientA.fallDistance = 1;
              ingredientA.r = ar;
              ingredientA.c = ac;
            }
            if (ingredientB) {
              ingredientB.prevR = ar;
              ingredientB.prevC = ac;
              ingredientB.fallDistance = 1;
              ingredientB.r = br;
              ingredientB.c = bc;
            }
            drawBoardBack();
            renderTiles(returnStart);
            renderIngredients();
            renderFog();
            await updateTilePositions(true, SWAP_MS + 10, easeSoftBack);
            await wait(12);
            message = "Ingredients drop by clearing below them";
            phase = "idle";
            combo = 0;
            hud();
            return;
          }

          const movedA = tileAt(br, bc) ?? a;
          const movedB = tileAt(ar, ac) ?? b;
          const swapDir: GoldenDir = ar === br ? "h" : "v";
          const movedACell = idx(movedA.r, movedA.c);
          const movedBCell = idx(movedB.r, movedB.c);

          if (movedA.special === "lotus" && movedB.special === "lotus") {
            await playRoyalLotusBloom(movedA, movedB);
            await afterMove();
            return;
          }
          if (movedA.special === "golden" && movedB.special === "golden") {
            await playMassiveGoldenClear(movedA, movedB, swapDir);
            await afterMove();
            return;
          }
          if (movedA.special === "lotus" && movedB.special === "golden") {
            await playGoldenLotusEclipse(movedA, movedB, movedB.color);
            await afterMove();
            return;
          }
          if (movedB.special === "lotus" && movedA.special === "golden") {
            await playGoldenLotusEclipse(movedB, movedA, movedA.color);
            await afterMove();
            return;
          }
          if (movedA.special !== "none" && movedB.special !== "none") {
            const clear = new Set<number>([movedACell, movedBCell]);
            await clearCells(clear, movedACell, BONUS_GOLDEN, undefined, "none");
            await afterMove();
            return;
          }
          if (movedA.special === "lotus" && movedB.special === "none") {
            await playLotus(movedA, movedB.color, movedB);
            await afterMove();
            return;
          }
          if (movedB.special === "lotus" && movedA.special === "none") {
            await playLotus(movedB, movedA.color, movedA);
            await afterMove();
            return;
          }
          if (movedA.special === "golden" && movedB.special === "none") {
            await playGolden(movedA, swapDir);
            await afterMove();
            return;
          }
          if (movedB.special === "golden" && movedA.special === "none") {
            await playGolden(movedB, swapDir);
            await afterMove();
            return;
          }
          if (movedA.special === "bomb" && movedB.special === "none") {
            await playBomb(movedA);
            await afterMove();
            return;
          }
          if (movedB.special === "bomb" && movedA.special === "none") {
            await playBomb(movedB);
            await afterMove();
            return;
          }
          const m = computeBoardMatches();
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

          const seed = chooseSpawn(m, [movedACell, movedBCell]);
          const clearSet = new Set(m.clear);
          const focus = seed?.k ?? movedACell;
          await clearCells(clearSet, focus, 0, seed ?? undefined);
          await afterMove();
        } catch (err) {
          console.warn("Rune Rush swap recovered", err);
          a.r = ar; a.c = ac; b.r = br; b.c = bc;
          if (ingredientA) {
            ingredientA.r = ar;
            ingredientA.c = ac;
            ingredientA.prevR = undefined;
            ingredientA.prevC = undefined;
            ingredientA.fallDistance = undefined;
          }
          if (ingredientB) {
            ingredientB.r = br;
            ingredientB.c = bc;
            ingredientB.prevR = undefined;
            ingredientB.prevC = undefined;
            ingredientB.fallDistance = undefined;
          }
          moves = startMoves;
          phase = "idle";
          message = "Move reset";
          refillAndRenderBoardSafely(undefined, "swap recovery");
          await updateTilePositions(false);
          hud();
        }
      };

      const findHint = () => {
        return findAvailableMove();
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
        for (const child of [...board.children]) {
          const fx = child as any;
          if (!fx || fx.destroyed || fx._destroyed) continue;
          try {
          if (fx.__goalHolePulse !== undefined) {
            const phaseNum = Number(fx.__goalHolePulse ?? 0);
            fx.alpha = 0.76 + Math.sin(elapsed * 2.05 + phaseNum) * 0.18;
            const sx = 1 + Math.sin(elapsed * 1.7 + phaseNum) * 0.045;
            const sy = 1 + Math.cos(elapsed * 1.55 + phaseNum) * 0.035;
            fx.scale.set(sx, sy);
          } else if (fx.__goalHoleParticle !== undefined) {
            const phaseNum = Number(fx.__goalHoleParticle ?? 0);
            const baseX = Number(fx.__goalHoleBaseX ?? fx.x);
            const baseY = Number(fx.__goalHoleBaseY ?? fx.y);
            const rise = (Math.sin(elapsed * 1.3 + phaseNum) + 1) * 0.5;
            fx.x = baseX + Math.sin(elapsed * 1.8 + phaseNum) * tileSize * 0.025;
            fx.y = baseY - rise * tileSize * 0.16;
            fx.alpha = 0.16 + (1 - rise) * 0.26;
          }
          } catch {}
        }
        for (const child of [...ingredientLayer.children]) {
          const cont = child as Container & Record<string, any>;
          if (!cont || (cont as any).destroyed || (cont as any)._destroyed) continue;
          try {
          if (dragState?.kind === "ingredient" && dragState.id === Number(cont.__ingredientId)) continue;
          const baseX = cont.__ingredientFloatBaseX;
          const baseY = cont.__ingredientFloatBaseY;
          if (typeof baseX !== "number" || typeof baseY !== "number") continue;
          const phaseNum = Number(cont.__ingredientFloatPhase ?? 0);
          const isKey = cont.__ingredientFloatKind === "key";
          const floatX = baseX + Math.cos(elapsed * 1.18 + phaseNum) * tileSize * 0.012;
          const floatY = baseY + Math.sin(elapsed * 1.85 + phaseNum) * tileSize * 0.046;
          let breathe = 1 + Math.sin(elapsed * 2.05 + phaseNum) * 0.016;
          const landingMs = Number(cont.__ingredientLandingMs ?? 0);
          if (landingMs > 0 && typeof cont.__ingredientLandingFromX === "number" && typeof cont.__ingredientLandingFromY === "number") {
            cont.__ingredientLandingAge = Number(cont.__ingredientLandingAge ?? 0) + dt;
            const p = clamp(cont.__ingredientLandingAge / landingMs, 0, 1);
            const e = p < 0.78 ? 0.90 * Math.pow(p / 0.78, 2.45) : 0.90 + easeOutCubic((p - 0.78) / 0.22) * 0.10;
            const settleDip = p > 0.78 ? Math.sin(((p - 0.78) / 0.22) * Math.PI) * tileSize * 0.035 : 0;
            cont.x = cont.__ingredientLandingFromX + (floatX - cont.__ingredientLandingFromX) * e;
            cont.y = cont.__ingredientLandingFromY + (floatY - cont.__ingredientLandingFromY) * e + settleDip;
            breathe += (1 - p) * 0.026;
            if (p >= 1) {
              delete cont.__ingredientLandingFromX;
              delete cont.__ingredientLandingFromY;
              delete cont.__ingredientLandingAge;
              delete cont.__ingredientLandingMs;
            }
          } else {
            cont.x = floatX;
            cont.y = floatY;
          }
          cont.scale.set(breathe);
          cont.rotation = Math.sin(elapsed * 1.32 + phaseNum) * (isKey ? 0.018 : 0.012);
          for (const fx of [...cont.children]) {
            if (!fx || (fx as any).destroyed || (fx as any)._destroyed) continue;
            if ((fx as any).__ingredientGlint) {
              fx.alpha = 0.42 + Math.sin(elapsed * 2.55 + phaseNum) * 0.18;
              fx.rotation = Math.sin(elapsed * 1.1 + phaseNum) * 0.12;
            } else if ((fx as any).__ingredientAura) {
              fx.alpha = 0.62 + Math.sin(elapsed * 1.65 + phaseNum) * 0.16;
              fx.scale.set(1 + Math.sin(elapsed * 1.25 + phaseNum) * 0.035);
            } else if ((fx as any).__ingredientShimmer) {
              fx.alpha = 0.34 + Math.sin(elapsed * 2.9 + phaseNum) * 0.20;
              fx.rotation = Math.sin(elapsed * 1.5 + phaseNum) * (isKey ? 0.10 : 0.18);
            }
          }
          } catch {}
        }
        for (const child of [...fogLayer.children]) {
          const cont = child as Container;
          if (!cont || (cont as any).destroyed || (cont as any)._destroyed) continue;
          for (const puff of [...cont.children]) {
            if (!puff || (puff as any).destroyed || (puff as any)._destroyed) continue;
            try {
            if ((puff as any).__fogPhase === undefined) continue;
            const phaseNum = ((puff as any).__fogPhase ?? 0) as number;
            puff.x = Math.sin(elapsed * 1.45 + phaseNum) * tileSize * 0.09;
            puff.y = Math.cos(elapsed * 1.15 + phaseNum) * tileSize * 0.07;
            puff.alpha = 0.24 + Math.sin(elapsed * 1.8 + phaseNum) * 0.065;
            } catch {}
          }
        }
      });

      hintTimer = setInterval(playHint, 900);
      refresh();
      hud();
      void (async () => {
        if (cancelled || phase !== "idle") return;
        phase = "busy";
        const didShuffle = await reshuffleBoardIfNoMoves(true);
        phase = "idle";
        if (!didShuffle) message = "";
        hud();
      })();
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
      runtimeCleanup?.();
      clearAllTimers();
      if (hintTimer) clearInterval(hintTimer);
      try {
        app?.ticker?.stop();
        killAllPixiTweens?.();
        const oldStageChildren = app?.stage?.removeChildren?.() ?? [];
        for (const child of oldStageChildren as any[]) {
          try { child?.destroy?.({ children: true }); } catch {
            try { child?.destroy?.(); } catch {}
          }
        }
        (app as any)?.destroy?.(true, { children: true, texture: false, textureSource: false });
      } catch {
        try { app?.renderer?.destroy(); } catch {}
      }
      if (host) host.innerHTML = "";
    };
  }, [levelIndex]);

  return <div ref={hostRef} className="pixiHost" />;
}
