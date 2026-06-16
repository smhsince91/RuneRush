"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

type Rune = "blue" | "spiral" | "orange" | "triangle" | "leaf" | "golden" | "lotus";
type ObjectiveKind = "score" | "collect" | "fog" | "ingredient";

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
const UNLOCK_STORAGE_KEY = "toby-rune-rush-unlocked-level-v25";
const BEST_SCORE_STORAGE_KEY = "toby-rune-rush-best-scores-v1";
const AUDIO_SETTINGS_STORAGE_KEY = "toby-rune-rush-audio-settings-v1";
const MUSIC_CANDIDATES = [
  "/music/DYYDKvYOniU.mp3",
  "/music/tobyworld-background.mp3",
  "/music/theme.mp3",
  "/music/background.mp3",
  "/music/toby-theme.mp3",
  "/sounds/music.mp3",
  "/audio/music.mp3",
];

const YOUTUBE_MUSIC_EMBED = "https://www.youtube.com/embed/DYYDKvYOniU?autoplay=1&loop=1&playlist=DYYDKvYOniU&controls=0&disablekb=1&modestbranding=1&playsinline=1";

type AudioSettings = {
  gameSounds: boolean;
  music: boolean;
};

const DEFAULT_AUDIO_SETTINGS: AudioSettings = { gameSounds: true, music: false };

