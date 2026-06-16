"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

type Rune = "blue" | "spiral" | "orange" | "triangle" | "leaf" | "golden" | "lotus";
type ObjectiveKind = "score" | "collect" | "fog";

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
  phase: "idle" | "busy" | "win" | "fail";
  message: string;
};

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
  return "★";
}

export default function RuneRushPixiFullPage() {
  const [levelIndex, setLevelIndex] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const [hud, setHud] = useState<HudState>(emptyHud);
  const boardKey = useMemo(() => `pixi-full-${levelIndex}-${resetKey}`, [levelIndex, resetKey]);

  return (
    <main className="pageShell">
      <header className="topNav">
        <button
          className="arrowBtn"
          onClick={() => {
            setLevelIndex((v) => Math.max(0, v - 1));
            setResetKey((v) => v + 1);
          }}
          aria-label="Previous level"
        >
          ‹
        </button>

        <div className="levelPill">
          <span>LEVEL</span>
          <b>{hud.level}</b>
        </div>

        <div className="lifePill">
          <span>♥</span>
          <b>{hud.lives}</b>
          <small>FULL</small>
        </div>

        <button
          className="arrowBtn"
          onClick={() => {
            setLevelIndex((v) => v + 1);
            setResetKey((v) => v + 1);
          }}
          aria-label="Next level"
        >
          ›
        </button>
      </header>

      <section className="statsRow">
        <div className="stat">
          <span>MOVES</span>
          <b>{hud.moves}</b>
        </div>
        <div className="stat">
          <span>SCORE</span>
          <b>{hud.score.toLocaleString()}</b>
        </div>
        <div className="stat">
          <span>COMBO</span>
          <b>{hud.combo > 1 ? `x${hud.combo}` : "—"}</b>
        </div>
      </section>

      <section className="goalCard">
        <div className={`goalIcon ${hud.objectiveKind}`}>{objectiveIcon(hud.objectiveKind)}</div>
        <div className="goalMain">
          <div className="goalTop">
            <div>
              <div className="eyebrow">GOAL</div>
              <div className="goalTitle">{hud.objectiveLabel}</div>
            </div>
            <div className="goalCount">{hud.objectiveText}</div>
          </div>
          {hud.collect && (
            <div className="collectRow">
              {Object.entries(hud.collect).map(([r, v]) => (
                <span key={r} className="collectChip">
                  <img src={`/runes/${r}.png`} alt={r} /> {v ?? 0}
                </span>
              ))}
            </div>
          )}
          <div className="progressTrack">
            <span style={{ width: `${Math.round(hud.progress * 100)}%` }} />
          </div>
          <div className="messageLine">{hud.message}</div>
        </div>
      </section>

      <section className="boardFrame">
        <RuneRushPixiBoard
          key={boardKey}
          levelIndex={levelIndex}
          onHud={setHud}
          onLevelComplete={() => {}}
        />
      </section>

      <footer className="bottomBar">
        <button onClick={() => setResetKey((v) => v + 1)}>↻ Restart</button>
        <button onClick={() => navigator?.share?.({ text: `Toby's Rune Rush Level ${hud.level} — score ${hud.score}` }).catch(() => {})}>↗ Share</button>
      </footer>

      {hud.phase === "win" && (
        <div className="modalShade">
          <div className="modalCard">
            <h2>LEVEL COMPLETE</h2>
            <p>Clean run. Nice combo chain.</p>
            <div className="modalBtns">
              <button
                onClick={() => {
                  setLevelIndex((v) => v + 1);
                  setResetKey((v) => v + 1);
                }}
              >
                Next
              </button>
              <button onClick={() => setResetKey((v) => v + 1)}>Replay</button>
            </div>
          </div>
        </div>
      )}

      {hud.phase === "fail" && (
        <div className="modalShade">
          <div className="modalCard">
            <h2>OUT OF MOVES</h2>
            <p>Try again with a cleaner chain.</p>
            <div className="modalBtns">
              <button onClick={() => setResetKey((v) => v + 1)}>Retry</button>
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
          gap: 10px;
          padding: max(10px, env(safe-area-inset-top)) 10px max(12px, env(safe-area-inset-bottom));
          background:
            radial-gradient(circle at 50% 0%, rgba(18, 80, 42, 0.34), rgba(0, 0, 0, 0) 44%),
            linear-gradient(180deg, #06140f 0%, #020604 58%, #010302 100%);
        }

        .topNav,
        .statsRow,
        .goalCard,
        .bottomBar,
        .boardFrame {
          width: min(96vw, 560px);
        }

        .topNav {
          display: grid;
          grid-template-columns: 44px 1fr 1fr 44px;
          gap: 8px;
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
            linear-gradient(rgba(0, 0, 0, 0.14), rgba(0, 0, 0, 0.38)),
            url("/textures/obsidian.png"),
            url("/textures/stone.png");
          background-size: cover;
          background-position: center;
          border: 1px solid rgba(255, 220, 150, 0.18);
          box-shadow: 0 12px 26px rgba(0, 0, 0, 0.48), inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }

        .arrowBtn {
          height: 54px;
          border-radius: 18px;
          font-size: 32px;
          border-color: rgba(255, 172, 88, 0.2);
          background-color: rgba(0, 0, 0, 0.35);
        }

        .levelPill,
        .lifePill {
          height: 54px;
          border-radius: 18px;
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
          font-size: 30px;
          line-height: 1;
          color: #fff6c8;
        }

        .lifePill span {
          color: #ff675d;
          font-size: 20px;
        }

        .lifePill small {
          font-size: 11px;
          color: rgba(255, 245, 210, 0.65);
        }

        .statsRow {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }

        .stat {
          min-height: 58px;
          border-radius: 15px;
          display: grid;
          place-items: center;
          padding: 8px 6px;
          text-align: center;
        }

        .stat span,
        .eyebrow {
          font-size: 11px;
          color: rgba(255, 226, 170, 0.74);
          font-weight: 950;
          letter-spacing: 0.08em;
        }

        .stat b {
          font-size: 24px;
          line-height: 1;
          color: #fff3c4;
        }

        .goalCard {
          min-height: 96px;
          border-radius: 22px;
          display: grid;
          grid-template-columns: 48px 1fr;
          gap: 12px;
          align-items: center;
          padding: 12px 14px;
        }

        .goalIcon {
          font-size: 42px;
          color: #ffd675;
          text-shadow: 0 0 14px rgba(255, 184, 60, 0.35);
          text-align: center;
        }

        .goalIcon.fog { color: #eef8ff; }
        .goalIcon.collect { color: #b9ffbd; }

        .goalTop {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .goalTitle {
          font-size: clamp(21px, 5vw, 30px);
          font-weight: 950;
          line-height: 1;
          color: #fff7d1;
        }

        .goalCount {
          color: #8aff67;
          font-size: clamp(20px, 4.8vw, 28px);
          font-weight: 950;
          line-height: 1;
          white-space: nowrap;
        }

        .collectRow {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 6px;
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

        .collectChip img { width: 18px; height: 18px; object-fit: contain; }

        .progressTrack {
          margin-top: 9px;
          width: 100%;
          height: 10px;
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
          min-height: 16px;
          color: rgba(255, 245, 210, 0.62);
          font-size: 12px;
          font-weight: 700;
        }

        .boardFrame {
          border-radius: 26px;
          border: 2px solid rgba(255, 147, 70, 0.58);
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.55), 0 0 0 4px rgba(255, 120, 45, 0.08);
          overflow: hidden;
          display: grid;
          place-items: center;
          background: rgba(0, 0, 0, 0.34);
          padding: 8px;
        }

        .loadingBoard {
          width: min(94vw, 540px);
          aspect-ratio: 1 / 1;
          display: grid;
          place-items: center;
          color: rgba(255, 245, 210, 0.72);
        }

        .bottomBar {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .bottomBar button {
          height: 52px;
          border-radius: 18px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.04em;
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
          border-radius: 24px;
          padding: 22px;
          color: #fff6c8;
        }

        .modalCard h2 {
          margin: 0;
          font-size: 28px;
        }

        .modalCard p { color: rgba(255, 245, 210, 0.72); }

        .modalBtns {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .modalBtns button {
          height: 52px;
          border-radius: 18px;
          font-weight: 900;
        }

        @media (max-width: 460px) {
          .pageShell { gap: 8px; padding-left: 8px; padding-right: 8px; }
          .topNav { grid-template-columns: 42px 1fr 1fr 42px; gap: 6px; }
          .arrowBtn, .levelPill, .lifePill { height: 48px; border-radius: 16px; }
          .levelPill b, .lifePill b { font-size: 27px; }
          .stat { min-height: 53px; }
          .goalCard { min-height: 88px; padding: 10px 12px; border-radius: 20px; }
          .goalIcon { font-size: 36px; }
          .boardFrame { padding: 6px; border-radius: 23px; }
          .bottomBar button { height: 48px; }
        }
      `}</style>
    </main>
  );
}
