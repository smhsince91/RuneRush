"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

type Rune = "blue" | "spiral" | "orange" | "triangle" | "leaf" | "time" | "moon" | "golden" | "lotus";
type ObjectiveKind = "score" | "collect" | "fog" | "ingredient" | "mixed";

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
  phase: "idle" | "busy" | "finale" | "win" | "fail";
  message: string;
};

type LifeState = {
  lives: number;
  nextLifeAt: number | null;
  countdown: string;
  loaded: boolean;
};

const MAX_LIVES = 7;
const LIFE_REGEN_MS = 30 * 60 * 1000;
const LIFE_STORAGE_KEY = "toby-rune-rush-lives-v1";
const UNLOCK_STORAGE_KEY = "toby-rune-rush-unlocked-level-v26";
const BEST_SCORE_STORAGE_KEY = "toby-rune-rush-best-scores-v1";
const AUDIO_SETTINGS_STORAGE_KEY = "toby-rune-rush-audio-settings-v2";
const MUSIC_CANDIDATES = [
  "/music/Dreamers%20Path.mp3",
  "/music/Dreamers Path.mp3",
  "/music/DYYDKvYOniU.mp3",
  "/music/tobyworld-background.mp3",
  "/music/theme.mp3",
  "/music/background.mp3",
  "/music/toby-theme.mp3",
  "/sounds/music.mp3",
  "/audio/music.mp3",
];
const PRIMARY_MUSIC_PRELOAD = "/music/Dreamers%20Path.mp3";

const YOUTUBE_MUSIC_EMBED = "https://www.youtube.com/embed/DYYDKvYOniU?enablejsapi=1&autoplay=1&loop=1&playlist=DYYDKvYOniU&controls=0&disablekb=1&modestbranding=1&playsinline=1";
const INGREDIENT_IMAGES = {
  key: "/ingredients/key.png?v=ingredients-old1",
  coin: "/ingredients/coin.png?v=ingredients-old1",
} as const;
const RUNE_IMAGES: Record<Rune, string> = {
  blue: "/runes/blue.png?v=full17",
  spiral: "/runes/spiral.png?v=full17",
  orange: "/runes/orange.png?v=full17",
  triangle: "/runes/triangle.png?v=full17",
  leaf: "/runes/leaf.png?v=full17",
  time: "/runes/time.png?v=full17",
  moon: "/runes/moon.png?v=full17",
  golden: "/runes/golden.png?v=full17",
  lotus: "/runes/lotus.png?v=full17",
};
const RUNE_LABELS: Record<Rune, string> = {
  blue: "Blue Rune",
  spiral: "Spiral Rune",
  orange: "Orange Rune",
  triangle: "Triangle Rune",
  leaf: "Leaf Rune",
  time: "Time Rune",
  moon: "Moon Rune",
  golden: "Golden Rune",
  lotus: "Lotus Rune",
};

type AudioSettings = {
  gameSounds: boolean;
  music: boolean;
  gameVolume: number;
  musicVolume: number;
};

const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  gameSounds: true,
  music: true,
  gameVolume: 0.85,
  musicVolume: 0.35,
};

function clampVolume(value: unknown, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function cleanAudioSettings(value: unknown): AudioSettings {
  if (!value || typeof value !== "object") return DEFAULT_AUDIO_SETTINGS;
  const raw = value as Partial<Record<keyof AudioSettings, unknown>>;
  return {
    gameSounds: typeof raw.gameSounds === "boolean" ? raw.gameSounds : DEFAULT_AUDIO_SETTINGS.gameSounds,
    music: typeof raw.music === "boolean" ? raw.music : DEFAULT_AUDIO_SETTINGS.music,
    gameVolume: clampVolume(raw.gameVolume, DEFAULT_AUDIO_SETTINGS.gameVolume),
    musicVolume: clampVolume(raw.musicVolume, DEFAULT_AUDIO_SETTINGS.musicVolume),
  };
}

function loadAudioSettings(): AudioSettings {
  if (typeof window === "undefined") return DEFAULT_AUDIO_SETTINGS;
  try {
    const raw = window.localStorage.getItem(AUDIO_SETTINGS_STORAGE_KEY);
    return cleanAudioSettings(raw ? JSON.parse(raw) : DEFAULT_AUDIO_SETTINGS);
  } catch {
    return DEFAULT_AUDIO_SETTINGS;
  }
}

function saveAudioSettings(settings: AudioSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(cleanAudioSettings(settings)));
  } catch {}
}

function loadUnlockedLevel() {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(UNLOCK_STORAGE_KEY);
    const value = Number(raw ?? 0);
    return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  } catch {
    return 0;
  }
}

function saveUnlockedLevel(levelIndex: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(UNLOCK_STORAGE_KEY, String(Math.max(0, Math.floor(levelIndex))));
  } catch {}
}

type BestScores = Record<string, number>;

function cleanBestScores(value: unknown): BestScores {
  if (!value || typeof value !== "object") return {};
  const out: BestScores = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const level = Math.max(0, Math.floor(Number(key)));
    const score = Math.max(0, Math.floor(Number(raw)));
    if (Number.isFinite(level) && Number.isFinite(score) && score > 0) out[String(level)] = score;
  }
  return out;
}

function loadBestScores(): BestScores {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(BEST_SCORE_STORAGE_KEY);
    return cleanBestScores(raw ? JSON.parse(raw) : {});
  } catch {
    return {};
  }
}

function saveBestScores(scores: BestScores) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BEST_SCORE_STORAGE_KEY, JSON.stringify(cleanBestScores(scores)));
  } catch {}
}

function getBestScore(scores: BestScores, levelIndex: number) {
  return Math.max(0, Math.floor(scores[String(Math.max(0, levelIndex))] ?? 0));
}


const RUNE_ICON_FILES: Record<Rune, string> = {
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

const FAST_START_IMAGE_PRELOADS = [
  "/textures/obsidian.png?v=full13",
  ...Object.values(RUNE_ICON_FILES).map((src) => `${src}?v=full17`),
  "/ingredients/key.png?v=item108",
  "/ingredients/coin.png?v=item108",
] as const;

const loadRuneRushPixiBoard = () => import("./components/RuneRushPixiBoard");

const RuneRushPixiBoard = dynamic(loadRuneRushPixiBoard, {
  ssr: false,
  loading: () => (
    <div className="loadingBoard" aria-label="Preparing Rune Rush board">
      <span className="loadingBoardPulse" />
    </div>
  ),
});

function clampLives(v: number) {
  return Math.max(0, Math.min(MAX_LIVES, Math.floor(Number.isFinite(v) ? v : MAX_LIVES)));
}

function formatLifeCountdown(nextLifeAt: number | null, lives: number) {
  if (lives >= MAX_LIVES || !nextLifeAt) return "FULL";
  const remaining = Math.max(0, nextLifeAt - Date.now());
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function saveLifeState(state: LifeState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      LIFE_STORAGE_KEY,
      JSON.stringify({
        lives: clampLives(state.lives),
        nextLifeAt: state.nextLifeAt,
      })
    );
  } catch {}
}

function updateLifeTimer(state: LifeState): LifeState {
  const now = Date.now();
  let lives = clampLives(state.lives);
  let nextLifeAt = state.nextLifeAt && Number.isFinite(state.nextLifeAt) ? state.nextLifeAt : null;

  if (lives >= MAX_LIVES) {
    nextLifeAt = null;
    return { lives: MAX_LIVES, nextLifeAt, countdown: "FULL", loaded: true };
  }

  if (!nextLifeAt) nextLifeAt = now + LIFE_REGEN_MS;

  while (lives < MAX_LIVES && nextLifeAt && now >= nextLifeAt) {
    lives += 1;
    nextLifeAt += LIFE_REGEN_MS;
  }

  if (lives >= MAX_LIVES) nextLifeAt = null;

  return {
    lives: clampLives(lives),
    nextLifeAt,
    countdown: formatLifeCountdown(nextLifeAt, lives),
    loaded: true,
  };
}

function loadLifeState(): LifeState {
  if (typeof window === "undefined") {
    return { lives: MAX_LIVES, nextLifeAt: null, countdown: "FULL", loaded: false };
  }

  try {
    const raw = window.localStorage.getItem(LIFE_STORAGE_KEY);
    if (!raw) return { lives: MAX_LIVES, nextLifeAt: null, countdown: "FULL", loaded: true };
    const parsed = JSON.parse(raw) as Partial<LifeState>;
    return updateLifeTimer({
      lives: clampLives(parsed.lives ?? MAX_LIVES),
      nextLifeAt: typeof parsed.nextLifeAt === "number" ? parsed.nextLifeAt : null,
      countdown: "FULL",
      loaded: true,
    });
  } catch {
    return { lives: MAX_LIVES, nextLifeAt: null, countdown: "FULL", loaded: true };
  }
}

function getLives(state?: LifeState) {
  return clampLives(state ? updateLifeTimer(state).lives : loadLifeState().lives);
}

function canStartLevel(state: LifeState) {
  return getLives(state) > 0;
}

function loseLife(state: LifeState): LifeState {
  const fresh = updateLifeTimer(state);
  const lives = clampLives(fresh.lives - 1);
  const nextLifeAt = lives >= MAX_LIVES ? null : fresh.nextLifeAt ?? Date.now() + LIFE_REGEN_MS;
  return updateLifeTimer({ lives, nextLifeAt, countdown: "FULL", loaded: true });
}

function restoreLife(state: LifeState): LifeState {
  const fresh = updateLifeTimer(state);
  const lives = clampLives(fresh.lives + 1);
  const nextLifeAt = lives >= MAX_LIVES ? null : fresh.nextLifeAt ?? Date.now() + LIFE_REGEN_MS;
  return updateLifeTimer({ lives, nextLifeAt, countdown: "FULL", loaded: true });
}

const emptyHud: HudState = {
  level: 1,
  moves: 17,
  score: 0,
  combo: 0,
  lives: 7,
  objectiveKind: "score",
  objectiveLabel: "Reach Score",
  objectiveText: "0/950",
  progress: 0,
  phase: "idle",
  message: "Swipe runes to match 3+",
};

function objectiveDirections(hud: HudState) {
  if (hud.objectiveKind === "mixed") return "Finish every shown goal before moves run out.";
  if (hud.objectiveKind === "collect") return "Clear the shown rune type. Matches, cascades, and specials all count.";
  if (hud.objectiveKind === "fog") return "Make matches beside fog to break every fog tile before moves run out.";
  if (hud.objectiveKind === "ingredient") return "Clear runes below the Sacred Key and Golden Coin to guide them to the bottom.";
  return "Match 3+ runes, build cascades, and reach the score before moves run out.";
}