function cleanAudioSettings(value: unknown): AudioSettings {
  if (!value || typeof value !== "object") return DEFAULT_AUDIO_SETTINGS;
  const raw = value as Partial<Record<keyof AudioSettings, unknown>>;
  return {
    gameSounds: typeof raw.gameSounds === "boolean" ? raw.gameSounds : DEFAULT_AUDIO_SETTINGS.gameSounds,
    music: typeof raw.music === "boolean" ? raw.music : DEFAULT_AUDIO_SETTINGS.music,
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
  golden: "/runes/golden.png",
  lotus: "/runes/lotus.png",
};

const RUNE_ICON_CANDIDATES: Record<Rune, string[]> = {
  blue: ["/runes/blue.png", "/runes/blue.webp", "/assets/runes/blue.png"],
  spiral: ["/runes/spiral.png", "/runes/spiral.webp", "/assets/runes/spiral.png"],
  orange: ["/runes/orange.png", "/runes/orange.webp", "/assets/runes/orange.png"],
  triangle: ["/runes/triangle.png", "/runes/triangle.webp", "/assets/runes/triangle.png"],
  leaf: ["/runes/leaf.png", "/runes/leaf.webp", "/runes/green-leaf.png", "/runes/Leaf.png", "/assets/runes/leaf.png"],
  golden: ["/runes/golden.png", "/runes/golden.webp", "/assets/runes/golden.png"],
  lotus: ["/runes/lotus.png", "/runes/lotus.webp", "/assets/runes/lotus.png"],
};

const RUNE_FALLBACK: Record<Rune, string> = {
  blue: "🐸",
  spiral: "🌀",
  orange: "■",
  triangle: "▲",
  leaf: "🍃",
  golden: "🐸",
  lotus: "✦",
};

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

const RuneRushPixiBoard = dynamic(() => import("./components/RuneRushPixiBoard"), {
  ssr: false,
  loading: () => <div className="loadingBoard">Loading Pixi board...</div>,
});

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

function objectiveIcon(kind: ObjectiveKind) {
  if (kind === "fog") return "☁";
  if (kind === "collect") return "✦";
  if (kind === "ingredient") return "⚿";
  return "★";
}

function objectiveDirections(hud: HudState) {
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

function CollectRuneIcon({ rune }: { rune: Rune }) {
  const [imageIndex, setImageIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const candidates = RUNE_ICON_CANDIDATES[rune] ?? [RUNE_ICON_FILES[rune]];
  const src = candidates[imageIndex];

  // No emoji fallback behind transparent rune art. This prevents the green leaf
  // from ever showing a default emoji while the real rune image is loading.
  if (!src) {
    return <span className="chipRune noEmojiFallback" aria-label={rune} />;
  }

  return (
    <span className={`chipRune ${loaded ? "loadedRune" : "loadingRune"}`} aria-label={rune}>
      <img
        key={src}
        src={`${src}?v=collect86`}
        alt={rune}
        draggable={false}
        loading="eager"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => {
          setLoaded(false);
          setImageIndex((i) => i + 1);
        }}
      />
    </span>
  );
}

export default function RuneRushPixiFullPage() {
  const [levelIndex, setLevelIndex] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(() => loadAudioSettings());
  const [soundMenuOpen, setSoundMenuOpen] = useState(false);
  const [youtubeMusicFallbackActive, setYoutubeMusicFallbackActive] = useState(false);
  const [hud, setHud] = useState<HudState>(emptyHud);
  const [lifeState, setLifeState] = useState<LifeState>({ lives: MAX_LIVES, nextLifeAt: null, countdown: "FULL", loaded: false });
  const [highestUnlocked, setHighestUnlocked] = useState(0);
  const [bestScores, setBestScores] = useState<BestScores>({});
  const [runAllowed, setRunAllowed] = useState(true);
  const [noLivesMessage, setNoLivesMessage] = useState("");
  const [outOfMovesQuote, setOutOfMovesQuote] = useState(() => pickOutOfMovesQuote());
  const failedLevelKeys = useRef(new Set<string>());
  const bestSavedLevelKeys = useRef(new Set<string>());
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const musicIndexRef = useRef(0);
  const musicWantedRef = useRef(audioSettings.music);
  const youtubeMusicFallbackRef = useRef(false);
  const previousPhaseRef = useRef<HudState["phase"]>("idle");
  const boardKey = useMemo(() => `pixi-full-v102-${levelIndex}-${resetKey}`, [levelIndex, resetKey]);
  const canPlay = runAllowed || lifeState.lives > 0;
  const currentBestScore = getBestScore(bestScores, levelIndex);
  const displayedBestScore = currentBestScore;
  const gameSoundsOn = audioSettings.gameSounds;
  const musicOn = audioSettings.music;
  const anyAudioOn = gameSoundsOn || musicOn;

  const updateAudioSettings = (patch: Partial<AudioSettings>) => {
    setAudioSettings((prev) => cleanAudioSettings({ ...prev, ...patch }));
  };

  const setAllAudio = (enabled: boolean) => {
    setAudioSettings({ gameSounds: enabled, music: enabled });
  };

  const getMusicAudio = () => {
    if (typeof window === "undefined") return null;
    if (musicAudioRef.current) return musicAudioRef.current;

    const audio = new Audio(MUSIC_CANDIDATES[musicIndexRef.current]);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0.22;
    audio.addEventListener("error", () => {
      if (musicIndexRef.current >= MUSIC_CANDIDATES.length - 1) {
        // A YouTube watch URL cannot be used as a normal <audio> source.
        // If no local MP3 is found, fall back to the embedded looping YouTube player.
        youtubeMusicFallbackRef.current = true;
        setYoutubeMusicFallbackActive(true);
        return;
      }
      musicIndexRef.current += 1;
      audio.src = MUSIC_CANDIDATES[musicIndexRef.current];
      try { audio.load(); } catch {}
      if (musicWantedRef.current) audio.play().catch(() => {});
    });
    audio.addEventListener("canplay", () => {
      youtubeMusicFallbackRef.current = false;
      setYoutubeMusicFallbackActive(false);
    });
    try { audio.load(); } catch {}
    musicAudioRef.current = audio;
    return audio;
  };

  const playMusicIfAllowed = () => {
    if (!musicWantedRef.current) return;
    const audio = getMusicAudio();
    if (!audio) return;
    audio.volume = 0.22;
    audio.muted = false;
    audio.play().catch(() => {});
  };

  useEffect(() => {
    const loaded = loadLifeState();
    const unlocked = loadUnlockedLevel();
    const savedBestScores = loadBestScores();
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
    saveAudioSettings(audioSettings);
  }, [audioSettings]);

  useEffect(() => {
    musicWantedRef.current = musicOn;
    const audio = getMusicAudio();

    if (!musicOn) {
      youtubeMusicFallbackRef.current = false;
      setYoutubeMusicFallbackActive(false);
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      return;
    }

    playMusicIfAllowed();

    const unlockMusic = () => playMusicIfAllowed();
    window.addEventListener("pointerdown", unlockMusic, { passive: true });
    window.addEventListener("touchstart", unlockMusic, { passive: true });
    window.addEventListener("keydown", unlockMusic);

    return () => {
      window.removeEventListener("pointerdown", unlockMusic);
      window.removeEventListener("touchstart", unlockMusic);
      window.removeEventListener("keydown", unlockMusic);
    };
  }, [musicOn]);

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
    <main className="pageShell">
      <header className="topNav">
        <div className="levelPill">
          <span>LEVEL</span>
          <b>{hud.level}</b>
        </div>

        <div className="lifePill">
          <span>♥</span>
          <b>{lifeState.lives}</b>
          <small>{lifeState.lives < MAX_LIVES ? lifeState.countdown : "FULL"}</small>
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
          <b>{hud.combo > 1 ? `x${hud.combo}` : "—"}</b>
        </div>
        <div className="stat bestStat">
          <span>BEST</span>
          <b>{displayedBestScore > 0 ? formatScore(displayedBestScore) : "—"}</b>
        </div>
      </section>

      <section className="goalCard">
        <div className={`goalIcon ${hud.objectiveKind}`}>{objectiveIcon(hud.objectiveKind)}</div>
        <div className="goalMain">
          <div className="goalTop">
            <div>
              <div className="eyebrow">GOAL</div>
              <div className="goalTitle">
                <span>{hud.objectiveLabel}</span>
                {hud.collect &&
                  Object.entries(hud.collect)
                    .slice(0, 1)
                    .map(([r, v]) => {
                      const rune = r as Rune;
                      return (
                        <span key={r} className="goalInlineCollect">
                          <CollectRuneIcon rune={rune} />
                          <b>{v ?? 0}</b>
                        </span>
                      );
                    })}
                {hud.objectiveKind === "ingredient" && hud.ingredient && (
                  <span className="goalInlineIngredient" aria-label="Sacred Key and Golden Coin remaining">
                    <b>{hud.ingredient.total - hud.ingredient.dropped} left</b>
                  </span>
                )}
              </div>
            </div>
            <div className="goalCount">{hud.objectiveText}</div>
          </div>
          <div className="progressTrack">
            <span style={{ width: `${Math.round(hud.progress * 100)}%` }} />
          </div>
          <div className="infoHubLine"><b>HOW:</b> {objectiveDirections(hud)}</div>
          {hud.phase !== "finale" && hud.phase !== "win" && !/rune|runic|chain|victory|bloom/i.test(hud.message) && <div className="messageLine">{hud.message}</div>}
        </div>
      </section>

      <section className="boardFrame">
        {canPlay ? (
          <RuneRushPixiBoard
            key={boardKey}
            levelIndex={levelIndex}
            onHud={handleHudUpdate}
            soundOn={gameSoundsOn}
            onLevelComplete={handleLevelComplete}
            onLevelFailed={handleLevelFailed}
          />
        ) : (
          <div className="noLivesBoard">
            <div className="noLivesIcon">♥</div>
            <h2>{lifeState.lives <= 0 ? "Out of lives" : "Loading level"}</h2>
            <p>{lifeState.lives <= 0 ? `Next life in ${lifeState.countdown}` : "Preparing the pond..."}</p>
          </div>
        )}
      </section>

      {noLivesMessage && <div className="lifeMessage">{noLivesMessage}</div>}

      {musicOn && youtubeMusicFallbackActive && (
        <iframe
          className="youtubeMusicFrame"
          title="Toby Rune Rush background music"
          src={YOUTUBE_MUSIC_EMBED}
          allow="autoplay; encrypted-media"
        />
      )}

      <footer className="bottomBar">
        <button
          type="button"
          className="arrowBtn bottomLevelArrow"
          onClick={() => startLevel(levelIndex - 1)}
          aria-label="Previous level"
        >
          ‹
        </button>

        <div className="soundMenuWrap">
          <button
            type="button"
            className={anyAudioOn ? "soundBtn on" : "soundBtn off"}
            onClick={() => setSoundMenuOpen((v) => !v)}
            aria-expanded={soundMenuOpen}
            aria-controls="audioSettingsMenu"
          >
            {anyAudioOn ? "🔊 Audio" : "🔇 Audio"}
          </button>

          {soundMenuOpen && (
            <div id="audioSettingsMenu" className="soundMenu" role="menu" aria-label="Audio settings">
              <div className="soundMenuHead">
                <div className="soundMenuTitle">Audio Settings</div>
                <button type="button" className="soundMenuClose" onClick={() => setSoundMenuOpen(false)} aria-label="Close audio settings">×</button>
              </div>

              <button
                type="button"
                className={gameSoundsOn ? "audioToggle on" : "audioToggle off"}
                onClick={() => updateAudioSettings({ gameSounds: !gameSoundsOn })}
              >
                <span>Game sounds</span>
                <b>{gameSoundsOn ? "ON" : "OFF"}</b>
              </button>

              <button
                type="button"
                className={musicOn ? "audioToggle on" : "audioToggle off"}
                onClick={() => updateAudioSettings({ music: !musicOn })}
              >
                <span>Music</span>
                <b>{musicOn ? "ON" : "OFF"}</b>
              </button>

              <div className="audioQuickRow">
                <button type="button" onClick={() => setAllAudio(true)}>Both On</button>
                <button type="button" onClick={() => setAllAudio(false)}>Both Off</button>
              </div>

              <button type="button" className="audioCloseWide" onClick={() => setSoundMenuOpen(false)}>Done</button>
            </div>
          )}
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
          <div className="modalCard">
            <h2>OUT OF MOVES</h2>
            <p>{outOfMovesQuote}</p>
            <div className="modalBtns">
              <button onClick={retryFailedLevel}>Retry</button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
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
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          padding: max(8px, env(safe-area-inset-top)) 10px max(10px, env(safe-area-inset-bottom));
          background:
            radial-gradient(circle at 50% 0%, rgba(18, 80, 42, 0.34), rgba(0, 0, 0, 0) 44%),
            linear-gradient(180deg, #06140f 0%, #020604 58%, #010302 100%);
        }

        .pageShell {
          --game-w: min(94vw, 500px, calc(100dvh - 214px));
        }

        .topNav,
        .statsRow,
        .goalCard,
        .bottomBar,
        .boardFrame {
          width: var(--game-w);
          min-width: 286px;
          max-width: 500px;
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
          font-size: 28px;
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

        .lifePill span {
          color: #ff675d;
          font-size: 16px;
        }

        .lifePill small {
          font-size: 10px;
          color: rgba(255, 245, 210, 0.65);
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

        .goalCard {
          min-height: 54px;
          border-radius: 19px;
          display: grid;
          grid-template-columns: 34px 1fr;
          gap: 10px;
          align-items: center;
          padding: 7px 10px;
        }

        .goalIcon {
          font-size: 28px;
          color: #ffd675;
          text-shadow: 0 0 14px rgba(255, 184, 60, 0.35);
          text-align: center;
        }

        .goalIcon.fog { color: #eef8ff; }
        .goalIcon.collect { color: #b9ffbd; }
        .goalIcon.ingredient { color: #ffe29a; font-size: 18px; }

        .goalTop {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .goalTitle {
          font-size: clamp(16px, 3.7vw, 22px);
          font-weight: 950;
          line-height: 1;
          color: #fff7d1;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .goalCount {
          color: #8aff67;
          font-size: clamp(16px, 3.6vw, 21px);
          font-weight: 950;
          line-height: 1;
          white-space: nowrap;
        }

        .goalInlineCollect {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          transform: translateY(1px);
          border-radius: 999px;
          padding: 2px 7px 2px 4px;
          background: rgba(0, 0, 0, 0.22);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.035);
          color: #fff1bc;
          font-size: 13px;
          line-height: 1;
        }

        .goalInlineCollect .chipRune {
          width: 26px;
          height: 26px;
        }

        .goalInlineCollect .chipRune img {
          width: 24px;
          height: 24px;
        }

        .collectRow {
          display: none;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 5px;
        }

        .collectChip {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          border-radius: 999px;
          padding: 3px 7px;
          background: rgba(0, 0, 0, 0.28);
          border: 1px solid rgba(255, 220, 150, 0.12);
          font-weight: 900;
          font-size: 12px;
        }

        .collectChip img { width: 22px; height: 22px; object-fit: contain; }
        .goalInlineIngredient { display: inline-flex; align-items: center; gap: 4px; margin-left: 7px; }
        .goalInlineIngredient b {
          font-size: 18px;
          color: #fff4b0;
          padding: 1px 8px;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.20);
          border: 1px solid rgba(255, 224, 150, 0.16);
        }
        .ingredientMini {
          display: inline-grid;
          place-items: center;
          width: 22px;
          height: 22px;
          border-radius: 999px;
          position: relative;
          background: linear-gradient(180deg, rgba(255, 221, 143, 0.18), rgba(141, 86, 32, 0.14));
          border: 1px solid rgba(255, 225, 156, 0.34);
          box-shadow: none;
          overflow: hidden;
        }
        .coinMini::before {
          content: "";
          width: 13px;
          height: 13px;
          border-radius: 999px;
          background: #d99a2f;
          border: 1px solid rgba(255, 242, 194, 0.82);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.30);
        }
        .coinMini::after {
          content: "";
          position: absolute;
          width: 5px;
          height: 8px;
          border-radius: 999px;
          background: rgba(255,255,255,0.34);
          left: 7px;
          top: 5px;
          transform: rotate(26deg);
        }
        .keyMini::before {
          content: "";
          position: absolute;
          width: 8px;
          height: 8px;
          border: 2px solid rgba(255, 242, 194, 0.92);
          border-radius: 999px;
          left: 4px;
          top: 5px;
        }
        .keyMini::after {
          content: "";
          position: absolute;
          width: 12px;
          height: 4px;
          border-radius: 999px;
          background: #d99a2f;
          border: 1px solid rgba(255, 242, 194, 0.78);
          left: 9px;
          top: 10px;
          box-shadow: 5px 3px 0 -1px #d99a2f;
          transform: rotate(-16deg);
        }
        .infoHubLine {
          margin-top: 4px;
          color: rgba(255, 238, 190, 0.67);
          font-size: 10.5px;
          line-height: 1.22;
          font-weight: 800;
          letter-spacing: 0.01em;
        }
        .infoHubLine b {
          color: rgba(255, 214, 117, 0.88);
          font-weight: 950;
          letter-spacing: 0.06em;
        }
        .chipRune {
          width: 28px;
          height: 28px;
          display: inline-grid;
          place-items: center;
          flex: 0 0 auto;
          overflow: visible;
          position: relative;
          border-radius: 999px;
          background: transparent;
        }

        .chipRuneFallback {
          display: none;
        }

        .chipRune img {
          width: 26px;
          height: 26px;
          object-fit: contain;
          display: block;
          position: relative;
          z-index: 2;
          opacity: 1;
          image-rendering: auto;
          filter: brightness(1.10) contrast(1.08);
        }

        .chipRune.loadingRune img {
          opacity: 0;
        }

        .chipRune.loadedRune img {
          opacity: 1;
        }

        .chipRune.fallbackOnly,
        .chipRune.noEmojiFallback {
          font-size: 0;
          line-height: 1;
        }

        .chipRune.noEmojiFallback::after {
          content: "";
          display: none;
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


        .progressTrack {
          margin-top: 5px;
          width: 100%;
          height: 7px;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.42);
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .progressTrack span {
          display: block;
          height: 100%;
          border-radius: 999px;
          background: linear-gradient(90deg, #75ff56, #d8ff92);
          transition: width 180ms ease-out;
        }

        .messageLine {
          margin-top: 5px;
          min-height: 14px;
          color: rgba(255, 245, 210, 0.62);
          font-size: 10px;
          font-weight: 700;
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
        }

        .pixiHost canvas {
          width: 100% !important;
          height: 100% !important;
          display: block;
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

        .bottomBar {
          display: grid;
          grid-template-columns: 0.72fr 1fr 1fr 0.72fr;
          gap: 7px;
          align-items: center;
        }

        .bottomBar button {
          height: 42px;
          border-radius: 18px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.035em;
          font-size: 12px;
          white-space: nowrap;
        }

        .soundBtn.off {
          opacity: 0.72;
        }

        .soundMenuWrap {
          position: relative;
          min-width: 0;
          z-index: 11;
        }

        .soundMenuWrap > .soundBtn {
          width: 100%;
        }

        .soundMenu {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          bottom: calc(100% + 9px);
          width: min(276px, calc(var(--game-w) - 16px));
          border-radius: 20px;
          padding: 10px;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.075), rgba(0,0,0,0.24)),
            url("/textures/obsidian.png"),
            #08120d;
          background-size: cover;
          background-position: center;
          border: 1px solid rgba(255, 220, 150, 0.22);
          box-shadow: 0 20px 42px rgba(0,0,0,0.62), inset 0 1px 0 rgba(255,255,255,0.1);
          color: #fff6c8;
        }

        .soundMenu::after {
          content: "";
          position: absolute;
          left: 32px;
          bottom: -7px;
          width: 14px;
          height: 14px;
          transform: rotate(45deg);
          background: #08120d;
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
          gap: 10px;
          margin-bottom: 8px;
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
          font-size: 18px !important;
          line-height: 1;
        }

        .soundMenu button {
          background-image: none;
          background-color: rgba(0, 0, 0, 0.24);
          border: 1px solid rgba(255, 220, 150, 0.14);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.055);
          height: auto;
          min-height: 38px;
          border-radius: 14px;
          font-size: 11px;
          letter-spacing: 0.04em;
        }

        .audioToggle {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 9px 10px;
          margin-bottom: 7px;
        }

        .audioToggle b {
          min-width: 42px;
          text-align: center;
          border-radius: 999px;
          padding: 4px 8px;
          color: #071007;
          background: #b8ff8e;
        }

        .audioToggle.off {
          opacity: 0.76;
        }

        .audioToggle.off b {
          color: rgba(255, 245, 210, 0.72);
          background: rgba(255,255,255,0.09);
        }

        .audioQuickRow {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 7px;
        }

        .audioQuickRow button {
          min-height: 34px;
          padding: 8px 7px;
        }

        .audioCloseWide {
          width: 100%;
          margin-top: 7px;
          min-height: 34px !important;
          padding: 8px 7px !important;
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

        @media (max-width: 460px) {
          .pageShell { gap: 6px; padding-left: 8px; padding-right: 8px; }
          .topNav { grid-template-columns: 1fr 1fr; gap: 6px; }
          .arrowBtn, .levelPill, .lifePill { height: 44px; border-radius: 14px; }
          .levelPill b, .lifePill b { font-size: 24px; }
          .lifePill small { font-size: 10px; }
          .statsRow { gap: 6px; }
          .stat { min-height: 45px; border-radius: 13px; }
          .stat span, .eyebrow { font-size: 9px; }
          .stat b { font-size: 20px; }
          .goalCard { min-height: 72px; padding: 8px 10px; border-radius: 17px; grid-template-columns: 36px 1fr; }
          .goalIcon { font-size: 30px; }
          .goalTitle { font-size: 16px; }
          .goalCount { font-size: 16px; }
          .messageLine { display: none; }
          .infoHubLine { font-size: 9.5px; margin-top: 3px; }
          .boardFrame { width: min(94vw, 500px, calc(100dvh - 300px)); min-width: 282px; padding: 0; border-radius: 20px; }
          .bottomBar { grid-template-columns: 0.68fr 1fr 1fr 0.68fr; gap: 6px; }
          .bottomBar button { height: 44px; font-size: 12px; }
          .bottomLevelArrow { font-size: 27px; }
        }

        @media (min-width: 760px) {
          .pageShell { gap: 8px; }
          .boardFrame { width: min(94vw, 500px, 66vh); }
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
