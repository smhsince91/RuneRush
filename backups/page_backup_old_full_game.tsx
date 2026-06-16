"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Rune = "blue" | "spiral" | "orange" | "triangle" | "leaf" | "golden" | "lotus";
type Special = "none" | "golden" | "lotus";
type Phase = "idle" | "busy" | "victory" | "win" | "fail" | "outoflives";

type Tile = {
  id: string;
  r: number;
  c: number;
  color: Rune;
  rune: Rune;
  special: Special;
};

type FogCell = { hp: 1 };

type Objective =
  | { kind: "score"; targetScore: number }
  | { kind: "clearFogAll"; startCount: number }
  | { kind: "collect"; target: Partial<Record<Rune, number>> };

type Level = {
  idx: number;
  size: number;
  moves: number;
  palette: Rune[];
  fog: { enabled: boolean; startCount: number; spreadEachTurn: number };
  objective: Objective;
};

type FloatingText = {
  id: string;
  x: number;
  y: number;
  text: string;
  kind: "points" | "combo" | "special";
};

type PowerLine = { id: string; dir: "h" | "v" | "cross"; r: number; c: number };
type LotusFx = { id: string; r: number; c: number; mega?: boolean };
type SpawnFx = { id: string; r: number; c: number; kind: Special };
type PopCell = { r: number; c: number; delay: number; mode: "match" | "golden" | "lotus" };

const N = 7;
const GAP = 6;
const PAD = 8;
const COLORS: Rune[] = ["blue", "spiral", "orange", "triangle", "leaf"];

const MAX_LIVES = 7;
const LIFE_REGEN_MS = 2 * 60 * 60 * 1000;

const PTS_PER_TILE = 7;
const BONUS_GOLDEN = 90;
const BONUS_LOTUS = 260;
const BONUS_COMBO = 38;

const SWAP_MS = 78;
const BAD_SWAP_MS = 88;
const DROP_MS = 118;
const POP_MS = 125;
const CASCADE_PAUSE_MS = 34;
const GOLD_CHARGE_MS = 38;
const GOLD_SWEEP_MS = 270;
const LOTUS_CHARGE_MS = 235;
const LOTUS_FLASH_MS = 145;
const HINT_IDLE_MS = 7500;
const HINT_REPEAT_MS = 4600;
const HINT_DURATION_MS = 980;
const MAX_VICTORY_STEPS = 7;

const LS_VERSION = "runerush.version";
const CODE_VERSION = "obsidian-consistency-v26-clean-bg-sharp-tiles";
const LS_LEVEL = "runerush.level";
const LS_MAX_UNLOCKED = "runerush.maxUnlocked";
const LS_LIVES = "runerush.lives";
const LS_LIFE_TS = "runerush.lifeTs";
const LS_SOUND = "runerush.soundOn";

const clamp = (num: number, a: number, b: number) => Math.max(a, Math.min(b, num));
const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);
const idx = (n: number, r: number, c: number) => r * n + c;
const rcFromIdx = (n: number, i: number) => ({ r: Math.floor(i / n), c: i % n });
const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));
const imgRune = (r: Rune) => `/runes/${r}.png`;
const neighbors = (a: Tile, b: Tile) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;

function seededPick(seed: number, max: number) {
  const x = Math.sin(seed * 999.123) * 10000;
  return Math.abs(Math.floor(x)) % max;
}

function shuffleSeeded<T>(arr: T[], seed: number) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = seededPick(seed + i * 31, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function runeFallbackText(r: Rune) {
  if (r === "blue") return "◆";
  if (r === "spiral") return "◎";
  if (r === "orange") return "▣";
  if (r === "triangle") return "△";
  if (r === "leaf") return "❧";
  if (r === "golden") return "✦";
  return "✹";
}

function getLevel(levelIndex: number): Level {
  const num = levelIndex + 1;
  const palette = COLORS;

  const scoreMoves = clamp(17 - Math.floor(num * 0.28), 11, 17);
  const collectMoves = clamp(19 - Math.floor(num * 0.24), 12, 19);
  const fogMoves = clamp(20 - Math.floor(num * 0.22), 13, 20);

  const fogLevel = num >= 4 && (num % 5 === 4 || num % 7 === 0);
  const collectLevel = !fogLevel && num >= 2 && (num % 3 === 2 || num % 6 === 0);

  if (fogLevel) {
    const fogStart = clamp(6 + Math.floor(num * 0.8), 6, 24);
    return {
      idx: levelIndex,
      size: N,
      moves: fogMoves,
      palette,
      fog: { enabled: true, startCount: fogStart, spreadEachTurn: num >= 15 ? 2 : 1 },
      objective: { kind: "clearFogAll", startCount: fogStart },
    };
  }

  if (collectLevel) {
    const picks = shuffleSeeded(palette, num * 17 + 9);
    const first = picks[0];
    const second = picks[1];
    const base = clamp(10 + Math.floor(num * 0.9), 10, 30);
    const target: Partial<Record<Rune, number>> = { [first]: base };
    if (num >= 8 && second) target[second] = Math.max(7, Math.floor(base * 0.62));
    return {
      idx: levelIndex,
      size: N,
      moves: collectMoves,
      palette,
      fog: { enabled: false, startCount: 0, spreadEachTurn: 0 },
      objective: { kind: "collect", target },
    };
  }

  const targetScore = clamp(950 + (num - 1) * 280, 950, 999999);
  return {
    idx: levelIndex,
    size: N,
    moves: scoreMoves,
    palette,
    fog: { enabled: false, startCount: 0, spreadEachTurn: 0 },
    objective: { kind: "score", targetScore },
  };
}

function makeInitialTiles(n: number, palette: Rune[]) {
  const grid: (Tile | null)[] = new Array(n * n).fill(null);
  const get = (r: number, c: number) => grid[idx(n, r, c)];
  const randColor = () => palette[Math.floor(Math.random() * palette.length)] ?? palette[0];

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      let color = randColor();
      let guard = 0;
      while (
        guard++ < 25 &&
        ((c >= 2 && get(r, c - 1)?.color === color && get(r, c - 2)?.color === color) ||
          (r >= 2 && get(r - 1, c)?.color === color && get(r - 2, c)?.color === color))
      ) {
        color = randColor();
      }
      grid[idx(n, r, c)] = { id: uid(), r, c, color, rune: color, special: "none" };
    }
  }
  return grid.filter(Boolean) as Tile[];
}

function initFog(n: number, count: number) {
  const arr: (FogCell | null)[] = new Array(n * n).fill(null);
  if (count <= 0) return arr;
  const safeCenter = new Set([idx(n, 2, 2), idx(n, 2, 3), idx(n, 2, 4), idx(n, 3, 2), idx(n, 3, 3), idx(n, 3, 4), idx(n, 4, 2), idx(n, 4, 3), idx(n, 4, 4)]);
  const spots = [...Array(n * n)].map((_, i) => i).filter((i) => !safeCenter.has(i));
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  for (let k = 0; k < Math.min(count, spots.length); k++) arr[spots[k]] = { hp: 1 };
  return arr;
}

function computeMatches(n: number, grid: (Tile | null)[], fog: (FogCell | null)[]) {
  const clearSet = new Set<number>();
  const hRun = new Array(n * n).fill(0);
  const vRun = new Array(n * n).fill(0);
  const blocked = (r: number, c: number) => !!fog[idx(n, r, c)];

  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (blocked(r, c)) {
        c++;
        continue;
      }
      const t = grid[idx(n, r, c)];
      if (!t || t.special !== "none") {
        c++;
        continue;
      }
      const color = t.color;
      let end = c + 1;
      while (end < n) {
        if (blocked(r, end)) break;
        const u = grid[idx(n, r, end)];
        if (!u || u.special !== "none" || u.color !== color) break;
        end++;
      }
      const len = end - c;
      if (len >= 3) {
        for (let cc = c; cc < end; cc++) {
          const k = idx(n, r, cc);
          clearSet.add(k);
          hRun[k] = len;
        }
      }
      c = end;
    }
  }

  for (let c = 0; c < n; c++) {
    let r = 0;
    while (r < n) {
      if (blocked(r, c)) {
        r++;
        continue;
      }
      const t = grid[idx(n, r, c)];
      if (!t || t.special !== "none") {
        r++;
        continue;
      }
      const color = t.color;
      let end = r + 1;
      while (end < n) {
        if (blocked(end, c)) break;
        const u = grid[idx(n, end, c)];
        if (!u || u.special !== "none" || u.color !== color) break;
        end++;
      }
      const len = end - r;
      if (len >= 3) {
        for (let rr = r; rr < end; rr++) {
          const k = idx(n, rr, c);
          clearSet.add(k);
          vRun[k] = len;
        }
      }
      r = end;
    }
  }

  return { clearSet, hRun, vRun };
}

function classifySpawnAt(h: number, v: number) {
  const is5 = h >= 5 || v >= 5;
  const isTL = h >= 3 && v >= 3;
  const is4 = (h >= 4 && v < 3) || (v >= 4 && h < 3);
  if (is5 || isTL) return { special: "lotus" as const, rune: "lotus" as const, priority: 3 };
  if (is4) return { special: "golden" as const, rune: "golden" as const, priority: 2 };
  return null;
}

function chooseSeedSpawn(m: ReturnType<typeof computeMatches>, swappedIndexes: number[]) {
  const candidates: { k: number; special: Special; rune: Rune; priority: number; swapped: boolean }[] = [];
  for (const k of Array.from(m.clearSet)) {
    const spawn = classifySpawnAt(m.hRun[k] || 0, m.vRun[k] || 0);
    if (!spawn) continue;
    candidates.push({ k, special: spawn.special, rune: spawn.rune, priority: spawn.priority, swapped: swappedIndexes.includes(k) });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    if (a.swapped !== b.swapped) return a.swapped ? -1 : 1;
    return b.priority - a.priority;
  });
  const best = candidates[0];
  return { k: best.k, special: best.special, rune: best.rune };
}