const SCORE_FORMATTER = new Intl.NumberFormat("en-US");
function formatScore(n: number) {
  return SCORE_FORMATTER.format(Math.round(Number.isFinite(n) ? n : 0));
}

const TOADGOD_WIN_SAYINGS = [
  "the pond remembers the ones who remained.",
  "a quiet bloom becomes loud when the hour aligns.",
  "the runes noticed. the chain remembered.",
  "patience did not wait. it became the path.",
  "small toads, steady hearts, written in the stone.",
];

const OUT_OF_MOVES_QUOTES = [
  "The pond remembers those who remain.",
  "Not all chains bloom on the first attempt.",
  "Stand still. Breathe. The next ripple may reveal the path.",
  "A toad who fails once has only found the hidden wall.",
  "The stone does not break the faithful. It teaches them.",
  "Try again. The reeds bend, but they do not surrender.",
  "Even in still water, the next move is waiting.",
  "The rune path closes only to test the patient.",
  "Remain unchanged. The board will reveal itself.",
  "No bloom is lost. Every attempt sinks into the chain.",
  "The pond is quiet, not empty.",
  "Again, little toad. The sacred chain is not finished.",
  "Failure is only fog before the lotus opens.",
  "The patient do not lose. They return wiser.",
  "A cleaner chain waits beneath the stone.",
  "The board is not against you. It is teaching patience.",
  "Every broken chain leaves a mark in the stone.",
  "Return once more. The hidden path favors the unmoved.",
  "The lotus does not rush. It opens when the chain is ready.",
  "Do not leave the pond before the ripple answers.",
];

function pickOutOfMovesQuote() {
  return OUT_OF_MOVES_QUOTES[Math.floor(Math.random() * OUT_OF_MOVES_QUOTES.length)];
}

export default function RuneRushPixiFullPage() {
  const [levelIndex, setLevelIndex] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(DEFAULT_AUDIO_SETTINGS);
  const [soundMenuOpen, setSoundMenuOpen] = useState(false);
  const [youtubeMusicFallbackActive, setYoutubeMusicFallbackActive] = useState(false);
  const [hud, setHud] = useState<HudState>(emptyHud);
  const [lifeState, setLifeState] = useState<LifeState>({ lives: MAX_LIVES, nextLifeAt: null, countdown: "FULL", loaded: false });
  const [highestUnlocked, setHighestUnlocked] = useState(0);
  const [bestScores, setBestScores] = useState<BestScores>({});
  const [runAllowed, setRunAllowed] = useState(true);
  const [noLivesMessage, setNoLivesMessage] = useState("");
  const [outOfMovesQuote, setOutOfMovesQuote] = useState(OUT_OF_MOVES_QUOTES[0]);
  const failedLevelKeys = useRef(new Set<string>());
  const bestSavedLevelKeys = useRef(new Set<string>());
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const musicFadeRef = useRef<number | null>(null);
  const musicFailedRef = useRef(false);
  const musicIndexRef = useRef(0);
  const musicWantedRef = useRef(audioSettings.music);
  const youtubeMusicFallbackRef = useRef(false);
  const youtubeFrameRef = useRef<HTMLIFrameElement | null>(null);
  const soundMenuRef = useRef<HTMLDivElement | null>(null);
  const pageShellRef = useRef<HTMLElement | null>(null);
  const infoHubRef = useRef<HTMLElement | null>(null);
  const bottomBarRef = useRef<HTMLElement | null>(null);
  const mobileLayoutFrameRef = useRef<number | null>(null);
  const previousPhaseRef = useRef<HudState["phase"]>("idle");
  const audioSettingsLoadedRef = useRef(false);
  const boardKey = useMemo(() => `pixi-full-v150-${levelIndex}-${resetKey}`, [levelIndex, resetKey]);
  const canPlay = runAllowed || lifeState.lives > 0;
  const outOfLives = lifeState.loaded && lifeState.lives <= 0 && !canPlay;
  const currentBestScore = getBestScore(bestScores, levelIndex);
  const displayedBestScore = currentBestScore;
  const gameSoundsOn = audioSettings.gameSounds;
  const musicOn = audioSettings.music;
  const gameVolume = audioSettings.gameVolume;
  const musicVolume = audioSettings.musicVolume;
  const gameVolumePct = Math.round(gameVolume * 100);
  const musicVolumePct = Math.round(musicVolume * 100);
  const anyAudioOn = gameSoundsOn || musicOn;
  const collectRuneGoals = Object.entries(hud.collect ?? {})
    .filter((entry): entry is [Rune, number] => (entry[1] ?? 0) > 0 && !!RUNE_IMAGES[entry[0] as Rune])
    .map(([rune]) => ({ rune }));

  useEffect(() => {
    if (typeof window === "undefined") return;
    const shell = pageShellRef.current;
    const infoHub = infoHubRef.current;
    const bottomBar = bottomBarRef.current;
    if (!shell || !infoHub || !bottomBar) return;

    const mobileQuery = window.matchMedia("(max-width: 640px), (hover: none) and (pointer: coarse) and (max-width: 920px)");
    const readPx = (value: string) => {
      const n = Number.parseFloat(value);
      return Number.isFinite(n) ? n : 0;
    };

    const syncLayout = () => {
      mobileLayoutFrameRef.current = null;
      if (!mobileQuery.matches) {
        shell.style.removeProperty("--mobile-vh");
        shell.style.removeProperty("--game-w");
        shell.style.removeProperty("--mobile-fill-gap");
        shell.style.removeProperty("--mobile-hub-extra");
        shell.style.removeProperty("--mobile-hub-pad-extra");
        shell.style.removeProperty("--mobile-hub-gap-extra");
        shell.style.removeProperty("--mobile-hub-control-extra");
        shell.style.removeProperty("--mobile-hub-goal-extra");
        return;
      }

      const viewport = window.visualViewport;
      const viewportHeight = Math.max(320, Math.floor(viewport?.height ?? window.innerHeight));
      const viewportWidth = Math.max(280, Math.floor(viewport?.width ?? window.innerWidth));
      const styles = window.getComputedStyle(shell);
      const paddingTop = readPx(styles.paddingTop);
      const paddingRight = readPx(styles.paddingRight);
      const paddingBottom = readPx(styles.paddingBottom);
      const paddingLeft = readPx(styles.paddingLeft);
      const gap = readPx(styles.rowGap || styles.gap);
      const infoHeight = Math.ceil(infoHub.getBoundingClientRect().height);
      const footerHeight = Math.ceil(bottomBar.getBoundingClientRect().height);
      const verticalSpace = viewportHeight - paddingTop - paddingBottom - infoHeight - footerHeight - gap * 2;
      const widthSpace = viewportWidth - paddingLeft - paddingRight;
      const widthLimit = Math.max(220, Math.min(540, widthSpace));
      const heightLimit = Math.max(180, verticalSpace);
      const boardSize = Math.floor(Math.min(widthLimit, heightLimit));
      const spareHeight = Math.max(0, heightLimit - boardSize);
      const fillGap = Math.round(Math.min(4, Math.max(2, spareHeight * 0.018)));
      const hubExtra = Math.round(Math.min(14, spareHeight * 0.08));
      const hubPadExtra = Math.round(Math.min(4, hubExtra * 0.25));
      const hubGapExtra = Math.round(Math.min(3, hubExtra * 0.16));
      const hubControlExtra = Math.round(Math.min(5, hubExtra * 0.28));
      const hubGoalExtra = Math.round(Math.min(8, hubExtra * 0.48));

      shell.style.setProperty("--mobile-vh", `${viewportHeight}px`);
      shell.style.setProperty("--game-w", `${boardSize}px`);
      shell.style.setProperty("--mobile-fill-gap", `${fillGap}px`);
      shell.style.setProperty("--mobile-hub-extra", `${hubExtra}px`);
      shell.style.setProperty("--mobile-hub-pad-extra", `${hubPadExtra}px`);
      shell.style.setProperty("--mobile-hub-gap-extra", `${hubGapExtra}px`);
      shell.style.setProperty("--mobile-hub-control-extra", `${hubControlExtra}px`);
      shell.style.setProperty("--mobile-hub-goal-extra", `${hubGoalExtra}px`);
    };

    const queueLayoutSync = () => {
      if (mobileLayoutFrameRef.current != null) return;
      mobileLayoutFrameRef.current = window.requestAnimationFrame(syncLayout);
    };

    queueLayoutSync();
    const firstTimer = window.setTimeout(queueLayoutSync, 80);
    const settledTimer = window.setTimeout(queueLayoutSync, 360);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(queueLayoutSync) : null;
    observer?.observe(infoHub);
    observer?.observe(bottomBar);
    window.visualViewport?.addEventListener("resize", queueLayoutSync);
    window.visualViewport?.addEventListener("scroll", queueLayoutSync);
    window.addEventListener("resize", queueLayoutSync);
    window.addEventListener("orientationchange", queueLayoutSync);
    mobileQuery.addEventListener("change", queueLayoutSync);

    return () => {
      window.clearTimeout(firstTimer);
      window.clearTimeout(settledTimer);
      observer?.disconnect();
      window.visualViewport?.removeEventListener("resize", queueLayoutSync);
      window.visualViewport?.removeEventListener("scroll", queueLayoutSync);
      window.removeEventListener("resize", queueLayoutSync);
      window.removeEventListener("orientationchange", queueLayoutSync);
      mobileQuery.removeEventListener("change", queueLayoutSync);
      if (mobileLayoutFrameRef.current != null) {
        window.cancelAnimationFrame(mobileLayoutFrameRef.current);
        mobileLayoutFrameRef.current = null;
      }
    };
  }, []);

  const fadeMusicTo = (audio: HTMLAudioElement, targetVolume: number, duration = 360) => {
    if (typeof window === "undefined") {
      audio.volume = targetVolume;
      return;
    }
    if (musicFadeRef.current != null) {
      window.cancelAnimationFrame(musicFadeRef.current);
      musicFadeRef.current = null;
    }
    const startVolume = clampVolume(audio.volume, 0);
    const endVolume = clampVolume(targetVolume, DEFAULT_AUDIO_SETTINGS.musicVolume);
    const startedAt = window.performance.now();
    const tick = (now: number) => {
      const p = Math.max(0, Math.min(1, (now - startedAt) / Math.max(1, duration)));
      const eased = 1 - Math.pow(1 - p, 3);
      audio.volume = startVolume + (endVolume - startVolume) * eased;
      if (p < 1) {
        musicFadeRef.current = window.requestAnimationFrame(tick);
      } else {
        musicFadeRef.current = null;
        audio.volume = endVolume;
      }
    };
    musicFadeRef.current = window.requestAnimationFrame(tick);
  };

  const updateAudioSettings = (patch: Partial<AudioSettings>) => {
    setAudioSettings((prev) => {
      const next = cleanAudioSettings({ ...prev, ...patch });
      if (typeof patch.musicVolume === "number") {
        const audio = musicAudioRef.current;
        if (audio) fadeMusicTo(audio, next.musicVolume, 120);
        window.setTimeout(() => syncYoutubeMusic(next.musicVolume, next.music), 0);
      }
      if (typeof patch.music === "boolean") {
        musicWantedRef.current = next.music;
        window.setTimeout(() => {
          syncYoutubeMusic(next.musicVolume, next.music);
          if (next.music) playMusicIfAllowed(next.musicVolume);
        }, 0);
      }
      return next;
    });
  };

  const syncYoutubeMusic = (volume = musicVolume, shouldPlay = musicWantedRef.current) => {
    const frame = youtubeFrameRef.current;
    const target = frame?.contentWindow;
    if (!target) return;
    const send = (func: string, args: unknown[] = []) => {
      try {
        target.postMessage(JSON.stringify({ event: "command", func, args }), "*");
      } catch {}
    };
    send("setVolume", [Math.round(clampVolume(volume, DEFAULT_AUDIO_SETTINGS.musicVolume) * 100)]);
    if (shouldPlay) send("playVideo");
    else send("pauseVideo");
  };

  const getMusicAudio = () => {
    if (typeof window === "undefined") return null;
    if (musicAudioRef.current) return musicAudioRef.current;

    const prewarmed = (window as any).__tobyRuneRushMusicAudio;
    const audio = prewarmed instanceof HTMLAudioElement
      ? prewarmed
      : new Audio(MUSIC_CANDIDATES[musicIndexRef.current]);
    audio.loop = true;
    audio.preload = "auto";
    if (audio.paused) audio.volume = clampVolume(musicVolume, DEFAULT_AUDIO_SETTINGS.musicVolume);
    if (!(audio as any).__runeRushMusicWired) {
      (audio as any).__runeRushMusicWired = true;
      audio.addEventListener("error", () => {
        if (musicIndexRef.current >= MUSIC_CANDIDATES.length - 1) {
          // A YouTube watch URL cannot be used as a normal <audio> source.
          // If no local MP3 is found, fall back to the embedded looping YouTube player.
          musicFailedRef.current = true;
          youtubeMusicFallbackRef.current = true;
          setYoutubeMusicFallbackActive(true);
          window.setTimeout(() => syncYoutubeMusic(musicVolume, musicWantedRef.current), 150);
          return;
        }
        musicFailedRef.current = false;
        musicIndexRef.current += 1;
        audio.src = MUSIC_CANDIDATES[musicIndexRef.current];
        audio.volume = clampVolume(musicVolume, DEFAULT_AUDIO_SETTINGS.musicVolume);
        try { audio.load(); } catch {}
        if (musicWantedRef.current) {
          audio.play()
            .then(() => { audio.volume = clampVolume(musicVolume, DEFAULT_AUDIO_SETTINGS.musicVolume); })
            .catch(() => {});
        }
      });
      audio.addEventListener("canplay", () => {
        musicFailedRef.current = false;
        youtubeMusicFallbackRef.current = false;
        setYoutubeMusicFallbackActive(false);
        if (musicWantedRef.current && !audio.paused) fadeMusicTo(audio, musicVolume, 120);
      });
    }
    if (audio.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
      try { audio.load(); } catch {}
    }
    musicAudioRef.current = audio;
    return audio;
  };

  const playMusicIfAllowed = (volumeOverride?: number) => {
    if (!musicWantedRef.current) return;
    const activeVolume = typeof volumeOverride === "number" ? clampVolume(volumeOverride, musicVolume) : musicVolume;
    const audio = getMusicAudio();
    if (audio && !musicFailedRef.current) {
      const wasPaused = audio.paused;
      audio.volume = activeVolume;
      audio.muted = false;
      audio.play()
        .then(() => {
          if (wasPaused) audio.volume = activeVolume;
          else fadeMusicTo(audio, activeVolume, 60);
        })
        .catch(() => {
          // Mobile browsers may block autoplay until a tap. Keep the request alive for the next gesture.
        });
    }
    if (musicFailedRef.current || youtubeMusicFallbackRef.current) {
      youtubeMusicFallbackRef.current = true;
      setYoutubeMusicFallbackActive(true);
      window.setTimeout(() => syncYoutubeMusic(activeVolume, true), 80);
      window.setTimeout(() => syncYoutubeMusic(activeVolume, true), 420);
    } else {
      syncYoutubeMusic(activeVolume, true);
    }
  };

  useEffect(() => {
    console.log("[Rune Rush Page] loaded v150-forest-backdrop");
    return () => {
      if (musicFadeRef.current != null) window.cancelAnimationFrame(musicFadeRef.current);
      musicFadeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const links: HTMLLinkElement[] = [];

    const addPreload = (href: string, asType: "audio" | "image", type?: string) => {
      const existing = document.querySelector(`link[rel="preload"][href="${href}"]`);
      if (existing) return;
      const link = document.createElement("link");
      link.rel = "preload";
      link.href = href;
      link.as = asType;
      if (type) link.type = type;
      document.head.appendChild(link);
      links.push(link);
    };

    addPreload(PRIMARY_MUSIC_PRELOAD, "audio", "audio/mpeg");
    const audio = getMusicAudio();
    try { audio?.load(); } catch {}

    void loadRuneRushPixiBoard();
    for (const src of FAST_START_IMAGE_PRELOADS) addPreload(src, "image");

    const warmImages = FAST_START_IMAGE_PRELOADS.map((src) => {
      const img = new Image();
      img.decoding = "async";
      img.src = src;
      return img;
    });

    return () => {
      for (const link of links) link.remove();
      warmImages.length = 0;
    };
  }, []);

  useEffect(() => {
    const loaded = loadLifeState();
    const unlocked = loadUnlockedLevel();
    const savedBestScores = loadBestScores();
    const savedAudioSettings = loadAudioSettings();
    audioSettingsLoadedRef.current = true;
    setAudioSettings(savedAudioSettings);
    setHighestUnlocked(unlocked);
    setBestScores(savedBestScores);
    setLifeState(loaded);
    setRunAllowed(canStartLevel(loaded));
    saveLifeState(loaded);
    saveUnlockedLevel(unlocked);

    const timer = window.setInterval(() => {
      setLifeState((prev) => {
        const next = updateLifeTimer(prev);
        if (next.lives > 0) {
          setRunAllowed(true);
          setNoLivesMessage("");
        }
        if (next.lives !== prev.lives || next.nextLifeAt !== prev.nextLifeAt || next.countdown !== prev.countdown) {
          saveLifeState(next);
          return next;
        }
        return prev;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    musicWantedRef.current = audioSettings.music;
    if (!audioSettingsLoadedRef.current) return;
    saveAudioSettings(audioSettings);
  }, [audioSettings]);

  useEffect(() => {
    if (!soundMenuOpen) return;

    const closeOnOutside = (event: PointerEvent) => {
      const menu = soundMenuRef.current;
      const target = event.target;
      if (menu && target instanceof Node && !menu.contains(target)) setSoundMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSoundMenuOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [soundMenuOpen]);

  useEffect(() => {
    const audio = musicAudioRef.current;
    if (audio) fadeMusicTo(audio, musicVolume, musicOn ? 140 : 0);
    syncYoutubeMusic(musicVolume, musicOn);
  }, [musicVolume, musicOn]);

  useEffect(() => {
    musicWantedRef.current = musicOn;
    const audio = getMusicAudio();

    if (!musicOn) {
      syncYoutubeMusic(musicVolume, false);
      if (audio) audio.pause();
      return;
    }

    if (musicFailedRef.current || youtubeMusicFallbackRef.current) {
      youtubeMusicFallbackRef.current = true;
      setYoutubeMusicFallbackActive(true);
    }
    playMusicIfAllowed(musicVolume);

    const unlockMusic = () => playMusicIfAllowed(musicVolume);
    window.addEventListener("pointerdown", unlockMusic, { passive: true });
    window.addEventListener("touchstart", unlockMusic, { passive: true });
    window.addEventListener("keydown", unlockMusic);

    return () => {
      window.removeEventListener("pointerdown", unlockMusic);
      window.removeEventListener("touchstart", unlockMusic);
      window.removeEventListener("keydown", unlockMusic);
    };
  }, [musicOn, musicVolume]);

  useEffect(() => {
    if (hud.phase === "fail" && previousPhaseRef.current !== "fail") {
      setOutOfMovesQuote(pickOutOfMovesQuote());
    }
    previousPhaseRef.current = hud.phase;
  }, [hud.phase]);

  const saveWinningScore = (scoreValue: number, key = boardKey, idx = levelIndex) => {
    const cleanScore = Math.max(0, Math.floor(Number(scoreValue)));
    if (!Number.isFinite(cleanScore) || cleanScore <= 0) return;

    setBestScores((prev) => {
      const levelKey = String(Math.max(0, idx));
      const oldBest = Math.max(0, Math.floor(prev[levelKey] ?? 0));
      // Only save and display a new value when the completed score beats the old high score.
      if (cleanScore <= oldBest) return prev;
      const next = { ...prev, [levelKey]: cleanScore };
      saveBestScores(next);
      bestSavedLevelKeys.current.add(key);
      return next;
    });
  };

  const handleHudUpdate = (nextHud: HudState) => {
    const withLives = { ...nextHud, lives: lifeState.lives };
    setHud(withLives);
    if (nextHud.phase === "win") saveWinningScore(nextHud.score);
  };

  const commitLifeState = (next: LifeState) => {
    const clean = updateLifeTimer(next);
    saveLifeState(clean);
    setLifeState(clean);
    return clean;
  };

  const showNoLives = () => {
    const fresh = updateLifeTimer(loadLifeState());
    commitLifeState(fresh);
    if (fresh.lives <= 0) {
      setRunAllowed(false);
      setNoLivesMessage(`No lives left. Next life in ${fresh.countdown}.`);
    } else {
      setRunAllowed(true);
      setNoLivesMessage("");
    }
  };

  const dismissOutOfLivesNotice = () => {
    showNoLives();
    setHud((prev) => (prev.phase === "fail" ? { ...prev, phase: "idle", message: "Out of lives" } : prev));
  };

  const startLevel = (nextLevelIndex: number) => {
    const safeNext = Math.max(0, nextLevelIndex);
    const unlockedNow = Math.max(highestUnlocked, loadUnlockedLevel());
    if (safeNext > unlockedNow) {
      setNoLivesMessage("Beat the current level first to unlock the next one.");
      return;
    }

    const fresh = updateLifeTimer(loadLifeState());
    if (!canStartLevel(fresh)) {
      commitLifeState(fresh);
      setRunAllowed(false);
      setNoLivesMessage(`No lives left. Next life in ${fresh.countdown}.`);
      return;
    }

    commitLifeState(fresh);
    setRunAllowed(true);
    setNoLivesMessage("");
    setHud({ ...emptyHud, level: safeNext + 1, lives: fresh.lives });
    setLevelIndex(safeNext);
    setResetKey((v) => v + 1);
  };

  const restartLevel = () => {
    const fresh = updateLifeTimer(loadLifeState());
    if (!canStartLevel(fresh)) {
      commitLifeState(fresh);
      setRunAllowed(false);
      setNoLivesMessage(`No lives left. Next life in ${fresh.countdown}.`);
      return;
    }

    const afterLoss = loseLife(fresh);
    commitLifeState(afterLoss);
    setRunAllowed(afterLoss.lives > 0);
    setNoLivesMessage(afterLoss.lives <= 0 ? `No lives left. Next life in ${afterLoss.countdown}.` : "");
    setHud({ ...emptyHud, level: levelIndex + 1, lives: afterLoss.lives });
    setResetKey((v) => v + 1);
  };

  const handleLevelComplete = () => {
    saveWinningScore(hud.score);
    const nextUnlock = Math.max(highestUnlocked, levelIndex + 1);
    setHighestUnlocked(nextUnlock);
    saveUnlockedLevel(nextUnlock);
  };

  const handleLevelFailed = () => {
    if (failedLevelKeys.current.has(boardKey)) return;
    failedLevelKeys.current.add(boardKey);
    setLifeState((prev) => {
      const next = loseLife(prev);
      saveLifeState(next);
      setRunAllowed(next.lives > 0);
      if (next.lives <= 0) setNoLivesMessage(`No lives left. Next life in ${next.countdown}.`);
      else setNoLivesMessage("");
      return next;
    });
  };

  const retryFailedLevel = () => {
    const fresh = updateLifeTimer(loadLifeState());
    if (!canStartLevel(fresh)) {
      commitLifeState(fresh);
      setRunAllowed(false);
      setNoLivesMessage(`No lives left. Next life in ${fresh.countdown}.`);
      return;
    }

    commitLifeState(fresh);
    setRunAllowed(true);
    setNoLivesMessage("");
    setHud({ ...emptyHud, level: levelIndex + 1, lives: fresh.lives });
    setResetKey((v) => v + 1);
  };

  return (
    <main ref={pageShellRef} className={outOfLives ? "pageShell outOfLives" : "pageShell"}>
      <section ref={infoHubRef} className="infoHubBoard" aria-label="Rune Rush information">
      <header className="topNav">
        <div className="levelPill">
          <span className="levelCompact">Lvl</span>
          <b>{hud.level}</b>
        </div>

        <div className={outOfLives ? "lifePill empty" : "lifePill"}>
          <span className="lifeIcon" aria-label="Lives">{"\u2665"}</span>
          <b>{lifeState.lives}</b>
          <small>{outOfLives ? "OUT" : lifeState.lives < MAX_LIVES ? lifeState.countdown : "FULL"}</small>
        </div>
      </header>

      <section className="statsRow">
        <div className="stat">
          <span>MOVES</span>
          <b>{hud.moves}</b>
        </div>
        <div className="stat">
          <span>SCORE</span>
          <b>{formatScore(hud.score)}</b>
        </div>
        <div className="stat">
          <span>COMBO</span>
          <b>{hud.combo > 1 ? `x${hud.combo}` : "-"}</b>
        </div>
        <div className="stat bestStat">
          <span>BEST</span>
          <b>{displayedBestScore > 0 ? formatScore(displayedBestScore) : "-"}</b>
        </div>
      </section>

      <section className="goalCard">
        <div className="goalMain">
          <div className="goalTop">
            <div>
              <div className="eyebrow">GOAL</div>
              <div className="goalTitle">
                <span>{hud.objectiveLabel}</span>
              </div>
            </div>
            <div className="goalSide">
              <div className="goalCount">{hud.objectiveText}</div>
              {hud.ingredient && (
                <div className="ingredientHubShowcase" aria-label="Sacred Key and Golden Coin">
                  <img src={INGREDIENT_IMAGES.key} alt="Sacred Key" draggable={false} />
                  <img src={INGREDIENT_IMAGES.coin} alt="Golden Coin" draggable={false} />
                </div>
              )}
              {collectRuneGoals.length > 0 && (
                <div className="collectRuneShowcase" aria-label="Runes to collect">
                  {collectRuneGoals.map(({ rune }) => (
                    <div className="collectRuneBadge" key={rune}>
                      <img src={RUNE_IMAGES[rune]} alt={RUNE_LABELS[rune]} draggable={false} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="progressTrack">
            <span style={{ width: `${Math.round(hud.progress * 100)}%` }} />
          </div>
          <div className="infoHubLine"><b>HOW:</b> {objectiveDirections(hud)}</div>
          {hud.phase !== "finale" && hud.phase !== "win" && !/rune|runic|chain|victory|bloom/i.test(hud.message) && <div className="messageLine">{hud.message}</div>}
        </div>
      </section>
      </section>

      <section className="boardFrame">
        {canPlay ? (
          <RuneRushPixiBoard
            key={boardKey}
            levelIndex={levelIndex}
            onHud={handleHudUpdate}
            soundOn={gameSoundsOn}
            soundVolume={gameVolume}
            onLevelComplete={handleLevelComplete}
            onLevelFailed={handleLevelFailed}
          />
        ) : (
          <div className="noLivesBoard">
            <div className="noLivesIcon">♥</div>
            <div className="noLivesBadge">0 lives left</div>
            <h2>{lifeState.lives <= 0 ? "Out of lives" : "Loading level"}</h2>
            <p>{lifeState.lives <= 0 ? `Next life in ${lifeState.countdown}` : "Preparing the pond..."}</p>
          </div>
        )}
      </section>

      {noLivesMessage && <div className="lifeMessage">{noLivesMessage}</div>}

      {musicOn && youtubeMusicFallbackActive && (
        <iframe
          ref={youtubeFrameRef}
          className="youtubeMusicFrame"
          title="Toby Rune Rush background music"
          src={YOUTUBE_MUSIC_EMBED}
          allow="autoplay; encrypted-media"
          onLoad={() => {
            window.setTimeout(() => syncYoutubeMusic(musicVolume, musicOn), 250);
            window.setTimeout(() => syncYoutubeMusic(musicVolume, musicOn), 900);
          }}
        />
      )}

      <footer ref={bottomBarRef} className="bottomBar">
        <button
          type="button"
          className="arrowBtn bottomLevelArrow"
          onClick={() => startLevel(levelIndex - 1)}
          aria-label="Previous level"
        >
          ‹
        </button>

        <div className="soundMenuWrap" ref={soundMenuRef}>
          <button
            type="button"
            className={anyAudioOn ? "soundBtn on" : "soundBtn off"}
            onClick={() => setSoundMenuOpen((v) => !v)}
            aria-expanded={soundMenuOpen}
            aria-controls="audioSettingsMenu"
            aria-label={soundMenuOpen ? "Close audio settings" : "Open audio settings"}
          >
            {anyAudioOn ? "🔊 Audio" : "🔇 Audio"}
          </button>

          <div
            id="audioSettingsMenu"
            className={soundMenuOpen ? "soundMenu open" : "soundMenu closed"}
            role="dialog"
            aria-label="Audio settings"
            aria-hidden={!soundMenuOpen}
          >
              <div className="soundMenuHead">
                <div className="soundMenuTitle">Audio</div>
                <button type="button" className="soundMenuClose" onClick={() => setSoundMenuOpen(false)} aria-label="Close audio settings">×</button>
              </div>

              <button
                type="button"
                className={gameSoundsOn ? "audioToggle on" : "audioToggle off"}
                onClick={() => updateAudioSettings({ gameSounds: !gameSoundsOn })}
                aria-pressed={gameSoundsOn}
                disabled={!soundMenuOpen}
              >
                <span>Game Sounds</span>
                <b>{gameSoundsOn ? "ON" : "OFF"}</b>
              </button>

              <label className="audioSliderRow">
                <span>Game volume</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={gameVolumePct}
                  onChange={(e) => updateAudioSettings({ gameVolume: Number(e.currentTarget.value) / 100 })}
                  aria-label="Game sounds volume"
                  disabled={!soundMenuOpen}
                />
                <b>{gameVolumePct}%</b>
              </label>

              <button
                type="button"
                className={musicOn ? "audioToggle on" : "audioToggle off"}
                onClick={() => updateAudioSettings({ music: !musicOn })}
                aria-pressed={musicOn}
                disabled={!soundMenuOpen}
              >
                <span>Music</span>
                <b>{musicOn ? "ON" : "OFF"}</b>
              </button>

              <label className="audioSliderRow">
                <span>Music volume</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={musicVolumePct}
                  onChange={(e) => updateAudioSettings({ musicVolume: Number(e.currentTarget.value) / 100 })}
                  aria-label="Music volume"
                  disabled={!soundMenuOpen}
                />
                <b>{musicVolumePct}%</b>
              </label>

          </div>
        </div>

        <button type="button" onClick={restartLevel}>↻ Restart</button>

        <button
          type="button"
          className={levelIndex + 1 > highestUnlocked ? "arrowBtn bottomLevelArrow locked" : "arrowBtn bottomLevelArrow"}
          onClick={() => startLevel(levelIndex + 1)}
          aria-label="Next level"
          aria-disabled={levelIndex + 1 > highestUnlocked}
          disabled={levelIndex + 1 > highestUnlocked}
        >
          ›
        </button>
      </footer>

      {hud.phase === "win" && (
        <div className="modalShade">
          <div className="modalCard">
            <h2>LEVEL COMPLETE</h2>
            <div className="starRow">★ ★ ★</div>
            <p>{TOADGOD_WIN_SAYINGS[hud.level % TOADGOD_WIN_SAYINGS.length]}</p>
            <div className="rewardRow">
              <span>Score {formatScore(hud.score)}</span>
              <span>Best {formatScore(displayedBestScore)}</span>
            </div>
            <div className="modalBtns">
              <button
                onClick={() => startLevel(levelIndex + 1)}
              >
                Next
              </button>
              <button onClick={retryFailedLevel}>Replay</button>
            </div>
          </div>
        </div>
      )}

      {hud.phase === "fail" && (
        <div className="modalShade">
          <div className={outOfLives ? "modalCard outLivesModal" : "modalCard"}>
            <h2>{outOfLives ? "OUT OF LIVES" : "OUT OF MOVES"}</h2>
            <p>{outOfLives ? `Next life in ${lifeState.countdown}. Hearts refill over time.` : outOfMovesQuote}</p>
            <div className="modalBtns">
              {outOfLives ? (
                <button onClick={dismissOutOfLivesNotice}>Okay</button>
              ) : (
                <button onClick={retryFailedLevel}>Retry</button>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        html,
        body {
          margin: 0;
          padding: 0;
          min-height: 100%;
          background: #020806;
          color: #fff1c6;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          overflow-x: hidden;
        }

        * { box-sizing: border-box; }

        button {
          font: inherit;
          color: inherit;
          -webkit-tap-highlight-color: transparent;
        }

        .pageShell {
          min-height: 100vh;
          min-height: 100dvh;
          width: 100%;
          position: relative;
          isolation: isolate;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: clamp(3px, 0.55dvh, 6px);
          padding: max(6px, env(safe-area-inset-top)) 10px max(3px, env(safe-area-inset-bottom));
          background: transparent;
        }

        .pageShell::before,
        .pageShell::after {
          content: "";
          position: fixed;
          inset: 0;
          pointer-events: none;
        }

        .pageShell::before {
          z-index: -2;
          background: url("/runerusaaaaahbg.webp") center center / cover no-repeat;
          transform: translateZ(0);
          will-change: transform;
        }

        .pageShell::after {
          z-index: -1;
          background:
            radial-gradient(circle at 50% 0%, rgba(250, 235, 150, 0.12), rgba(0, 0, 0, 0) 34%),
            radial-gradient(circle at 50% 54%, rgba(2, 20, 12, 0.12), rgba(0, 0, 0, 0.68) 74%),
            linear-gradient(180deg, rgba(1, 8, 5, 0.26) 0%, rgba(1, 6, 4, 0.58) 58%, rgba(1, 3, 2, 0.76) 100%);
        }

        .pageShell {
          --game-w: min(98vw, 570px, calc(100dvh - 128px));
        }

        .infoHubBoard,
        .topNav,
        .statsRow,
        .goalCard,
        .bottomBar,
        .boardFrame {
          width: var(--game-w);
          min-width: 286px;
          max-width: 570px;
          margin-inline: auto;
          align-self: center;
        }

        .topNav {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
          align-items: center;
        }

        .arrowBtn,
        .levelPill,
        .lifePill,
        .stat,
        .goalCard,
        .bottomBar button,
        .modalCard,
        .modalBtns button {
          background-image:
            linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(0, 0, 0, 0.3)),
            linear-gradient(rgba(0, 0, 0, 0.05), rgba(0, 0, 0, 0.32)),
            url("/textures/obsidian.png"),
            url("/textures/stone.png");
          background-size: cover;
          background-position: center;
          border: 1px solid rgba(255, 220, 150, 0.2);
          box-shadow: 0 12px 26px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.11), inset 0 -10px 20px rgba(0,0,0,0.16);
        }

        .infoHubBoard {
          position: relative;
          display: grid;
          grid-template-columns: minmax(48px, 0.74fr) minmax(62px, 0.98fr) repeat(4, minmax(45px, 0.74fr));
          gap: 5px;
          padding: 8px;
          border-radius: 17px;
          overflow: hidden;
          isolation: isolate;
          background-color: rgba(2, 3, 3, 0.62);
          background-image:
            radial-gradient(130% 90% at 50% 0%, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0) 58%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(0, 0, 0, 0.38)),
            linear-gradient(rgba(0, 0, 0, 0.18), rgba(0, 0, 0, 0.42)),
            url("/textures/obsidian.png"),
            url("/textures/stone.png");
          background-size: cover;
          background-position: center;
          border: 1px solid rgba(255, 255, 255, 0.11);
          box-shadow:
            0 14px 28px rgba(0, 0, 0, 0.50),
            0 0 0 1px rgba(255, 255, 255, 0.035),
            0 0 18px rgba(0, 0, 0, 0.18),
            inset 0 1px 0 rgba(255, 246, 210, 0.14),
            inset 0 -12px 22px rgba(0,0,0,0.24);
        }

        .infoHubBoard::before {
          content: "";
          position: absolute;
          inset: 1px;
          z-index: 0;
          border-radius: inherit;
          pointer-events: none;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0) 38%),
            radial-gradient(100% 110% at 50% 105%, rgba(0,0,0,0.34), rgba(0,0,0,0) 58%);
          mix-blend-mode: screen;
          opacity: 0.62;
        }

        .infoHubBoard::after {
          content: "";
          display: none;
        }

        .infoHubBoard > * {
          position: relative;
          z-index: 1;
        }

        .infoHubBoard .topNav,
        .infoHubBoard .goalCard {
          width: 100%;
          min-width: 0;
          max-width: none;
          margin: 0;
          align-self: stretch;
        }

        .infoHubBoard .topNav,
        .infoHubBoard .statsRow {
          display: contents;
        }

        .infoHubBoard .goalCard {
          grid-column: 1 / -1;
        }

        .infoHubBoard .levelPill,
        .infoHubBoard .lifePill,
        .infoHubBoard .stat,
        .infoHubBoard .goalCard {
          position: relative;
          z-index: 1;
          min-width: 0;
          overflow: hidden;
          background-color: rgba(0, 0, 0, 0.35);
          background-image:
            linear-gradient(180deg, rgba(255, 246, 214, 0.035), rgba(0, 0, 0, 0.36)),
            linear-gradient(rgba(0, 0, 0, 0.24), rgba(0, 0, 0, 0.46)),
            url("/textures/obsidian.png"),
            url("/textures/stone.png");
          background-size: cover;
          background-position: center;
          border: 1px solid rgba(255, 255, 255, 0.09);
          box-shadow:
            inset 0 2px 4px rgba(0,0,0,0.42),
            inset 0 -1px 0 rgba(255, 255, 255, 0.04),
            inset 0 1px 0 rgba(255, 255, 255, 0.055),
            0 1px 0 rgba(255, 255, 255, 0.035);
        }

        .infoHubBoard .levelPill::after,
        .infoHubBoard .lifePill::after,
        .infoHubBoard .stat::after,
        .infoHubBoard .goalCard::after {
          content: "";
          display: none;
        }

        .arrowBtn {
          height: 42px;
          border-radius: 16px;
          font-size: 25px;
          border-color: rgba(255, 172, 88, 0.2);
          background-color: rgba(0, 0, 0, 0.35);
        }

        .bottomLevelArrow {
          width: 100%;
          min-width: 0;
          font-size: 25px;
          line-height: 1;
          padding: 0;
        }

        .arrowBtn.locked,
        .arrowBtn:disabled {
          opacity: 0.38;
          filter: grayscale(0.45);
          cursor: not-allowed;
        }

        .levelPill,
        .lifePill {
          height: 42px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          color: rgba(255, 235, 180, 0.86);
          font-weight: 900;
          letter-spacing: 0.04em;
        }

        .levelPill b,
        .lifePill b {
          font-size: 23px;
          line-height: 1;
          color: #fff6c8;
        }

        .levelCompact {
          font-size: 13px;
          line-height: 1;
          color: rgba(255, 235, 180, 0.82);
        }

        .lifePill span {
          color: #ff675d;
          font-size: 16px;
        }

        .lifeIcon {
          display: inline-grid;
          place-items: center;
          width: 15px;
          min-width: 15px;
          line-height: 1;
          color: #ff6d73;
          text-shadow: 0 0 9px rgba(255, 98, 106, 0.38);
        }

        .lifePill small {
          font-size: 10px;
          color: rgba(255, 245, 210, 0.65);
        }

        .lifePill.empty {
          border-color: rgba(255, 106, 112, 0.45);
          box-shadow:
            0 12px 26px rgba(0, 0, 0, 0.5),
            0 0 18px rgba(255, 86, 96, 0.18),
            inset 0 1px 0 rgba(255, 255, 255, 0.12),
            inset 0 -10px 20px rgba(0,0,0,0.18);
        }

        .lifePill.empty .lifeIcon,
        .lifePill.empty b {
          color: #ff6972;
          text-shadow: 0 0 11px rgba(255, 92, 105, 0.46);
        }

        .lifePill.empty small {
          color: #ffd7d0;
          font-weight: 950;
        }

        .infoHubBoard .levelPill,
        .infoHubBoard .lifePill {
          height: 31px;
          border-radius: 11px;
          gap: 4px;
          padding: 3px 5px;
          font-size: 9.5px;
          letter-spacing: 0;
          white-space: nowrap;
        }

        .infoHubBoard .levelCompact {
          font-size: 11px;
          letter-spacing: 0;
        }

        .infoHubBoard .levelPill b,
        .infoHubBoard .lifePill b {
          flex: 0 0 auto;
          font-size: 17px;
          font-variant-numeric: tabular-nums;
          letter-spacing: 0;
          line-height: 1;
        }

        .infoHubBoard .lifePill span {
          font-size: 14px;
          line-height: 1;
        }

        .infoHubBoard .lifeIcon {
          width: 12px;
          min-width: 12px;
          font-size: 13px;
        }

        .infoHubBoard .lifePill small {
          min-width: 27px;
          max-width: 31px;
          overflow: hidden;
          text-overflow: clip;
          font-size: 8.5px;
          line-height: 1;
          letter-spacing: 0;
        }

        .statsRow {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 5px;
        }

        .stat {
          min-height: 42px;
          border-radius: 14px;
          display: grid;
          place-items: center;
          padding: 6px 6px;
          text-align: center;
        }

        .stat span,
        .eyebrow {
          font-size: 10px;
          color: rgba(255, 226, 170, 0.74);
          font-weight: 950;
          letter-spacing: 0.08em;
        }

        .stat b {
          font-size: clamp(15px, 3.6vw, 19px);
          line-height: 1;
          color: #fff3c4;
        }

        .bestStat b {
          color: #b8ff8e;
        }

        .infoHubBoard .statsRow {
          gap: 4px;
        }

        .infoHubBoard .stat {
          min-height: 31px;
          border-radius: 10px;
          padding: 3px 4px 4px;
          grid-template-rows: auto 1fr;
          overflow: hidden;
        }

        .infoHubBoard .stat span,
        .infoHubBoard .eyebrow {
          max-width: 100%;
          overflow: hidden;
          text-overflow: clip;
          white-space: nowrap;
          font-size: 8px;
          line-height: 1;
          letter-spacing: 0;
        }

        .infoHubBoard .stat b {
          display: block;
          max-width: 100%;
          overflow: hidden;
          text-overflow: clip;
          white-space: nowrap;
          font-size: 13px;
          line-height: 1.05;
          letter-spacing: 0;
          font-variant-numeric: tabular-nums;
        }

        .infoHubBoard .stat:nth-child(4) b,
        .infoHubBoard .bestStat b {
          font-size: 12px;
        }

        .goalCard {
          min-height: 48px;
          border-radius: 17px;
          display: grid;
          grid-template-columns: 1fr;
          gap: 8px;
          align-items: center;
          padding: 6px 9px;
          overflow: hidden;
        }

        .infoHubBoard .goalCard {
          min-height: 47px;
          border-radius: 12px;
          grid-template-columns: minmax(0, 1fr);
          gap: 0;
          padding: 6px 7px;
        }

        .goalTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-width: 0;
        }

        .goalMain,
        .goalTop > div:first-child {
          min-width: 0;
        }

        .goalTitle {
          font-size: clamp(14px, 3.35vw, 19px);
          font-weight: 950;
          line-height: 1;
          color: #fff7d1;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          flex-wrap: wrap;
        }

        .infoHubBoard .goalTop {
          gap: 6px;
        }

        .infoHubBoard .goalTitle {
          max-width: 100%;
          min-width: 0;
          flex-wrap: nowrap;
          overflow: hidden;
          white-space: nowrap;
          font-size: 14px;
          line-height: 1.02;
          gap: 5px;
        }

        .infoHubBoard .goalTitle > span:first-child {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .goalSide {
          display: inline-flex;
          align-items: center;
          justify-content: flex-end;
          gap: 5px;
          min-width: max-content;
        }

        .goalCount {
          color: #ffe38b;
          font-size: clamp(15px, 3.3vw, 19px);
          font-weight: 950;
          line-height: 1;
          white-space: nowrap;
        }

        .infoHubBoard .goalSide {
          flex: 0 0 auto;
          gap: 4px;
        }

        .infoHubBoard .goalCount {
          max-width: 86px;
          overflow: hidden;
          text-overflow: clip;
          font-size: 13px;
          letter-spacing: 0;
          font-variant-numeric: tabular-nums;
          padding: 1px 5px;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.34);
          color: #fff0a8;
          border: 1px solid rgba(255, 214, 132, 0.10);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.035);
        }

        .collectRuneShowcase {
          display: inline-flex;
          align-items: center;
          justify-content: flex-end;
          gap: 4px;
          min-width: 0;
          pointer-events: none;
        }

        .collectRuneBadge {
          height: 30px;
          min-width: 32px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0;
          padding: 2px 4px;
          border-radius: 999px;
          background:
            linear-gradient(180deg, rgba(255, 245, 210, 0.055), rgba(0, 0, 0, 0.20)),
            rgba(0, 0, 0, 0.28);
          border: 1px solid rgba(255, 218, 136, 0.12);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.055),
            0 4px 10px rgba(0, 0, 0, 0.22);
        }

        .collectRuneBadge img {
          width: 24px;
          height: 24px;
          object-fit: contain;
          display: block;
          filter: brightness(1.14) contrast(1.07) saturate(1.06) drop-shadow(0 0 7px rgba(255, 224, 150, 0.12));
          user-select: none;
        }

        .collectRuneBadge b {
          display: none;
        }

        .infoHubBoard .collectRuneShowcase {
          gap: 3px;
        }

        .infoHubBoard .collectRuneBadge {
          height: 25px;
          min-width: 28px;
          padding: 1px 3px;
        }

        .infoHubBoard .collectRuneBadge img {
          width: 20px;
          height: 20px;
        }

        .infoHubBoard .collectRuneBadge b {
          font-size: 10px;
        }

        .infoHubLine {
          margin-top: 3px;
          color: rgba(255, 238, 190, 0.67);
          font-size: 9.8px;
          line-height: 1.16;
          font-weight: 800;
          letter-spacing: 0.01em;
        }
        .infoHubLine b {
          color: rgba(255, 214, 117, 0.88);
          font-weight: 950;
          letter-spacing: 0.06em;
        }

        .infoHubBoard .infoHubLine {
          margin-top: 3px;
          font-size: 9px;
          line-height: 1.12;
          color: rgba(255, 238, 190, 0.68);
          max-width: 100%;
          overflow-wrap: anywhere;
        }

        .ingredientHubShowcase {
          margin: 0;
          min-height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0;
          background: transparent;
          border: 0;
          box-shadow: none;
          isolation: isolate;
          overflow: visible;
          pointer-events: none;
        }

        .ingredientHubShowcase img {
          display: block;
          object-fit: contain;
          background: transparent;
          border: 0;
          box-shadow: none;
          filter: brightness(1.08) contrast(1.06) saturate(1.05);
          user-select: none;
          will-change: transform, filter;
        }

        .ingredientHubShowcase img:first-child {
          width: 20px;
          height: 29px;
          margin-right: -6px;
          --ingredient-tilt: -5deg;
          --ingredient-y: 0px;
          animation: ingredientKeyFloat 2.85s ease-in-out infinite;
          z-index: 2;
        }

        .ingredientHubShowcase img:last-child {
          width: 26px;
          height: 26px;
          --ingredient-y: 1px;
          animation: ingredientCoinFloat 2.55s ease-in-out infinite;
        }

        .infoHubBoard .ingredientHubShowcase {
          min-height: 24px;
        }

        .infoHubBoard .ingredientHubShowcase img:first-child {
          width: 17px;
          height: 25px;
          margin-right: -6px;
        }

        .infoHubBoard .ingredientHubShowcase img:last-child {
          width: 22px;
          height: 22px;
        }

        @keyframes ingredientKeyFloat {
          0%, 100% {
            transform: translate3d(0, var(--ingredient-y, 0px), 0) rotate(var(--ingredient-tilt, -6deg)) scale(1);
            filter: brightness(1.08) contrast(1.06) saturate(1.05) drop-shadow(0 0 7px rgba(255,205,96,0.12));
          }
          50% {
            transform: translate3d(0, calc(var(--ingredient-y, 0px) - 3px), 0) rotate(calc(var(--ingredient-tilt, -6deg) + 2deg)) scale(1.035);
            filter: brightness(1.16) contrast(1.08) saturate(1.08) drop-shadow(0 0 10px rgba(255,205,96,0.20));
          }
        }

        @keyframes ingredientCoinFloat {
          0%, 100% {
            transform: translate3d(0, var(--ingredient-y, 0px), 0) rotate(-1deg) scale(1);
            filter: brightness(1.08) contrast(1.06) saturate(1.05) drop-shadow(0 0 7px rgba(255,211,105,0.12));
          }
          50% {
            transform: translate3d(1px, calc(var(--ingredient-y, 0px) - 2px), 0) rotate(2deg) scale(1.035);
            filter: brightness(1.17) contrast(1.08) saturate(1.10) drop-shadow(0 0 10px rgba(255,211,105,0.22));
          }
        }
        .lifeMessage {
          width: var(--game-w);
          max-width: 500px;
          min-width: 286px;
          margin: -1px auto 0;
          color: rgba(255, 225, 170, 0.88);
          font-size: 11px;
          font-weight: 800;
          text-align: center;
          text-shadow: 0 1px 0 rgba(0,0,0,0.55);
        }

        .noLivesBoard {
          width: 100%;
          height: 100%;
          display: grid;
          place-items: center;
          align-content: center;
          gap: 5px;
          text-align: center;
          color: #fff1c6;
          background:
            radial-gradient(circle at 50% 30%, rgba(90, 20, 25, 0.24), rgba(0,0,0,0) 48%),
            rgba(0,0,0,0.24);
          border-radius: 20px;
        }

        .noLivesBoard h2 {
          margin: 0;
          font-size: 24px;
          letter-spacing: 0.03em;
          text-transform: uppercase;
        }

        .noLivesBoard p {
          margin: 0;
          font-size: 13px;
          color: rgba(255, 236, 190, 0.8);
        }

        .noLivesIcon {
          font-size: 36px;
          color: #ff6e75;
          text-shadow: 0 0 20px rgba(255, 90, 100, 0.4);
        }

        .noLivesBadge {
          border-radius: 999px;
          padding: 5px 11px;
          color: #2a0704;
          background: linear-gradient(180deg, #ffd0c7, #ff737b);
          box-shadow: 0 8px 18px rgba(0,0,0,0.22), 0 0 18px rgba(255, 99, 108, 0.22);
          font-size: 10px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }


        .progressTrack {
          margin-top: 5px;
          width: 100%;
          height: 7px;
          border-radius: 999px;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.035), rgba(0,0,0,0.18)),
            rgba(0, 0, 0, 0.46);
          overflow: hidden;
          border: 1px solid rgba(255, 220, 142, 0.10);
          box-shadow:
            inset 0 1px 3px rgba(0, 0, 0, 0.68),
            0 1px 0 rgba(255,255,255,0.045);
        }

        .progressTrack span {
          display: block;
          height: 100%;
          border-radius: 999px;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.36), rgba(255,255,255,0) 46%),
            linear-gradient(90deg, #d99a2b, #ffd66f 48%, #fff3bd);
          box-shadow:
            0 0 10px rgba(255, 211, 105, 0.34),
            inset 0 1px 0 rgba(255,255,255,0.34);
          transition: width 180ms ease-out;
        }

        .infoHubBoard .progressTrack {
          margin-top: 4px;
          height: 6px;
          border-color: rgba(255, 220, 142, 0.11);
          background: rgba(0, 0, 0, 0.34);
        }

        .infoHubBoard .progressTrack span {
          background: linear-gradient(90deg, #ffcf66, #fff2b2);
          box-shadow: 0 0 10px rgba(255, 214, 117, 0.24);
        }

        .messageLine {
          margin-top: 5px;
          min-height: 14px;
          color: rgba(255, 245, 210, 0.62);
          font-size: 10px;
          font-weight: 700;
        }

        .infoHubBoard .messageLine {
          margin-top: 2px;
          min-height: 11px;
          font-size: 9px;
          line-height: 1.05;
          color: rgba(255, 245, 210, 0.54);
        }

        .boardFrame {
          aspect-ratio: 1 / 1;
          border-radius: 24px;
          border: 0;
          outline: 0;
          box-shadow: 0 18px 44px rgba(0, 0, 0, 0.58);
          overflow: hidden;
          display: grid;
          place-items: center;
          background: transparent;
          padding: 0;
        }

        .pixiHost,
        .loadingBoard {
          width: 100%;
          height: 100%;
          display: grid;
          place-items: center;
          touch-action: none;
          overflow: hidden;
          position: relative;
          background:
            radial-gradient(circle at 48% 38%, rgba(255, 225, 165, 0.12), rgba(255, 225, 165, 0) 34%),
            linear-gradient(135deg, rgba(18, 23, 22, 0.72), rgba(7, 9, 10, 0.86));
        }

        .pixiHost canvas {
          width: 100% !important;
          height: 100% !important;
          display: block;
          animation: boardCanvasIn 220ms cubic-bezier(0.2, 0.9, 0.2, 1) both;
        }

        .pixiHost:has(canvas) {
          background: transparent;
        }


        .pixiHost,
        .boardFrame,
        .modalShade {
          contain: layout style paint;
        }

        .pixiHost canvas,
        .modalCard {
          transform: translateZ(0);
          backface-visibility: hidden;
        }

        .loadingBoard {
          color: rgba(255, 245, 210, 0.72);
        }

        .loadingBoardPulse {
          display: block;
          position: relative;
          width: 22%;
          min-width: 64px;
          max-width: 96px;
          aspect-ratio: 1;
          border-radius: 50%;
          border: 2px solid rgba(255, 236, 190, 0.34);
          box-shadow:
            0 0 18px rgba(255, 216, 130, 0.22),
            inset 0 0 18px rgba(255, 255, 255, 0.08);
          animation: loadingBoardPulse 720ms ease-in-out infinite;
        }

        .loadingBoardPulse::after {
          content: "";
          position: absolute;
          inset: 28%;
          border-radius: 50%;
          background: rgba(255, 236, 190, 0.18);
          box-shadow: 0 0 16px rgba(255, 236, 190, 0.22);
        }

        @keyframes boardCanvasIn {
          from {
            opacity: 0;
            transform: translateZ(0) scale(0.985);
            filter: brightness(1.08);
          }
          to {
            opacity: 1;
            transform: translateZ(0) scale(1);
            filter: brightness(1);
          }
        }

        @keyframes loadingBoardPulse {
          0%, 100% {
            opacity: 0.64;
            transform: scale(0.92);
          }
          50% {
            opacity: 1;
            transform: scale(1.03);
          }
        }

        .bottomBar {
          display: grid;
          grid-template-columns: 0.72fr 1fr 1fr 0.72fr;
          gap: 6px;
          align-items: center;
        }

        .bottomBar button {
          height: 42px;
          border-radius: 15px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.025em;
          font-size: 10px;
          white-space: nowrap;
        }

        .soundBtn.off {
          opacity: 0.72;
        }

        .soundBtn {
          position: relative;
          overflow: hidden;
          cursor: pointer;
          color: #fff4c7;
          text-shadow: 0 1px 8px rgba(255, 220, 130, 0.18);
        }

        .soundBtn::after {
          content: "";
          position: absolute;
          inset: 1px;
          border-radius: inherit;
          background: linear-gradient(120deg, rgba(255,255,255,0.16), rgba(255,255,255,0) 42%);
          opacity: 0.55;
          pointer-events: none;
        }

        .soundBtn:hover,
        .soundBtn:focus-visible {
          filter: brightness(1.12);
        }

        .soundMenuWrap {
          position: relative;
          min-width: 0;
          z-index: 20;
        }

        .soundMenuWrap > .soundBtn {
          width: 100%;
        }

        .soundMenu {
          position: absolute;
          left: 50%;
          transform: translateX(-50%) translateY(8px) scale(0.96);
          transform-origin: 50% 100%;
          bottom: calc(100% + 9px);
          width: min(282px, calc(var(--game-w) - 18px));
          border-radius: 18px;
          padding: 9px;
          background:
            radial-gradient(circle at 18% 0%, rgba(255, 220, 128, 0.16), rgba(255, 220, 128, 0) 42%),
            linear-gradient(180deg, rgba(255,255,255,0.085), rgba(0,0,0,0.30)),
            url("/textures/obsidian.png"),
            rgba(5, 12, 10, 0.92);
          background-size: cover;
          background-position: center;
          border: 1px solid rgba(255, 220, 150, 0.30);
          box-shadow: 0 20px 46px rgba(0,0,0,0.62), 0 0 24px rgba(255, 205, 105, 0.10), inset 0 1px 0 rgba(255,255,255,0.12);
          color: #fff6c8;
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          transition: opacity 150ms ease, transform 180ms cubic-bezier(0.2, 0.9, 0.2, 1), visibility 0ms linear 180ms;
          backdrop-filter: blur(12px);
        }

        .soundMenu.open {
          opacity: 1;
          visibility: visible;
          pointer-events: auto;
          transform: translateX(-50%) translateY(0) scale(1);
          transition-delay: 0ms;
        }

        .soundMenu.closed {
          opacity: 0;
          visibility: hidden;
        }

        .soundMenu::after {
          content: "";
          position: absolute;
          left: 50%;
          bottom: -7px;
          width: 14px;
          height: 14px;
          transform: translateX(-50%) rotate(45deg);
          background:
            linear-gradient(135deg, rgba(255,255,255,0.04), rgba(0,0,0,0.22)),
            #07110e;
          border-right: 1px solid rgba(255, 220, 150, 0.18);
          border-bottom: 1px solid rgba(255, 220, 150, 0.18);
        }

        .youtubeMusicFrame {
          position: fixed;
          left: -12px;
          bottom: -12px;
          width: 1px;
          height: 1px;
          opacity: 0.01;
          pointer-events: none;
          border: 0;
        }

        .soundMenuHead {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 7px;
        }

        .soundMenuTitle {
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255, 226, 170, 0.74);
          margin: 1px 2px;
        }

        .soundMenuClose {
          width: 30px;
          min-width: 30px;
          height: 30px !important;
          min-height: 30px !important;
          padding: 0 !important;
          border-radius: 999px !important;
          font-size: 0 !important;
          line-height: 1;
          cursor: pointer;
        }

        .soundMenuClose::before {
          content: "x";
          font-size: 15px;
          line-height: 1;
          color: #fff5cf;
        }

        .soundMenu button {
          background-image: none;
          background-color: rgba(0, 0, 0, 0.26);
          border: 1px solid rgba(255, 220, 150, 0.18);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.07), 0 8px 16px rgba(0,0,0,0.18);
          height: auto;
          min-height: 35px;
          border-radius: 14px;
          font-size: 11px;
          letter-spacing: 0.04em;
          cursor: pointer;
          transition: transform 90ms ease, filter 140ms ease, border-color 140ms ease, background-color 140ms ease;
        }

        .soundMenu button:hover,
        .soundMenu button:focus-visible {
          filter: brightness(1.12);
          border-color: rgba(255, 226, 158, 0.32);
        }

        .audioToggle {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 8px 9px;
          margin-bottom: 6px;
          color: rgba(255, 246, 210, 0.92);
        }

        .audioToggle b {
          min-width: 38px;
          text-align: center;
          border-radius: 999px;
          padding: 3px 7px;
          color: #120c02;
          background: linear-gradient(180deg, #fff0a8, #d69b32);
          box-shadow: 0 0 12px rgba(255, 210, 96, 0.22), inset 0 1px 0 rgba(255,255,255,0.50);
        }

        .audioToggle.off {
          opacity: 0.78;
        }

        .audioToggle.off b {
          color: rgba(255, 245, 210, 0.72);
          background: rgba(255,255,255,0.09);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
        }

        .audioSliderRow {
          display: grid;
          grid-template-columns: 74px 1fr 39px;
          align-items: center;
          gap: 7px;
          margin: -1px 0 7px;
          padding: 7px 8px;
          border-radius: 14px;
          background: rgba(0, 0, 0, 0.22);
          border: 1px solid rgba(255, 220, 150, 0.13);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.045);
        }

        .audioSliderRow span {
          font-size: 8.5px;
          line-height: 1.1;
          font-weight: 950;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255, 242, 196, 0.76);
        }

        .audioSliderRow b {
          text-align: right;
          font-size: 10px;
          color: #fff6c8;
        }

        .audioSliderRow input[type="range"] {
          width: 100%;
          height: 18px;
          appearance: none;
          -webkit-appearance: none;
          background: transparent;
          cursor: pointer;
        }

        .audioSliderRow input[type="range"]::-webkit-slider-runnable-track {
          height: 6px;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(255, 218, 110, 0.92), rgba(255,255,255,0.52));
          box-shadow: inset 0 1px 2px rgba(0,0,0,0.45), 0 0 10px rgba(255, 210, 96, 0.16);
        }

        .audioSliderRow input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          -webkit-appearance: none;
          width: 17px;
          height: 17px;
          margin-top: -5.5px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.65);
          background: radial-gradient(circle at 35% 30%, #ffffff, #ffe08a 42%, #a86e18 100%);
          box-shadow: 0 3px 9px rgba(0,0,0,0.45), 0 0 12px rgba(255, 214, 110, 0.30);
        }

        .audioSliderRow input[type="range"]::-moz-range-track {
          height: 6px;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(255, 218, 110, 0.92), rgba(255,255,255,0.52));
          box-shadow: inset 0 1px 2px rgba(0,0,0,0.45), 0 0 10px rgba(255, 210, 96, 0.16);
        }

        .audioSliderRow input[type="range"]::-moz-range-thumb {
          width: 17px;
          height: 17px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.65);
          background: radial-gradient(circle at 35% 30%, #ffffff, #ffe08a 42%, #a86e18 100%);
          box-shadow: 0 3px 9px rgba(0,0,0,0.45), 0 0 12px rgba(255, 214, 110, 0.30);
        }

        .modalShade {
          position: fixed;
          inset: 0;
          z-index: 10;
          display: grid;
          place-items: center;
          background: rgba(0, 0, 0, 0.62);
          padding: 16px;
        }

        .modalCard {
          width: min(92vw, 440px);
          border-radius: 22px;
          padding: 22px;
          color: #fff6c8;
        }

        .modalCard h2 {
          margin: 0;
          font-size: 25px;
        }

        .modalCard p { color: rgba(255, 245, 210, 0.72); }

        .outLivesModal {
          border-color: rgba(255, 118, 120, 0.34);
          box-shadow:
            0 24px 60px rgba(0,0,0,0.52),
            0 0 34px rgba(255, 93, 105, 0.18),
            inset 0 1px 0 rgba(255,255,255,0.12);
        }

        .outLivesModal h2 {
          color: #ffd9d2;
          text-shadow: 0 0 18px rgba(255, 96, 108, 0.28);
        }

        .modalBtns {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .modalBtns button {
          height: 42px;
          border-radius: 18px;
          font-weight: 900;
        }

        @media (max-width: 640px), (hover: none) and (pointer: coarse) and (max-width: 920px) {
          html,
          body {
            height: 100%;
            overflow: hidden;
            overscroll-behavior: none;
          }

          .pageShell {
            --game-w: min(98vw, 540px);
            height: var(--mobile-vh, 100svh);
            height: var(--mobile-vh, 100dvh);
            min-height: 0;
            max-height: var(--mobile-vh, 100dvh);
            justify-content: flex-start;
            gap: var(--mobile-fill-gap, 3px);
            overflow: hidden;
            padding-top: max(16px, calc(env(safe-area-inset-top) + 10px));
            padding-left: 6px;
            padding-right: 6px;
            padding-bottom: max(34px, calc(env(safe-area-inset-bottom) + 30px));
          }
          .infoHubBoard {
            width: min(calc(100vw - 8px), calc(var(--game-w) + 20px));
            max-width: min(590px, calc(100vw - 8px));
            grid-template-columns: minmax(45px, 0.72fr) minmax(60px, 0.95fr) repeat(4, minmax(42px, 0.72fr));
            padding: calc(9px + var(--mobile-hub-pad-extra, 0px));
            border-radius: 18px;
            gap: calc(4px + var(--mobile-hub-gap-extra, 0px));
            box-shadow:
              0 15px 30px rgba(0, 0, 0, 0.54),
              0 0 0 1px rgba(255, 255, 255, 0.035),
              0 0 18px rgba(0, 0, 0, 0.22),
              inset 0 1px 0 rgba(255, 246, 210, 0.15),
              inset 0 -12px 22px rgba(0,0,0,0.26);
          }
          .topNav { grid-template-columns: 1fr 1fr; gap: 6px; }
          .infoHubBoard .topNav { display: contents; }
          .arrowBtn, .levelPill, .lifePill { height: 44px; border-radius: 14px; }
          .infoHubBoard .levelPill, .infoHubBoard .lifePill { height: calc(36px + var(--mobile-hub-control-extra, 0px)); border-radius: 12px; gap: 4px; padding: 5px 6px; font-size: 8.8px; letter-spacing: 0; }
          .levelPill b, .lifePill b { font-size: 24px; }
          .infoHubBoard .levelPill b, .infoHubBoard .lifePill b { font-size: 16px; }
          .lifePill small { font-size: 10px; }
          .infoHubBoard .lifePill small { min-width: 28px; max-width: 31px; font-size: 8px; }
          .statsRow { gap: 6px; }
          .stat { min-height: 45px; border-radius: 13px; }
          .infoHubBoard .statsRow { gap: 4px; }
          .infoHubBoard .stat { min-height: calc(36px + var(--mobile-hub-control-extra, 0px)); border-radius: 11px; padding: 4px 5px; }
          .stat span, .eyebrow { font-size: 9px; }
          .infoHubBoard .stat span, .infoHubBoard .eyebrow { font-size: 7.8px; letter-spacing: 0; }
          .stat b { font-size: 20px; }
          .infoHubBoard .stat b { font-size: 12px; }
          .infoHubBoard .stat:nth-child(4) b,
          .infoHubBoard .bestStat b { font-size: 11px; }
          .goalCard { min-height: 48px; padding: 5px 8px; border-radius: 15px; grid-template-columns: 31px 1fr; }
          .infoHubBoard .goalCard { min-height: calc(59px + var(--mobile-hub-goal-extra, 0px)); padding: 8px 9px; border-radius: 13px; grid-template-columns: minmax(0, 1fr); gap: 0; }
          .goalTitle { font-size: 14px; }
          .infoHubBoard .goalTitle { font-size: 13px; }
          .goalCount { font-size: 15px; }
          .infoHubBoard .goalCount { max-width: 82px; font-size: 12.2px; padding-inline: 5px; }
          .goalSide { gap: 4px; }
          .collectRuneBadge { height: 27px; min-width: 29px; padding-inline: 3px; }
          .collectRuneBadge img { width: 21px; height: 21px; }
          .collectRuneBadge b { display: none; }
          .infoHubBoard .collectRuneBadge { height: 24px; min-width: 27px; padding-inline: 2px; }
          .infoHubBoard .collectRuneBadge img { width: 19px; height: 19px; }
          .infoHubBoard .collectRuneBadge b { display: none; }
          .ingredientHubShowcase img:first-child { width: 18px; height: 26px; margin-right: -6px; }
          .ingredientHubShowcase img:last-child { width: 24px; height: 24px; }
          .infoHubBoard .ingredientHubShowcase img:first-child { width: 17px; height: 25px; margin-right: -6px; }
          .infoHubBoard .ingredientHubShowcase img:last-child { width: 23px; height: 23px; }
          .messageLine { display: none; }
          .infoHubLine { font-size: 9.5px; margin-top: 3px; }
          .infoHubBoard .infoHubLine { font-size: 8.2px; margin-top: 2px; line-height: 1.08; }
          .boardFrame { width: var(--game-w); min-width: min(282px, 94vw); padding: 0; border-radius: 20px; flex: 0 0 auto; }
          .bottomBar { width: min(calc(100vw - 8px), calc(var(--game-w) + 20px)); max-width: min(590px, calc(100vw - 8px)); grid-template-columns: 0.68fr 1fr 1fr 0.68fr; gap: 6px; margin-top: auto; }
          .bottomBar button { height: 45px; font-size: 8.9px; border-radius: 16px; padding-inline: 7px; }
          .bottomLevelArrow { font-size: 22px; }
          .soundMenu {
            position: fixed;
            left: 50%;
            right: auto;
            bottom: calc(max(34px, calc(env(safe-area-inset-bottom) + 30px)) + 58px);
            width: min(288px, calc(100vw - 20px));
            max-height: min(340px, calc(100dvh - 112px));
            overflow-y: auto;
            overscroll-behavior: contain;
            -webkit-overflow-scrolling: touch;
            z-index: 70;
          }
          .soundMenu.open {
            transform: translateX(-50%) translateY(0) scale(1);
          }
          .soundMenu.closed {
            transform: translateX(-50%) translateY(8px) scale(0.96);
          }
          .modalShade {
            padding:
              max(18px, calc(env(safe-area-inset-top) + 12px))
              14px
              max(22px, calc(env(safe-area-inset-bottom) + 18px));
            overflow: hidden;
          }
          .modalCard {
            width: min(92vw, 420px);
            max-height: calc(100dvh - 76px);
            overflow-y: auto;
            overscroll-behavior: contain;
            -webkit-overflow-scrolling: touch;
            padding: 18px;
          }
          .lifeMessage {
            position: fixed;
            left: 50%;
            bottom: calc(max(34px, calc(env(safe-area-inset-bottom) + 30px)) + 58px);
            transform: translateX(-50%);
            margin: 0;
            z-index: 15;
          }
        }

        @media (max-width: 640px) and (max-height: 760px), (hover: none) and (pointer: coarse) and (max-width: 920px) and (max-height: 760px) {
          .pageShell {
            --game-w: min(98vw, 540px);
            gap: 2px;
            padding-top: max(12px, calc(env(safe-area-inset-top) + 8px));
            padding-bottom: max(28px, calc(env(safe-area-inset-bottom) + 24px));
          }
          .infoHubBoard { padding: 6px; gap: 3px; }
          .infoHubBoard .levelPill,
          .infoHubBoard .lifePill { height: 33px; padding-block: 4px; }
          .infoHubBoard .stat { min-height: 33px; padding-block: 3px; }
          .infoHubBoard .goalCard { min-height: 49px; padding-block: 5px; }
          .infoHubBoard .infoHubLine { display: none; }
          .bottomBar button { height: 41px; font-size: 8.5px; }
          .soundMenu {
            bottom: calc(max(28px, calc(env(safe-area-inset-bottom) + 24px)) + 54px);
            max-height: min(318px, calc(100dvh - 92px));
          }
          .modalCard {
            max-height: calc(100dvh - 58px);
            padding: 16px;
          }
        }

        @media (min-width: 760px) {
          .pageShell { gap: 4px; }
          .boardFrame { width: min(98vw, 570px, calc(100dvh - 126px)); }
        }

        .starRow {
          font-size: 24px;
          letter-spacing: 0.1em;
          color: #ffe27d;
          text-shadow: 0 0 15px rgba(255, 218, 110, 0.28);
          margin: -2px 0 4px;
        }

        .rewardRow {
          display: grid;
          gap: 4px;
          margin: 8px 0 10px;
          color: rgba(255, 242, 199, 0.88);
          font-size: 12px;
          font-weight: 850;
        }


        @keyframes finalePulse {
          from { transform: translateY(0) scale(0.995); filter: brightness(1); }
          to { transform: translateY(-1px) scale(1.01); filter: brightness(1.12); }
        }



        .panel,
        .miniPanel,
        .goalCard,
        .bottomBar button,
        .arrowBtn {
          transform: translateZ(0);
          backface-visibility: hidden;
        }

        .bottomBar button,
        .arrowBtn {
          transition: transform 90ms ease, filter 120ms ease, opacity 120ms ease;
        }

        .bottomBar button:active,
        .arrowBtn:active {
          transform: scale(0.975);
          filter: brightness(1.12);
        }

        .goalCard {
          box-shadow: 0 14px 30px rgba(0,0,0,0.46), inset 0 1px 0 rgba(255,255,255,0.11);
        }

      `}</style>
    </main>
  );
}