function repairTiles(n: number, tiles: Tile[], palette: Rune[]) {
  const map = new Map<number, Tile>();
  for (const t of tiles) {
    if (!Number.isFinite(t.r) || !Number.isFinite(t.c)) continue;
    if (t.r < 0 || t.r >= n || t.c < 0 || t.c >= n) continue;
    const k = idx(n, t.r, t.c);
    if (!map.has(k)) map.set(k, t);
  }
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const k = idx(n, r, c);
      if (map.has(k)) continue;
      const color = palette[Math.floor(Math.random() * palette.length)] ?? palette[0];
      map.set(k, { id: uid(), r, c, color, rune: color, special: "none" });
    }
  }
  return Array.from(map.values()).sort((a, b) => idx(n, a.r, a.c) - idx(n, b.r, b.c));
}

function dropAndRefill(n: number, tiles: Tile[], palette: Rune[], fog: (FogCell | null)[], locked: Set<number> = new Set()) {
  const grid: (Tile | null)[] = new Array(n * n).fill(null);
  for (const t of tiles) grid[idx(n, t.r, t.c)] = t;
  const resultGrid: (Tile | null)[] = new Array(n * n).fill(null);
  const out: Tile[] = [];

  const place = (tile: Tile) => {
    const fixed = { ...tile, id: tile.id || uid() };
    out.push(fixed);
    resultGrid[idx(n, fixed.r, fixed.c)] = fixed;
  };

  const wouldMakeMatch = (r: number, c: number, color: Rune) => {
    const left1 = c >= 1 ? resultGrid[idx(n, r, c - 1)] : null;
    const left2 = c >= 2 ? resultGrid[idx(n, r, c - 2)] : null;
    if (left1?.color === color && left2?.color === color) return true;
    const down1 = r + 1 < n ? resultGrid[idx(n, r + 1, c)] : null;
    const down2 = r + 2 < n ? resultGrid[idx(n, r + 2, c)] : null;
    if (down1?.color === color && down2?.color === color) return true;
    return false;
  };

  const pickSafeColor = (r: number, c: number) => {
    const options = palette.slice().sort(() => Math.random() - 0.5);
    for (const color of options) if (!wouldMakeMatch(r, c, color)) return color;
    return options[0] ?? palette[0];
  };

  const isBlocked = (r: number, c: number) => !!fog[idx(n, r, c)] || locked.has(idx(n, r, c));

  for (let c = 0; c < n; c++) {
    const falling: Tile[] = [];
    for (let r = n - 1; r >= 0; r--) {
      if (isBlocked(r, c)) {
        let t = grid[idx(n, r, c)];
        if (!t) {
          const color = pickSafeColor(r, c);
          t = { id: uid(), r, c, color, rune: color, special: "none" };
        }
        place({ ...t, r, c });
      } else {
        const t = grid[idx(n, r, c)];
        if (t) falling.push(t);
      }
    }

    const openRows: number[] = [];
    for (let r = n - 1; r >= 0; r--) if (!isBlocked(r, c)) openRows.push(r);
    let wi = 0;
    for (; wi < falling.length && wi < openRows.length; wi++) {
      const r = openRows[wi];
      place({ ...falling[wi], r, c });
    }
    for (; wi < openRows.length; wi++) {
      const r = openRows[wi];
      const color = pickSafeColor(r, c);
      place({ id: uid(), r, c, color, rune: color, special: "none" });
    }
  }

  return repairTiles(n, out, palette);
}

export default function RuneRushPage() {
  const [levelIndex, setLevelIndex] = useState(0);
  const [maxUnlocked, setMaxUnlocked] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const livesRef = useRef(MAX_LIVES);
  const [lifeTs, setLifeTs] = useState(Date.now());
  const level = useMemo(() => getLevel(levelIndex), [levelIndex]);
  const n = level.size;

  const [phase, setPhase] = useState<Phase>("idle");
  const [movesLeft, setMovesLeft] = useState(level.moves);
  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  const [combo, setCombo] = useState(0);
  const comboRef = useRef(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);

  const [tiles, setTiles] = useState<Tile[]>(() => makeInitialTiles(n, level.palette));
  const tilesRef = useRef<Tile[]>(tiles);
  const [fog, setFog] = useState<(FogCell | null)[]>(() => initFog(n, level.fog.enabled ? level.fog.startCount : 0));
  const fogRef = useRef<(FogCell | null)[]>(fog);
  const [collectRemaining, setCollectRemaining] = useState<Partial<Record<Rune, number>>>({});
  const collectRemainingRef = useRef<Partial<Record<Rune, number>>>({});

  const boardAreaRef = useRef<HTMLDivElement | null>(null);
  const [boardPx, setBoardPx] = useState(420);

  const [floatTexts, setFloatTexts] = useState<FloatingText[]>([]);
  const [powerLine, setPowerLine] = useState<PowerLine | null>(null);
  const [lotusFx, setLotusFx] = useState<LotusFx | null>(null);
  const [spawnFx, setSpawnFx] = useState<SpawnFx | null>(null);
  const [poppingCells, setPoppingCells] = useState<PopCell[]>([]);
  const [highlightCells, setHighlightCells] = useState<{ r: number; c: number }[]>([]);
  const [hintPair, setHintPair] = useState<[string, string] | null>(null);
  const [brokenRunes, setBrokenRunes] = useState<Partial<Record<Rune, boolean>>>({});

  const fogSfx = useRef<HTMLAudioElement | null>(null);
  const swapSfx = useRef<HTMLAudioElement | null>(null);
  const matchSfx = useRef<HTMLAudioElement | null>(null);
  const lastActionRef = useRef(Date.now());
  const lastHintRef = useRef(0);
  const victoryRunningRef = useRef(false);
  const fogPauseNextMoveRef = useRef(false);

  const tilePx = useMemo(() => {
    const inner = Math.max(268, boardPx - PAD * 2);
    return Math.floor((inner - (n - 1) * GAP) / n);
  }, [boardPx, n]);
  const boardInnerPx = useMemo(() => PAD * 2 + n * tilePx + (n - 1) * GAP, [n, tilePx]);
  const xy = (r: number, c: number) => ({ x: PAD + c * (tilePx + GAP), y: PAD + r * (tilePx + GAP) });

  const applyTiles = (next: Tile[]) => {
    const fixed = repairTiles(n, next, level.palette);
    tilesRef.current = fixed;
    setTiles(fixed);
  };
  const applyFog = (next: (FogCell | null)[]) => {
    fogRef.current = next;
    setFog(next);
  };
  const applyCollectRemaining = (next: Partial<Record<Rune, number>>) => {
    collectRemainingRef.current = next;
    setCollectRemaining(next);
  };
  const blocked = (r: number, c: number) => !!fogRef.current[idx(n, r, c)];
  const addScore = (points: number) => {
    const next = scoreRef.current + points;
    scoreRef.current = next;
    setScore(next);
    return next;
  };
  const resetScore = () => {
    scoreRef.current = 0;
    setScore(0);
  };
  const setComboNow = (value: number) => {
    comboRef.current = value;
    setCombo(value);
  };
  const playSfx = (a: HTMLAudioElement | null) => {
    if (!soundOn || !a) return;
    try {
      a.currentTime = 0;
      a.play();
    } catch {}
  };

  const popAt = (r: number, c: number, text: string, kind: FloatingText["kind"] = "points") => {
    const p = xy(r, c);
    const item: FloatingText = { id: uid(), x: p.x + tilePx / 2, y: p.y + tilePx / 2, text, kind };
    setFloatTexts((old) => [...old, item].slice(-40));
    setTimeout(() => setFloatTexts((old) => old.filter((x) => x.id !== item.id)), kind === "combo" ? 920 : 760);
  };

  useEffect(() => {
    try {
      const savedVersion = localStorage.getItem(LS_VERSION);
      if (savedVersion !== CODE_VERSION) {
        localStorage.setItem(LS_VERSION, CODE_VERSION);
        localStorage.removeItem(LS_LEVEL);
        localStorage.removeItem(LS_MAX_UNLOCKED);
        localStorage.removeItem(LS_LIVES);
        localStorage.removeItem(LS_LIFE_TS);
      }
      const lv = Number(localStorage.getItem(LS_LEVEL) || "0");
      const mu = Number(localStorage.getItem(LS_MAX_UNLOCKED) || "0");
      const li = Number(localStorage.getItem(LS_LIVES) || `${MAX_LIVES}`);
      const ts = Number(localStorage.getItem(LS_LIFE_TS) || `${Date.now()}`);
      setLevelIndex(Number.isFinite(lv) ? Math.max(0, lv) : 0);
      setMaxUnlocked(Number.isFinite(mu) ? Math.max(0, mu) : 0);
      const safeLives = Number.isFinite(li) ? clamp(li, 0, MAX_LIVES) : MAX_LIVES;
      livesRef.current = safeLives;
      setLives(safeLives);
      setLifeTs(Number.isFinite(ts) ? ts : Date.now());
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_LEVEL, String(levelIndex));
      localStorage.setItem(LS_MAX_UNLOCKED, String(maxUnlocked));
      localStorage.setItem(LS_LIVES, String(lives));
      localStorage.setItem(LS_LIFE_TS, String(lifeTs));
    } catch {}
  }, [levelIndex, maxUnlocked, lives, lifeTs]);

  useEffect(() => {
    livesRef.current = lives;
    if (lives <= 0 && phase !== "win" && phase !== "victory") setPhase("outoflives");
    if (lives > 0 && phase === "outoflives") setPhase("idle");
  }, [lives, phase]);

  useEffect(() => {
    const tick = () => {
      setLives((cur) => {
        if (cur >= MAX_LIVES) return cur;
        let ts = lifeTs;
        try { ts = Number(localStorage.getItem(LS_LIFE_TS) || `${lifeTs}`); } catch {}
        const now = Date.now();
        const delta = now - ts;
        if (delta < LIFE_REGEN_MS) return cur;
        const gain = Math.floor(delta / LIFE_REGEN_MS);
        const nextLives = clamp(cur + gain, 0, MAX_LIVES);
        const newTs = ts + gain * LIFE_REGEN_MS;
        livesRef.current = nextLives;
        try {
          localStorage.setItem(LS_LIVES, String(nextLives));
          localStorage.setItem(LS_LIFE_TS, String(newTs));
        } catch {}
        setLifeTs(newTs);
        return nextLives;
      });
    };
    tick();
    const i = setInterval(tick, 60000);
    return () => clearInterval(i);
  }, [lifeTs]);

  const nextLifeIn = useMemo(() => {
    if (lives >= MAX_LIVES) return "Full";
    let ts = lifeTs;
    try { ts = Number(localStorage.getItem(LS_LIFE_TS) || `${lifeTs}`); } catch {}
    const remain = LIFE_REGEN_MS - (Date.now() - ts);
    const mm = Math.max(0, Math.floor(remain / 60000));
    const h = Math.floor(mm / 60);
    const m = mm % 60;
    return `${h}h ${String(m).padStart(2, "0")}m`;
  }, [lives, lifeTs]);

  useEffect(() => {
    try { if (localStorage.getItem(LS_SOUND) === "0") setSoundOn(false); } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(LS_SOUND, soundOn ? "1" : "0"); } catch {}
  }, [soundOn]);

  useEffect(() => {
    fogSfx.current = new Audio("/sfx/fogclear.mp3");
    swapSfx.current = new Audio("/sfx/swap.mp3");
    matchSfx.current = new Audio("/sfx/match.mp3");
    for (const a of [fogSfx.current, swapSfx.current, matchSfx.current]) {
      if (!a) continue;
      a.preload = "auto";
      a.load();
    }
    if (swapSfx.current) swapSfx.current.volume = 0.22;
    if (matchSfx.current) matchSfx.current.volume = 0.32;
    if (fogSfx.current) fogSfx.current.volume = 0.42;
  }, []);

  useEffect(() => {
    const urls = [...COLORS.map(imgRune), imgRune("golden"), imgRune("lotus"), "/textures/obsidian.png", "/textures/stone.png", "/runerushbg.webp"];
    urls.forEach((url) => {
      const im = new Image();
      im.src = url;
    });
  }, []);

  useEffect(() => {
    const el = boardAreaRef.current;
    if (!el) return;
    const compute = () => {
      const w = Math.min(el.getBoundingClientRect().width, window.innerWidth * 0.97);
      const heightReserve = window.innerHeight < 720 ? 250 : 282;
      const availableHeight = Math.max(308, window.innerHeight - heightReserve);
      const size = Math.floor(Math.min(w, availableHeight));
      setBoardPx(clamp(size, 312, 740));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    window.addEventListener("resize", compute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", compute);
    };
  }, []);

  function resetLevelBoard() {
    const startingCollect = level.objective.kind === "collect" ? { ...level.objective.target } : {};
    setPhase(livesRef.current <= 0 ? "outoflives" : "idle");
    setMovesLeft(level.moves);
    resetScore();
    setComboNow(0);
    setSelectedId(null);
    applyTiles(makeInitialTiles(n, level.palette));
    applyFog(initFog(n, level.fog.enabled ? level.fog.startCount : 0));
    applyCollectRemaining(startingCollect);
    setFloatTexts([]);
    setPowerLine(null);
    setLotusFx(null);
    setSpawnFx(null);
    setPoppingCells([]);
    setHighlightCells([]);
    setHintPair(null);
    lastActionRef.current = Date.now();
    lastHintRef.current = 0;
    victoryRunningRef.current = false;
    fogPauseNextMoveRef.current = false;
  }
  useEffect(() => {
    resetLevelBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelIndex]);

  const touchAction = () => {
    lastActionRef.current = Date.now();
    lastHintRef.current = 0;
    setHintPair(null);
  };

  useEffect(() => {
    const timer = setInterval(() => {
      if (phase !== "idle" || selectedId != null) return;
      const now = Date.now();
      if (now - lastActionRef.current < HINT_IDLE_MS || now - lastHintRef.current < HINT_REPEAT_MS) return;
      const map = new Map<string, Tile>();
      for (const t of tilesRef.current) map.set(`${t.r},${t.c}`, t);
      const testSwap = (a: Tile, b: Tile) => {
        if (blocked(a.r, a.c) || blocked(b.r, b.c)) return false;
        if (a.special !== "none" || b.special !== "none") return true;
        const g: (Tile | null)[] = new Array(n * n).fill(null);
        for (const t of tilesRef.current) g[idx(n, t.r, t.c)] = t;
        const ai = idx(n, a.r, a.c);
        const bi = idx(n, b.r, b.c);
        const copy = g.slice();
        [copy[ai], copy[bi]] = [copy[bi], copy[ai]];
        return computeMatches(n, copy, fogRef.current).clearSet.size > 0;
      };
      for (const a of tilesRef.current) {
        if (blocked(a.r, a.c)) continue;
        for (const p of [{ r: a.r, c: a.c + 1 }, { r: a.r + 1, c: a.c }]) {
          if (p.r >= n || p.c >= n || blocked(p.r, p.c)) continue;
          const b = map.get(`${p.r},${p.c}`);
          if (b && testSwap(a, b)) {
            lastHintRef.current = now;
            setHintPair([a.id, b.id]);
            setTimeout(() => setHintPair((cur) => (cur && cur[0] === a.id && cur[1] === b.id ? null : cur)), HINT_DURATION_MS);
            return;
          }
        }
      }
    }, 500);
    return () => clearInterval(timer);
  }, [phase, selectedId, n]);

  const fogCount = useMemo(() => fog.filter(Boolean).length, [fog]);
  const collectTotal = useMemo(() => {
    if (level.objective.kind !== "collect") return 0;
    return Object.values(level.objective.target).reduce<number>((a, b) => a + Number(b ?? 0), 0);
  }, [level]);
  const collectRemainingSum = useMemo(() => {
    if (level.objective.kind !== "collect") return 0;
    return Object.entries(level.objective.target).reduce((sum, [r]) => sum + (collectRemaining[r as Rune] ?? 0), 0);
  }, [level, collectRemaining]);

  const goalInfo = useMemo(() => {
    if (level.objective.kind === "clearFogAll") {
      const start = Math.max(level.objective.startCount, 1);
      const cleared = clamp(start - fogCount, 0, start);
      return { title: "Clear the Fog", count: `${cleared}/${start}`, pct: clamp(cleared / start, 0, 1), icon: "☁️" };
    }
    if (level.objective.kind === "collect") {
      const total = Math.max(1, collectTotal);
      return { title: "Collect Runes", count: `${total - collectRemainingSum}/${total}`, pct: clamp((total - collectRemainingSum) / total, 0, 1), icon: "💎" };
    }
    return { title: "Reach Score", count: `${score}/${level.objective.targetScore}`, pct: clamp(score / level.objective.targetScore, 0, 1), icon: "⭐" };
  }, [level, fogCount, collectTotal, collectRemainingSum, score]);

  const isWinNow = (nextScore: number, nextFog: number) => {
    if (level.objective.kind === "clearFogAll") return nextFog === 0;
    if (level.objective.kind === "collect") {
      return Object.entries(level.objective.target).every(([r]) => (collectRemainingRef.current[r as Rune] ?? 0) <= 0);
    }
    return nextScore >= level.objective.targetScore;
  };

  function ensureTileAtIndexIfMissing(k: number) {
    const { r, c } = rcFromIdx(n, k);
    const exists = tilesRef.current.some((t) => t.r === r && t.c === c);
    if (!exists) {
      const color = level.palette[Math.floor(Math.random() * level.palette.length)] ?? level.palette[0];
      applyTiles([...tilesRef.current, { id: uid(), r, c, color, rune: color, special: "none" }]);
    }
  }

  function clearFogCellsMakeHoles(cells: Set<number>) {
    const fogArr = fogRef.current.slice();
    const holes = new Set<number>();
    let changed = false;
    for (const k of cells) {
      if (fogArr[k]) {
        fogArr[k] = null;
        holes.add(k);
        changed = true;
      }
    }
    if (changed) {
      playSfx(fogSfx.current);
      fogPauseNextMoveRef.current = true;
      applyFog(fogArr);
    }
    return holes;
  }

  function damageFogAdjacentToClearsMakeHoles(clearSet: Set<number>) {
    const fogArr = fogRef.current.slice();
    const holes = new Set<number>();
    let changed = false;
    const adj4 = (r: number, c: number) => {
      const out: number[] = [];
      if (r > 0) out.push(idx(n, r - 1, c));
      if (r < n - 1) out.push(idx(n, r + 1, c));
      if (c > 0) out.push(idx(n, r, c - 1));
      if (c < n - 1) out.push(idx(n, r, c + 1));
      return out;
    };
    for (const k of clearSet) {
      const { r, c } = rcFromIdx(n, k);
      for (const a of adj4(r, c)) {
        if (!fogArr[a]) continue;
        fogArr[a] = null;
        holes.add(a);
        changed = true;
      }
    }
    if (changed) {
      playSfx(fogSfx.current);
      fogPauseNextMoveRef.current = true;
      applyFog(fogArr);
    }
    return holes;
  }

  function spreadFogOne() {
    if (!level.fog.enabled) return;
    if (fogPauseNextMoveRef.current) {
      fogPauseNextMoveRef.current = false;
      return;
    }
    const fogArr = fogRef.current.slice();
    const fogCells: number[] = [];
    for (let i = 0; i < fogArr.length; i++) if (fogArr[i]) fogCells.push(i);
    if (!fogCells.length) return;
    const adj4 = (r: number, c: number) => {
      const out: number[] = [];
      if (r > 0) out.push(idx(n, r - 1, c));
      if (r < n - 1) out.push(idx(n, r + 1, c));
      if (c > 0) out.push(idx(n, r, c - 1));
      if (c < n - 1) out.push(idx(n, r, c + 1));
      return out;
    };
    const candidates = new Set<number>();
    for (const fi of fogCells) {
      const { r, c } = rcFromIdx(n, fi);
      for (const a of adj4(r, c)) if (!fogArr[a]) candidates.add(a);
    }
    const list = Array.from(candidates);
    for (let s = 0; s < Math.min(level.fog.spreadEachTurn, list.length); s++) {
      const pickIndex = Math.floor(Math.random() * list.length);
      const pick = list.splice(pickIndex, 1)[0];
      fogArr[pick] = { hp: 1 };
      ensureTileAtIndexIfMissing(pick);
    }
    applyFog(fogArr);
  }

  async function clearBySet(clearCells: Set<number>, focus: { r: number; c: number }, bonus = 0, locked: Set<number> = new Set(), mode: "match" | "golden" | "lotus" = "match") {
    if (clearCells.size === 0) return;
    playSfx(matchSfx.current);
    comboRef.current += 1;
    setCombo(comboRef.current);
    const comboBonus = comboRef.current > 1 ? comboRef.current * BONUS_COMBO : 0;
    if (comboRef.current > 1) popAt(focus.r, focus.c, `Combo x${comboRef.current}`, "combo");

    if (level.objective.kind === "collect") {
      const clearedTiles = tilesRef.current.filter((t) => clearCells.has(idx(n, t.r, t.c)));
      if (clearedTiles.length) {
        const next = { ...collectRemainingRef.current };
        for (const t of clearedTiles) {
          if (next[t.color] != null && (next[t.color] as number) > 0) next[t.color] = Math.max(0, (next[t.color] as number) - 1);
        }
        applyCollectRemaining(next);
      }
    }

    const holes1 = clearFogCellsMakeHoles(clearCells);
    const holes2 = damageFogAdjacentToClearsMakeHoles(clearCells);
    for (const h of holes1) clearCells.add(h);
    for (const h of holes2) clearCells.add(h);

    const ordered = Array.from(clearCells).sort((a, b) => {
      const ar = rcFromIdx(n, a);
      const br = rcFromIdx(n, b);
      if (mode === "golden") {
        if (ar.r === br.r) return ar.c - br.c;
        if (ar.c === br.c) return ar.r - br.r;
      }
      const da = Math.abs(ar.r - focus.r) + Math.abs(ar.c - focus.c);
      const db = Math.abs(br.r - focus.r) + Math.abs(br.c - focus.c);
      return mode === "match" ? a - b : da - db;
    });
    setPoppingCells(ordered.map((k, i) => ({ ...rcFromIdx(n, k), delay: mode === "match" ? Math.min(48, i * 6) : Math.min(90, i * 10), mode })));

    const pts = clearCells.size * PTS_PER_TILE + bonus + comboBonus;
    addScore(pts);
    popAt(focus.r, focus.c, `+${pts}`, "points");

    await wait(POP_MS + 35);
    setPoppingCells([]);
    const survivors = tilesRef.current.filter((t) => !clearCells.has(idx(n, t.r, t.c)));
    applyTiles(dropAndRefill(n, survivors, level.palette, fogRef.current, locked));
    await wait(DROP_MS);
  }

  async function resolveCascadesSeedOnly(seedSpawn: null | { k: number; special: Special; rune: Rune }) {
    while (true) {
      const g: (Tile | null)[] = new Array(n * n).fill(null);
      for (const t of tilesRef.current) g[idx(n, t.r, t.c)] = t;
      const m = computeMatches(n, g, fogRef.current);
      if (m.clearSet.size === 0) break;

      const activeSeed = seedSpawn ?? chooseSeedSpawn(m, []);
      const clear = new Set<number>(m.clearSet);
      const lock = activeSeed ? new Set<number>([activeSeed.k]) : new Set<number>();
      if (activeSeed) clear.delete(activeSeed.k);
      const focus = activeSeed ? rcFromIdx(n, activeSeed.k) : clear.size ? rcFromIdx(n, Array.from(clear)[0]) : { r: 0, c: 0 };
      await clearBySet(clear, focus, 0, lock, "match");

      if (activeSeed) {
        ensureTileAtIndexIfMissing(activeSeed.k);
        const { r, c } = rcFromIdx(n, activeSeed.k);
        applyTiles(tilesRef.current.map((t) => (t.r === r && t.c === c ? { ...t, rune: activeSeed.rune, special: activeSeed.special } : t)));
        setSpawnFx({ id: uid(), r, c, kind: activeSeed.special });
        await wait(activeSeed.special === "lotus" ? 280 : 185);
        setSpawnFx(null);
        seedSpawn = null;
      }
      await wait(CASCADE_PAUSE_MS);
    }
  }

  async function playGolden(origin: { r: number; c: number }, dir: "h" | "v") {
    setPowerLine({ id: uid(), dir, r: origin.r, c: origin.c });
    await wait(GOLD_CHARGE_MS + GOLD_SWEEP_MS);
    setPowerLine(null);
    const cells: { r: number; c: number }[] = [];
    if (dir === "h") for (let c = 0; c < n; c++) cells.push({ r: origin.r, c });
    else for (let r = 0; r < n; r++) cells.push({ r, c: origin.c });
    await clearBySet(new Set(cells.map((cell) => idx(n, cell.r, cell.c))), origin, BONUS_GOLDEN, new Set(), "golden");
  }

  async function playGoldenCross(origin: { r: number; c: number }) {
    setPowerLine({ id: uid(), dir: "cross", r: origin.r, c: origin.c });
    await wait(GOLD_CHARGE_MS + GOLD_SWEEP_MS);
    setPowerLine(null);
    const cells: { r: number; c: number }[] = [];
    for (let c = 0; c < n; c++) cells.push({ r: origin.r, c });
    for (let r = 0; r < n; r++) cells.push({ r, c: origin.c });
    await clearBySet(new Set(cells.map((cell) => idx(n, cell.r, cell.c))), origin, BONUS_GOLDEN * 2, new Set(), "golden");
  }

  async function playLotus(origin: { r: number; c: number }, targetColor: Rune) {
    setLotusFx({ id: uid(), r: origin.r, c: origin.c });
    popAt(origin.r, origin.c, "Color Bomb", "special");
    await wait(LOTUS_CHARGE_MS);
    const targets = tilesRef.current.filter((t) => t.color === targetColor && t.special === "none").map((t) => ({ r: t.r, c: t.c }));
    setHighlightCells(targets);
    await wait(LOTUS_FLASH_MS);
    setHighlightCells([]);
    setLotusFx(null);
    const clear = new Set<number>();
    for (const t of targets) clear.add(idx(n, t.r, t.c));
    clear.add(idx(n, origin.r, origin.c));
    await clearBySet(clear, origin, BONUS_LOTUS, new Set(), "lotus");
  }

  async function playLotusMega(origin: { r: number; c: number }) {
    setLotusFx({ id: uid(), r: origin.r, c: origin.c, mega: true });
    popAt(origin.r, origin.c, "Full Board", "special");
    await wait(LOTUS_CHARGE_MS + 130);
    setLotusFx(null);
    const clear = new Set<number>();
    for (const t of tilesRef.current) clear.add(idx(n, t.r, t.c));
    await clearBySet(clear, origin, BONUS_LOTUS * 2, new Set(), "lotus");
  }

  async function playLotusGolden(origin: { r: number; c: number }, targetColor: Rune) {
    setLotusFx({ id: uid(), r: origin.r, c: origin.c });
    popAt(origin.r, origin.c, "Super Swipes", "special");
    await wait(LOTUS_CHARGE_MS);
    const targetTiles = tilesRef.current.filter((t) => t.color === targetColor && t.special === "none").slice(0, 8);
    setHighlightCells(targetTiles.map((t) => ({ r: t.r, c: t.c })));
    await wait(LOTUS_FLASH_MS);
    setHighlightCells([]);
    setLotusFx(null);
    const clear = new Set<number>();
    clear.add(idx(n, origin.r, origin.c));
    for (const t of targetTiles) {
      if (Math.random() > 0.5) for (let c = 0; c < n; c++) clear.add(idx(n, t.r, c));
      else for (let r = 0; r < n; r++) clear.add(idx(n, r, t.c));
    }
    await clearBySet(clear, origin, BONUS_LOTUS + BONUS_GOLDEN * 2, new Set(), "lotus");
  }

  function pickFreeCell() {
    const candidates: { r: number; c: number }[] = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!blocked(r, c)) candidates.push({ r, c });
    return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
  }

  async function runVictorySequence(remainingMoves: number) {
    if (victoryRunningRef.current) return;
    victoryRunningRef.current = true;
    setPhase("victory");
    setSelectedId(null);
    const steps = Math.min(MAX_VICTORY_STEPS, remainingMoves);
    for (let i = 0; i < steps; i++) {
      const cell = pickFreeCell();
      if (!cell) break;
      addScore(55);
      popAt(cell.r, cell.c, "+55", "points");
      if (i % 3 === 2) await playLotus(cell, level.palette[Math.floor(Math.random() * level.palette.length)]);
      else await playGolden(cell, i % 2 === 0 ? "h" : "v");
      await resolveCascadesSeedOnly(null);
      await wait(60);
    }
    setPhase("win");
  }

  function restartLevel() { resetLevelBoard(); }
  function nextLevel() { setLevelIndex((i) => i + 1); }
  function prevLevel() { setLevelIndex((i) => Math.max(0, i - 1)); }
  async function shareNow() {
    const text = `Toby's Rune Rush 🎮 Level ${levelIndex + 1}\n${goalInfo.title}: ${goalInfo.count}\nScore: ${score}\n#RuneRush #Base`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        alert("Copied share text!");
      }
    } catch {}
  }

  const drag = useRef<{ active: boolean; startX: number; startY: number; startId: string | null; pointerId: number | null }>({ active: false, startX: 0, startY: 0, startId: null, pointerId: null });

  function onPointerDown(e: React.PointerEvent, t: Tile) {
    if (phase !== "idle" || lives <= 0 || movesLeft <= 0 || blocked(t.r, t.c)) return;
    touchAction();
    drag.current = { active: true, startX: e.clientX, startY: e.clientY, startId: t.id, pointerId: e.pointerId };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
  }
  function onPointerUp(e: React.PointerEvent) {
    if (drag.current.pointerId === e.pointerId) drag.current = { active: false, startX: 0, startY: 0, startId: null, pointerId: null };
  }
  async function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d.active || d.startId == null || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
    e.preventDefault();
    d.active = false;
    const start = tilesRef.current.find((t) => t.id === d.startId);
    if (!start) return;
    let tr = start.r;
    let tc = start.c;
    if (Math.abs(dx) > Math.abs(dy)) tc += dx > 0 ? 1 : -1;
    else tr += dy > 0 ? 1 : -1;
    tr = clamp(tr, 0, n - 1);
    tc = clamp(tc, 0, n - 1);
    if (blocked(tr, tc)) return;
    const target = tilesRef.current.find((t) => t.r === tr && t.c === tc);
    if (target) await attemptSwap(start, target);
  }

  function onTileClick(tileId: string) {
    if (phase !== "idle" || lives <= 0 || movesLeft <= 0) return;
    const cur = tilesRef.current.find((x) => x.id === tileId);
    if (!cur || blocked(cur.r, cur.c)) return;
    touchAction();
    if (!selectedId) {
      setSelectedId(cur.id);
      return;
    }
    const sel = tilesRef.current.find((x) => x.id === selectedId);
    if (!sel) {
      setSelectedId(cur.id);
      return;
    }
    if (sel.id === cur.id) {
      setSelectedId(null);
      return;
    }
    if (!neighbors(sel, cur)) {
      setSelectedId(cur.id);
      return;
    }
    attemptSwap(sel, cur);
  }

  async function onLevelFail() {
    const cur = livesRef.current;
    const next = clamp(cur - 1, 0, MAX_LIVES);
    livesRef.current = next;
    setLives(next);
    try { localStorage.setItem(LS_LIVES, String(next)); } catch {}
    if (cur === MAX_LIVES) {
      const now = Date.now();
      try { localStorage.setItem(LS_LIFE_TS, String(now)); } catch {}
      setLifeTs(now);
    }
    setPhase(next <= 0 ? "outoflives" : "fail");
  }

  async function attemptSwap(a: Tile, b: Tile) {
    if (phase !== "idle" || lives <= 0 || movesLeft <= 0 || !neighbors(a, b) || blocked(a.r, a.c) || blocked(b.r, b.c)) return;
    touchAction();
    setComboNow(0);
    setPhase("busy");
    setSelectedId(null);
    playSfx(swapSfx.current);

    const isH = a.r === b.r;
    const wipeDir: "h" | "v" = isH ? "h" : "v";
    applyTiles(tilesRef.current.map((t) => {
      if (t.id === a.id) return { ...t, r: b.r, c: b.c };
      if (t.id === b.id) return { ...t, r: a.r, c: a.c };
      return t;
    }));
    await wait(SWAP_MS);

    const aNow = tilesRef.current.find((t) => t.id === a.id);
    const bNow = tilesRef.current.find((t) => t.id === b.id);
    if (!aNow || !bNow) {
      setPhase("idle");
      return;
    }

    const newMovesLeft = movesLeft - 1;
    setMovesLeft(newMovesLeft);

    if (aNow.special === "lotus" && bNow.special === "lotus") {
      await playLotusMega({ r: aNow.r, c: aNow.c });
      await resolveCascadesSeedOnly(null);
    } else if (aNow.special === "golden" && bNow.special === "golden") {
      await playGoldenCross({ r: aNow.r, c: aNow.c });
      await resolveCascadesSeedOnly(null);
    } else if (aNow.special === "lotus" && bNow.special === "golden") {
      await playLotusGolden({ r: aNow.r, c: aNow.c }, bNow.color);
      await resolveCascadesSeedOnly(null);
    } else if (bNow.special === "lotus" && aNow.special === "golden") {
      await playLotusGolden({ r: bNow.r, c: bNow.c }, aNow.color);
      await resolveCascadesSeedOnly(null);
    } else if (aNow.special === "lotus") {
      await playLotus({ r: aNow.r, c: aNow.c }, bNow.color);
      await resolveCascadesSeedOnly(null);
    } else if (bNow.special === "lotus") {
      await playLotus({ r: bNow.r, c: bNow.c }, aNow.color);
      await resolveCascadesSeedOnly(null);
    } else if (aNow.special === "golden") {
      await playGolden({ r: aNow.r, c: aNow.c }, wipeDir);
      await resolveCascadesSeedOnly(null);
    } else if (bNow.special === "golden") {
      await playGolden({ r: bNow.r, c: bNow.c }, wipeDir);
      await resolveCascadesSeedOnly(null);
    } else {
      const g: (Tile | null)[] = new Array(n * n).fill(null);
      for (const t of tilesRef.current) g[idx(n, t.r, t.c)] = t;
      const m = computeMatches(n, g, fogRef.current);
      if (m.clearSet.size === 0) {
        setMovesLeft((mm) => mm + 1);
        applyTiles(tilesRef.current.map((t) => {
          if (t.id === a.id) return { ...t, r: a.r, c: a.c };
          if (t.id === b.id) return { ...t, r: b.r, c: b.c };
          return t;
        }));
        await wait(BAD_SWAP_MS);
        setPhase("idle");
        return;
      }
      const ai = idx(n, aNow.r, aNow.c);
      const bi = idx(n, bNow.r, bNow.c);
      await resolveCascadesSeedOnly(chooseSeedSpawn(m, [ai, bi]));
    }

    spreadFogOne();
    const nextFogCount = fogRef.current.filter(Boolean).length;
    if (isWinNow(scoreRef.current, nextFogCount)) {
      setMaxUnlocked((m) => Math.max(m, levelIndex + 1));
      const leftover = Math.max(0, newMovesLeft);
      setMovesLeft(0);
      await runVictorySequence(leftover);
      return;
    }
    if (newMovesLeft <= 0) {
      await onLevelFail();
      return;
    }
    setPhase("idle");
  }

  const canGoPrev = levelIndex > 0;
  const canGoNext = levelIndex < maxUnlocked;
  const targetRunes = level.objective.kind === "collect" ? Object.entries(level.objective.target) : [];

  return (
    <main className="rrApp">
      <div className="rrBg" />
      <section className="rrShell" ref={boardAreaRef}>
        <header className="rrTopHud">
          <button className="rrNavBtn" disabled={!canGoPrev} onClick={() => canGoPrev && prevLevel()}>‹</button>
          <div className="rrLevelPill"><span>LEVEL</span><b>{levelIndex + 1}</b></div>
          <div className="rrLifePill"><span>♥</span><b>{lives}</b><em>{nextLifeIn}</em></div>
          <button className="rrNavBtn" disabled={!canGoNext} onClick={() => canGoNext && nextLevel()}>›</button>
        </header>

        <div className="rrStats">
          <div><span>MOVES</span><b>{movesLeft}</b></div>
          <div><span>SCORE</span><b>{score}</b></div>
          <div><span>COMBO</span><b>{combo > 1 ? `x${combo}` : "—"}</b></div>
        </div>

        <section className="rrGoalCard">
          <div className="rrGoalIcon">{goalInfo.icon}</div>
          <div className="rrGoalMain">
            <div className="rrGoalLabel">GOAL</div>
            <div className="rrGoalTitle">{goalInfo.title}</div>
            {targetRunes.length > 0 && (
              <div className="rrTargets">
                {targetRunes.map(([r]) => (
                  <div className="rrTargetChip" key={r}>
                    <RuneImage rune={r as Rune} broken={!!brokenRunes[r as Rune]} onBroken={() => setBrokenRunes((old) => ({ ...old, [r as Rune]: true }))} />
                    <span>{collectRemaining[r as Rune] ?? 0}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="rrProgress"><div style={{ width: `${goalInfo.pct * 100}%` }} /></div>
          </div>
          <div className="rrGoalCount">{goalInfo.count}</div>
        </section>

        <div className="rrBoardFrame" style={{ width: boardInnerPx + 18, height: boardInnerPx + 18 }}>
          <div className="rrBoard" style={{ width: boardInnerPx, height: boardInnerPx }}>
            {powerLine && (
              <div className={`rrPowerLine rrPower-${powerLine.dir}`} style={powerLineStyle(powerLine, xy, tilePx, boardInnerPx)}>
                <div className="rrPowerGlow" />
                <div className="rrPowerCore" />
                <div className="rrPowerHead" />
              </div>
            )}
            {lotusFx && (
              <div className={`rrLotusFx ${lotusFx.mega ? "mega" : ""}`} style={{ width: tilePx, height: tilePx, transform: `translate3d(${xy(lotusFx.r, lotusFx.c).x}px, ${xy(lotusFx.r, lotusFx.c).y}px, 0)` }}>
                <i className="ring r1" /><i className="ring r2" /><i className="ring r3" /><i className="burst" /><i className="bloom" />
              </div>
            )}
            {spawnFx && (
              <div className={`rrSpawnFx ${spawnFx.kind}`} style={{ width: tilePx, height: tilePx, transform: `translate3d(${xy(spawnFx.r, spawnFx.c).x}px, ${xy(spawnFx.r, spawnFx.c).y}px, 0)` }}>
                <i /><b />
              </div>
            )}
            {tiles.map((t) => {
              const p = xy(t.r, t.c);
              const hint = hintPair && (hintPair[0] === t.id || hintPair[1] === t.id);
              const other = hintPair ? tilesRef.current.find((x) => x.id === (hintPair[0] === t.id ? hintPair[1] : hintPair[0])) : null;
              const hintStyle = hint && other ? ({ "--hint-x": `${(other.c - t.c) * 9}px`, "--hint-y": `${(other.r - t.r) * 9}px` } as React.CSSProperties) : undefined;
              const pop = poppingCells.find((x) => x.r === t.r && x.c === t.c);
              const target = highlightCells.some((x) => x.r === t.r && x.c === t.c);
              const textureX = `${(t.c * 31 + t.r * 17) % 100}%`;
              const textureY = `${(t.r * 29 + t.c * 13) % 100}%`;
              return (
                <button
                  key={t.id}
                  className={`rrTile ${t.id === selectedId ? "selected" : ""} ${t.special} ${pop ? "pop" : ""} ${target ? "targetPulse" : ""}`}
                  style={{
                    width: tilePx,
                    height: tilePx,
                    transform: `translate3d(${p.x}px, ${p.y}px, 0)`,
                    transition: `transform ${DROP_MS}ms cubic-bezier(.18,.94,.2,1.08)`,
                    "--pop-delay": `${pop?.delay ?? 0}ms`,
                    "--tx": textureX,
                    "--ty": textureY,
                  } as React.CSSProperties}
                  onClick={() => onTileClick(t.id)}
                  onPointerDown={(e) => onPointerDown(e, t)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  aria-label="rune tile"
                >
                  <div className={`rrTileInner ${hint ? "hintMove" : ""}`} style={hintStyle}>
                    <RuneImage rune={t.rune} broken={!!brokenRunes[t.rune]} onBroken={() => setBrokenRunes((old) => ({ ...old, [t.rune]: true }))} />
                    <span className={`rrRuneSymbol ${t.rune}`}>{runeFallbackText(t.rune)}</span>
                    <i className="rrTileRim" />
                  </div>
                </button>
              );
            })}
            {fog.map((f, i) => {
              if (!f) return null;
              const { r, c } = rcFromIdx(n, i);
              const p = xy(r, c);
              return (
                <div key={`fog-${i}`} className="rrFog" style={{ width: tilePx, height: tilePx, transform: `translate3d(${p.x}px, ${p.y}px, 0)` }}>
                  <div className="fogCloud">
                    <div className="fogBase" />
                    <div className="fogPuff p1" />
                    <div className="fogPuff p2" />
                    <div className="fogPuff p3" />
                    <div className="fogPuff p4" />
                    <div className="fogVeil" />
                  </div>
                </div>
              );
            })}
            <div className="rrFloatLayer">
              {floatTexts.map((t) => <div key={t.id} className={`rrFloat ${t.kind}`} style={{ left: t.x, top: t.y }}>{t.text}</div>)}
            </div>
          </div>
        </div>

        <footer className="rrBottomBar">
          <button onClick={() => setSoundOn((v) => !v)}>{soundOn ? "🔊" : "🔇"}<span>SOUND</span></button>
          <button onClick={restartLevel} disabled={lives <= 0}>↻<span>RESTART</span></button>
          <button onClick={shareNow}>↗<span>SHARE</span></button>
        </footer>
      </section>

      {phase === "victory" && <div className="rrVictory"><b>RUNIC CLEAR</b></div>}
      {phase === "win" && <GameModal title="LEVEL COMPLETE" sub="Clean run. Nice combo chain." left="Next" right="Share" onLeft={nextLevel} onRight={shareNow} />}
      {phase === "fail" && <GameModal title="OUT OF MOVES" sub="A life was used." left="Retry" right="Share" onLeft={restartLevel} onRight={shareNow} />}
      {phase === "outoflives" && <GameModal title="NO LIVES LEFT" sub="Wait for life regen." left="Restart" right="Share" onLeft={restartLevel} onRight={shareNow} />}

      <style jsx global>{`
        html, body { margin: 0; padding: 0; min-height: 100%; background: #020705; overscroll-behavior-y: none; }
        *, *::before, *::after { box-sizing: border-box; }
        body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #f6edd0; overflow-x: hidden; -webkit-font-smoothing: antialiased; text-rendering: geometricPrecision; }
        button { font: inherit; color: inherit; -webkit-tap-highlight-color: transparent; }
        .rrApp { min-height: 100vh; min-height: 100dvh; display: flex; justify-content: flex-start; align-items: center; padding: 9px 7px max(8px, env(safe-area-inset-bottom)); position: relative; overflow-x: hidden; }
        .rrBg { position: fixed; inset: 0; z-index: -2; background: radial-gradient(circle at 50% 10%, rgba(27, 86, 55, .28), rgba(0,0,0,0) 46%), radial-gradient(circle at 50% 78%, rgba(12, 38, 29, .42), rgba(0,0,0,0) 54%), linear-gradient(180deg, #07110d 0%, #020504 68%, #000 100%); }
        .rrShell { width: min(97vw, 720px); display: flex; flex-direction: column; gap: 8px; align-items: center; }
        .rrTopHud, .rrStats, .rrGoalCard, .rrBottomBar { width: 100%; }
        .rrTopHud { display: grid; grid-template-columns: 44px 1fr 1fr 44px; gap: 7px; align-items: center; padding: 7px; border-radius: 24px; background: linear-gradient(180deg, rgba(13,21,18,.94), rgba(5,8,7,.94)), url('/textures/obsidian.png') center/cover; border: 1px solid rgba(205, 176, 102, .15); box-shadow: 0 8px 18px rgba(0,0,0,.28), inset 0 1px rgba(255,255,255,.06); }
        .rrNavBtn { height: 46px; border-radius: 17px; border: 1px solid rgba(225,188,99,.14); background: linear-gradient(180deg, rgba(69,46,19,.8), rgba(13,10,8,.96)), url('/textures/obsidian.png') center/cover; font-size: 30px; font-weight: 900; color: #ffe39a; box-shadow: inset 0 1px rgba(255,255,255,.08); }
        .rrNavBtn:disabled { opacity: .32; }
        .rrLevelPill, .rrLifePill { height: 46px; border-radius: 18px; display: flex; align-items: center; justify-content: center; gap: 10px; background: linear-gradient(180deg, rgba(20,159,71,.86), rgba(5,76,33,.86)), url('/textures/obsidian.png') center/cover; border: 1px solid rgba(177,255,160,.2); box-shadow: inset 0 1px rgba(255,255,255,.18), 0 5px 12px rgba(0,0,0,.22); }
        .rrLevelPill span, .rrLifePill em { font-size: 11px; font-weight: 900; color: rgba(255,242,194,.8); font-style: normal; text-transform: uppercase; letter-spacing: .5px; }
        .rrLevelPill b, .rrLifePill b { font-size: 31px; line-height: 1; color: #fff5c5; text-shadow: 0 2px 0 rgba(0,0,0,.32); }
        .rrLifePill span { color: #f4524f; font-size: 21px; }
        .rrLifePill em { margin-left: auto; margin-right: 10px; font-size: 10px; }
        .rrStats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; background: rgba(0,0,0,.18); padding: 7px; }
        .rrStats div { height: 58px; border-radius: 17px; background: linear-gradient(180deg, rgba(16,20,18,.94), rgba(3,5,4,.97)), url('/textures/obsidian.png') center/cover; display: grid; place-items: center; border: 1px solid rgba(222,200,128,.13); }
        .rrStats span { font-size: 12px; color: rgba(239,220,157,.75); font-weight: 900; letter-spacing: .6px; }
        .rrStats b { font-size: 28px; line-height: 1; color: #ffefb6; text-shadow: 0 2px rgba(0,0,0,.25); }
        .rrGoalCard { min-height: 92px; border-radius: 24px; padding: 13px 13px; display: grid; grid-template-columns: 54px 1fr auto; gap: 11px; align-items: center; background: linear-gradient(180deg, rgba(17,28,24,.94), rgba(4,8,7,.96)), url('/textures/obsidian.png') center/cover; border: 1px solid rgba(134,205,116,.22); box-shadow: 0 9px 18px rgba(0,0,0,.24), inset 0 1px rgba(255,255,255,.05); }
        .rrGoalIcon { font-size: 34px; display: grid; place-items: center; }
        .rrGoalLabel { color: rgba(238,219,155,.75); font-size: 12px; font-weight: 900; letter-spacing: .7px; }
        .rrGoalTitle { font-weight: 900; font-size: 25px; line-height: 1.05; color: #fff4d2; }
        .rrProgress { margin-top: 8px; height: 12px; background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.09); border-radius: 99px; overflow: hidden; }
        .rrProgress div { height: 100%; border-radius: inherit; background: linear-gradient(90deg, #69ff45, #a9ff5a); transition: width 180ms ease-out; }
        .rrGoalCount { font-weight: 1000; font-size: 26px; color: #80fb56; white-space: nowrap; }
        .rrTargets { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 7px; }
        .rrTargetChip { display: inline-flex; align-items: center; gap: 5px; min-width: 48px; height: 28px; padding: 4px 7px; border-radius: 99px; background: rgba(0,0,0,.22); border: 1px solid rgba(255,255,255,.08); }
        .rrTargetChip .rrRuneWrap { width: 19px; height: 19px; }
        .rrTargetChip span { font-weight: 900; color: #fff1bd; font-size: 14px; }
        .rrBoardFrame { border-radius: 26px; display: grid; place-items: center; background: linear-gradient(180deg, rgba(102,58,23,.78), rgba(11,8,6,.92)), url('/textures/obsidian.png') center/cover; border: 1px solid rgba(239,176,83,.22); box-shadow: 0 16px 35px rgba(0,0,0,.42), inset 0 1px rgba(255,255,255,.08); }
        .rrBoard { position: relative; overflow: hidden; border-radius: 20px; background: linear-gradient(rgba(0,0,0,.16), rgba(0,0,0,.26)), url('/textures/obsidian.png') center/cover no-repeat; touch-action: none; transform: translateZ(0); isolation:isolate; }
        .rrTile { position: absolute; border: 0; background: transparent; padding: 0; border-radius: 13px; will-change: transform; touch-action: none; z-index: 10; }
        .rrTileInner { position: relative; width: 100%; height: 100%; border-radius: 13px; overflow: hidden; display: grid; place-items: center; background-image: linear-gradient(180deg, rgba(255,255,255,.08), rgba(0,0,0,.18) 58%, rgba(0,0,0,.34)), url('/textures/obsidian.png'); background-size: 100% 100%, 175% 175%; background-position: center, var(--tx) var(--ty); background-repeat:no-repeat; box-shadow: inset 0 1px rgba(255,255,255,.14), inset 0 -3px rgba(0,0,0,.42), 0 2px 4px rgba(0,0,0,.24); transform: translate3d(0,0,0); backface-visibility:hidden; }
        .rrTileRim { position: absolute; inset: 0; border-radius: inherit; border: 1px solid rgba(255,255,255,.1); box-shadow: inset 0 0 0 1px rgba(0,0,0,.18); pointer-events: none; }
        .rrRuneWrap { position: relative; z-index: 4; width: 72%; height: 72%; display: grid; place-items: center; transform:translate3d(0,0,0); backface-visibility:hidden; }
        .rrRuneImg { width: 100%; height: 100%; object-fit: contain; display: block; transform: translate3d(0,0,0); backface-visibility:hidden; image-rendering:auto; filter:none; }
        .rrRuneSymbol { position: absolute; z-index: 2; font-size: 25px; opacity: 0; pointer-events: none; font-weight: 900; }
        .rrRuneWrap.broken + .rrRuneSymbol { opacity: .95; z-index: 5; font-size: 31px; }
        .rrRuneWrap.broken .rrRuneImg { display: none; }
        .rrRuneSymbol.blue { color: #43c3ff; }
        .rrRuneSymbol.spiral { color: #1d91ff; }
        .rrRuneSymbol.orange { color: #ffa53c; }
        .rrRuneSymbol.triangle { color: #ff4848; }
        .rrRuneSymbol.leaf { color: #62dc5d; }
        .rrRuneSymbol.golden { color: #ffdb64; }
        .rrRuneSymbol.lotus { color: #f7c4ff; }
        .rrTile.selected .rrTileInner { outline: 2px solid rgba(159,255,103,.72); box-shadow: 0 0 0 4px rgba(105,255,76,.14), inset 0 1px rgba(255,255,255,.12), 0 5px 9px rgba(0,0,0,.25); }
        .rrTile.golden .rrTileInner { box-shadow: inset 0 1px rgba(255,255,255,.1), inset 0 -3px rgba(0,0,0,.42), 0 0 0 1px rgba(255,219,99,.12), 0 4px 7px rgba(0,0,0,.28); }
        .rrTile.lotus .rrTileInner { box-shadow: inset 0 1px rgba(255,255,255,.1), inset 0 -3px rgba(0,0,0,.42), 0 0 0 1px rgba(247,171,255,.14), 0 4px 7px rgba(0,0,0,.28); }
        .rrTile.targetPulse .rrTileInner { animation: rrTargetPulse .34s ease-in-out infinite alternate; }
        .rrTile.pop .rrTileInner { animation: rrPop ${POP_MS}ms cubic-bezier(.2,1.4,.2,1) var(--pop-delay) forwards; }
        .rrTile.pop .rrTileInner::after { content:""; position:absolute; inset:12%; border-radius:999px; background:radial-gradient(circle, rgba(255,244,190,.55), rgba(255,244,190,0) 62%); opacity:0; animation: rrPopFlash ${POP_MS}ms ease-out var(--pop-delay) forwards; pointer-events:none; z-index:9; }
        @keyframes rrPop { 0% { opacity:1; transform:scale(1); } 42% { opacity:1; transform:scale(1.08); } 100% { opacity:0; transform:scale(.66); } }
        @keyframes rrPopFlash { 0%{opacity:0; transform:scale(.55);} 35%{opacity:.72; transform:scale(1.1);} 100%{opacity:0; transform:scale(1.55);} }
        @keyframes rrTargetPulse { from { transform:scale(1); } to { transform:scale(1.07); box-shadow:0 0 0 3px rgba(100,210,255,.16), inset 0 1px rgba(255,255,255,.12); } }
        .hintMove { animation: rrHintMove ${HINT_DURATION_MS}ms cubic-bezier(.18,1.25,.24,1) both; }
        @keyframes rrHintMove { 0%,100% { transform:translate3d(0,0,0) scale(1); } 28% { transform:translate3d(var(--hint-x),var(--hint-y),0) scale(1.06); } 55% { transform:translate3d(0,0,0) scale(1.02); } 78% { transform:translate3d(calc(var(--hint-x)*.65),calc(var(--hint-y)*.65),0) scale(1.05); } }
        .rrSpawnFx { position:absolute; z-index:125; pointer-events:none; border-radius:13px; }
        .rrSpawnFx i, .rrSpawnFx b { position:absolute; inset:-35%; border-radius:50%; pointer-events:none; }
        .rrSpawnFx i { border:2px solid rgba(255,233,133,.9); box-shadow:0 0 12px rgba(255,227,118,.32); animation: rrSpawnRing .48s ease-out forwards; }
        .rrSpawnFx b { background: radial-gradient(circle, rgba(255,247,178,.62), rgba(255,247,178,0) 62%); animation: rrSpawnGlow .48s ease-out forwards; }
        .rrSpawnFx.lotus i { border-color: rgba(243,176,255,.92); animation-duration:.58s; }
        .rrSpawnFx.lotus b { background: radial-gradient(circle, rgba(242,181,255,.62), rgba(116,255,183,.16) 45%, rgba(255,255,255,0) 70%); animation-duration:.58s; }
        @keyframes rrSpawnRing { from { opacity:.95; transform:scale(.35); } to { opacity:0; transform:scale(1.68); } }
        @keyframes rrSpawnGlow { from { opacity:.7; transform:scale(.5); } to { opacity:0; transform:scale(1.35); } }
        .rrPowerLine { position:absolute; z-index:130; pointer-events:none; opacity:0; animation: rrPowerFade ${GOLD_CHARGE_MS + GOLD_SWEEP_MS}ms linear forwards; }
        .rrPowerGlow, .rrPowerCore, .rrPowerHead { position:absolute; pointer-events:none; }
        .rrPowerGlow { inset:-5px; border-radius:999px; background: rgba(255,224,106,.18); transform-origin:center; animation: rrLineGrow ${GOLD_SWEEP_MS}ms ease-out ${GOLD_CHARGE_MS}ms forwards; transform:scaleX(0); }
        .rrPowerCore { inset:5px 0; border-radius:999px; background: linear-gradient(90deg, rgba(255,239,142,0), rgba(255,255,230,1) 45%, rgba(255,227,87,.95) 55%, rgba(255,239,142,0)); box-shadow:0 0 9px rgba(255,223,92,.38); transform-origin:center; animation: rrLineGrow ${GOLD_SWEEP_MS}ms ease-out ${GOLD_CHARGE_MS}ms forwards; transform:scaleX(0); }
        .rrPowerHead { width:18px; height:18px; border-radius:50%; top:50%; left:-9px; transform:translateY(-50%); background:radial-gradient(circle, #fff, #ffe06b 50%, rgba(255,224,107,0) 74%); animation: rrHeadX ${GOLD_SWEEP_MS}ms ease-out ${GOLD_CHARGE_MS}ms forwards; opacity:0; }
        .rrPower-v .rrPowerGlow, .rrPower-v .rrPowerCore { transform:scaleY(0); animation-name: rrLineGrowY; }
        .rrPower-v .rrPowerCore { inset:0 6px; background: linear-gradient(180deg, rgba(255,239,142,0), rgba(255,243,174,.98), rgba(255,239,142,0)); }
        .rrPower-v .rrPowerHead { left:50%; top:-10px; transform:translateX(-50%); animation-name: rrHeadY; }
        .rrPower-cross .rrPowerHead { display:none; }
        .rrPower-cross .rrPowerGlow, .rrPower-cross .rrPowerCore { display:none; }
        .rrPower-cross::before, .rrPower-cross::after { content:""; position:absolute; border-radius:999px; background:rgba(255,235,134,.88); box-shadow:0 0 13px rgba(255,225,100,.35); animation: rrCross .32s ease-out forwards; }
        .rrPower-cross::before { left:8px; right:8px; top:50%; height:7px; transform:translateY(-50%); }
        .rrPower-cross::after { top:8px; bottom:8px; left:50%; width:7px; transform:translateX(-50%); }
        @keyframes rrPowerFade { 0%{opacity:0;} 12%{opacity:1;} 85%{opacity:1;} 100%{opacity:0;} }
        @keyframes rrLineGrow { to { transform:scaleX(1); } }
        @keyframes rrLineGrowY { to { transform:scaleY(1); } }
        @keyframes rrHeadX { 0%{opacity:0; left:-10px;} 12%{opacity:1;} 88%{opacity:1;} 100%{opacity:0; left:calc(100% - 12px);} }
        @keyframes rrHeadY { 0%{opacity:0; top:-10px;} 12%{opacity:1;} 88%{opacity:1;} 100%{opacity:0; top:calc(100% - 12px);} }
        @keyframes rrCross { 0%{opacity:0; transform:scale(.1);} 25%{opacity:1;} 100%{opacity:0; transform:scale(1);} }
        .rrLotusFx { position:absolute; z-index:128; pointer-events:none; border-radius:50%; }
        .rrLotusFx i { position:absolute; pointer-events:none; border-radius:50%; }
        .rrLotusFx .ring { inset:-55%; border:2px solid rgba(241,179,255,.8); opacity:0; animation: rrLotusRing .6s ease-out forwards; }
        .rrLotusFx .r2 { animation-delay:.08s; border-color:rgba(117,255,187,.55); }
        .rrLotusFx .r3 { animation-delay:.14s; border-color:rgba(255,241,162,.55); }
        .rrLotusFx .burst { inset:-80%; background:radial-gradient(circle, rgba(255,255,255,.48), rgba(244,162,255,.22) 36%, rgba(86,255,176,.08) 56%, transparent 72%); animation: rrLotusBurst .55s ease-out forwards; }
        .rrLotusFx .bloom { inset:-40%; background:radial-gradient(circle, rgba(255,255,255,.8), rgba(255,255,255,0) 60%); animation: rrLotusBloom .36s ease-out forwards; }
        .rrLotusFx.mega .ring, .rrLotusFx.mega .burst, .rrLotusFx.mega .bloom { inset:-165%; }
        @keyframes rrLotusRing { 0%{opacity:0; transform:scale(.25);} 22%{opacity:1;} 100%{opacity:0; transform:scale(1.75);} }
        @keyframes rrLotusBurst { from{opacity:.72; transform:scale(.45);} to{opacity:0; transform:scale(1.45);} }
        @keyframes rrLotusBloom { from{opacity:.85; transform:scale(.25);} to{opacity:0; transform:scale(1.2);} }
        .rrFog { position:absolute; z-index:80; border-radius:13px; overflow:hidden; pointer-events:none; contain:paint; }
        .fogCloud { position:absolute; inset:0; border-radius:inherit; overflow:hidden; animation: rrFogPulse 2.6s ease-in-out infinite; background:rgba(245,248,245,.08); }
        .fogBase { position:absolute; inset:0; border-radius:inherit; background:radial-gradient(circle at 50% 48%, rgba(255,255,255,.50), rgba(235,238,236,.28) 42%, rgba(110,116,112,.22) 72%, rgba(0,0,0,.10) 100%); }
        .fogPuff { position:absolute; width:62%; height:62%; border-radius:999px; background:radial-gradient(circle, rgba(255,255,255,.88) 0 18%, rgba(242,246,244,.55) 34%, rgba(220,226,222,.20) 55%, transparent 73%); opacity:.86; will-change:transform, opacity; }
        .fogPuff.p1 { left:-10%; top:2%; animation: rrFogPuffA 2.8s ease-in-out infinite; }
        .fogPuff.p2 { right:-13%; top:10%; opacity:.72; animation: rrFogPuffB 3.4s ease-in-out infinite; }
        .fogPuff.p3 { left:14%; bottom:-17%; opacity:.64; animation: rrFogPuffC 3.9s ease-in-out infinite; }
        .fogPuff.p4 { right:8%; bottom:-10%; opacity:.52; animation: rrFogPuffD 4.4s ease-in-out infinite; }
        .fogVeil { position:absolute; inset:0; border-radius:inherit; background:linear-gradient(135deg, rgba(255,255,255,.18), transparent 38%, rgba(255,255,255,.14)); opacity:.55; animation: rrFogVeil 3.2s ease-in-out infinite; }
        @keyframes rrFogPulse { 0%,100%{opacity:.93;} 50%{opacity:.78;} }
        @keyframes rrFogPuffA { 0%,100%{transform:translate3d(-2px,2px,0) scale(.92);} 50%{transform:translate3d(7px,-3px,0) scale(1.16);} }
        @keyframes rrFogPuffB { 0%,100%{transform:translate3d(3px,-2px,0) scale(.96);} 50%{transform:translate3d(-7px,4px,0) scale(1.2);} }
        @keyframes rrFogPuffC { 0%,100%{transform:translate3d(0,4px,0) scale(1.02);} 50%{transform:translate3d(3px,-6px,0) scale(1.24);} }
        @keyframes rrFogPuffD { 0%,100%{transform:translate3d(-1px,1px,0) scale(.94);} 50%{transform:translate3d(-4px,-5px,0) scale(1.18);} }
        @keyframes rrFogVeil { 0%,100%{transform:translate3d(-8%,0,0); opacity:.48;} 50%{transform:translate3d(8%,0,0); opacity:.66;} }
        .rrFloatLayer { position:absolute; inset:0; overflow:visible; pointer-events:none; z-index:310; }
        .rrFloat { position:absolute; transform:translate(-50%,-50%); font-weight:1000; pointer-events:none; white-space:nowrap; z-index:320; }
        .rrFloat.points { font-size:15px; color:#fff1ac; text-shadow:0 2px rgba(0,0,0,.5); animation: rrFloatUp .72s cubic-bezier(.16,1.25,.22,1) forwards; }
        .rrFloat.combo { font-size:17px; color:#ffd56e; text-shadow:0 2px rgba(0,0,0,.55); animation: rrComboFloat .9s cubic-bezier(.16,1.3,.22,1) forwards; }
        .rrFloat.special { font-size:15px; color:#defbd5; text-shadow:0 2px rgba(0,0,0,.5); animation: rrFloatUp .78s cubic-bezier(.16,1.25,.22,1) forwards; }
        @keyframes rrFloatUp { 0%{opacity:0; transform:translate(-50%,-50%) translateY(6px) scale(.72);} 18%{opacity:1; transform:translate(-50%,-50%) translateY(-2px) scale(1.12);} 100%{opacity:0; transform:translate(-50%,-50%) translateY(-28px) scale(.95);} }
        @keyframes rrComboFloat { 0%{opacity:0; transform:translate(-50%,-50%) scale(.62);} 20%{opacity:1; transform:translate(-50%,-50%) scale(1.18);} 100%{opacity:0; transform:translate(-50%,-50%) translateY(-36px) scale(.98);} }
        .rrBottomBar { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
        .rrBottomBar button { min-height:64px; border-radius:18px; border:1px solid rgba(222,200,128,.15); background:linear-gradient(180deg, rgba(18,24,21,.94), rgba(4,6,5,.97)), url('/textures/obsidian.png') center/cover; display:grid; place-items:center; font-size:23px; font-weight:900; box-shadow:inset 0 1px rgba(255,255,255,.06), 0 6px 13px rgba(0,0,0,.24); }
        .rrBottomBar button:nth-child(2) { background:linear-gradient(180deg, rgba(20,154,73,.88), rgba(7,74,34,.94)), url('/textures/obsidian.png') center/cover; }
        .rrBottomBar span { font-size:12px; letter-spacing:.6px; color:rgba(255,239,190,.75); }
        .rrVictory, .rrModalBg { position:fixed; inset:0; display:grid; place-items:center; z-index:800; background:rgba(0,0,0,.52); }
        .rrVictory b { font-size:22px; color:#fff1b7; animation:rrWinPulse .75s ease-in-out infinite alternate; }
        @keyframes rrWinPulse { to { transform:scale(1.08); } }
        .rrModal { width:min(92vw, 500px); border-radius:28px; padding:25px 23px 22px; background:linear-gradient(180deg, rgba(22,39,30,.98), rgba(5,8,6,.99)), url('/textures/obsidian.png') center/cover; border:1px solid rgba(214,194,118,.2); box-shadow:0 24px 50px rgba(0,0,0,.48), inset 0 1px rgba(255,255,255,.08); }
        .rrModalTitle { font-size:26px; color:#fff0b0; font-weight:1000; }
        .rrModalSub { font-size:17px; color:rgba(255,255,255,.86); margin-top:8px; }
        .rrModalBtns { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:22px; }
        .rrModalBtns button { height:58px; border-radius:18px; border:1px solid rgba(255,255,255,.12); background:linear-gradient(180deg, rgba(22,150,210,.9), rgba(6,85,135,.96)), url('/textures/obsidian.png') center/cover; color:#fff; font-size:20px; font-weight:800; box-shadow:inset 0 1px rgba(255,255,255,.13); }
        .rrModalBtns button:last-child { background:linear-gradient(180deg, rgba(28,31,28,.96), rgba(6,7,6,.98)), url('/textures/obsidian.png') center/cover; }

        @media (update: slow) {
          .rrSpawnFx i, .rrSpawnFx b, .rrPowerLine, .rrLotusFx .ring, .rrLotusFx .burst, .rrLotusFx .bloom, .rrTile.pop .rrTileInner, .fogCloud, .fogPuff, .fogVeil { animation-play-state: running; }
        }
        @media (max-width:520px) {
          .rrApp { padding-inline:7px; }
          .rrShell { gap:7px; }
          .rrTopHud { grid-template-columns:42px 1fr 1fr 42px; padding:6px; }
          .rrStats div { height:56px; }
          .rrGoalTitle { font-size:23px; }
          .rrGoalCount { font-size:24px; }
          .rrRuneWrap { width:73%; height:73%; }
          .rrBottomBar button { min-height:58px; }
        }
      `}</style>
    </main>
  );
}

function RuneImage({ rune, broken, onBroken }: { rune: Rune; broken: boolean; onBroken: () => void }) {
  return (
    <span className={`rrRuneWrap ${broken ? "broken" : ""}`}>
      <img className="rrRuneImg" src={imgRune(rune)} alt={rune} draggable={false} onError={onBroken} />
    </span>
  );
}

function powerLineStyle(line: PowerLine, xy: (r: number, c: number) => { x: number; y: number }, tilePx: number, boardInnerPx: number): React.CSSProperties {
  if (line.dir === "h") {
    return { left: PAD, top: xy(line.r, line.c).y + tilePx / 2 - 6, width: boardInnerPx - PAD * 2, height: 12 };
  }
  if (line.dir === "v") {
    return { left: xy(line.r, line.c).x + tilePx / 2 - 6, top: PAD, width: 12, height: boardInnerPx - PAD * 2 };
  }
  return { left: 0, top: 0, width: boardInnerPx, height: boardInnerPx };
}

function GameModal({ title, sub, left, right, onLeft, onRight }: { title: string; sub: string; left: string; right: string; onLeft: () => void; onRight: () => void }) {
  return (
    <div className="rrModalBg">
      <div className="rrModal">
        <div className="rrModalTitle">{title}</div>
        <div className="rrModalSub">{sub}</div>
        <div className="rrModalBtns">
          <button onClick={onLeft}>{left}</button>
          <button onClick={onRight}>{right}</button>
        </div>
      </div>
    </div>
  );
}



