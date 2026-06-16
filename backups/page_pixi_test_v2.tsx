"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

const RuneRushPixiBoard = dynamic(() => import("./components/RuneRushPixiBoard"), {
  ssr: false,
  loading: () => <div className="loadingBoard">Loading Pixi board...</div>,
});

export default function RuneRushPixiTestPage() {
  const [seed, setSeed] = useState(1);
  const [lastAction, setLastAction] = useState("Tap a tile to test animation");

  const cacheKey = useMemo(() => `pixi-test-v2-${seed}`, [seed]);

  return (
    <main className="pageShell">
      <div className="topHud">
        <div className="pill">LEVEL <b>1</b></div>
        <div className="pill">❤️ <b>7</b></div>
      </div>

      <div className="statsRow">
        <div className="stat"><span>MOVES</span><b>17</b></div>
        <div className="stat"><span>SCORE</span><b>0</b></div>
        <div className="stat"><span>TEST</span><b>PIXI</b></div>
      </div>

      <section className="goalCard">
        <div className="star">★</div>
        <div>
          <div className="eyebrow">PIXI BOARD TEST V2</div>
          <div className="goalText">Obsidian tiles + bright rune sprites</div>
          <div className="miniStatus">{lastAction}</div>
          <div className="progress"><span /></div>
        </div>
      </section>

      <section className="boardFrame">
        <RuneRushPixiBoard key={cacheKey} onAction={setLastAction} />
      </section>

      <footer className="buttons">
        <button onClick={() => setSeed((s) => s + 1)}>Reset Test</button>
        <button onClick={() => setLastAction("Phone/tablet/laptop consistency test")}>Info</button>
      </footer>

      <style jsx global>{`
        html, body {
          margin: 0;
          padding: 0;
          min-height: 100%;
          background: #020806;
          color: #fff1c6;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          overflow-x: hidden;
        }

        * { box-sizing: border-box; }

        .pageShell {
          min-height: 100vh;
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          padding: max(10px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom));
          background:
            radial-gradient(circle at 50% 8%, rgba(22, 80, 48, 0.45), rgba(0, 0, 0, 0) 42%),
            linear-gradient(180deg, #06140f, #020604 62%, #010302);
        }

        .topHud, .statsRow, .goalCard, .buttons {
          width: min(94vw, 560px);
        }

        .topHud {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .pill, .stat, .goalCard, .boardFrame, .buttons button {
          background-image:
            linear-gradient(rgba(0, 0, 0, 0.18), rgba(0, 0, 0, 0.42)),
            url("/textures/obsidian.png"),
            url("/textures/stone.png");
          background-size: cover;
          background-position: center;
          border: 1px solid rgba(255, 220, 140, 0.18);
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }

        .pill {
          height: 52px;
          border-radius: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          color: rgba(255, 235, 180, 0.82);
          font-weight: 800;
          letter-spacing: 0.04em;
        }

        .pill b { font-size: 28px; color: #fff4c6; }

        .statsRow {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }

        .stat {
          min-height: 58px;
          border-radius: 14px;
          display: grid;
          place-items: center;
          padding: 8px 6px;
          text-align: center;
        }

        .stat span {
          font-size: 11px;
          color: rgba(255, 226, 170, 0.7);
          font-weight: 900;
          letter-spacing: 0.08em;
        }

        .stat b {
          font-size: 22px;
          line-height: 1;
          color: #fff3c4;
        }

        .goalCard {
          min-height: 82px;
          border-radius: 20px;
          display: grid;
          grid-template-columns: 46px 1fr;
          gap: 12px;
          align-items: center;
          padding: 12px 14px;
        }

        .star {
          font-size: 42px;
          color: #ffd675;
          text-shadow: 0 0 14px rgba(255, 184, 60, 0.35);
        }

        .eyebrow {
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.08em;
          color: rgba(255, 224, 168, 0.72);
        }

        .goalText {
          font-size: 16px;
          font-weight: 800;
          color: #fff7d1;
        }

        .miniStatus {
          margin-top: 2px;
          min-height: 18px;
          font-size: 12px;
          color: rgba(255, 245, 210, 0.7);
        }

        .progress {
          margin-top: 6px;
          width: min(220px, 70%);
          height: 8px;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.42);
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .progress span {
          display: block;
          width: 46%;
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #86ff5f, #d9ff77);
        }

        .boardFrame {
          position: relative;
          width: min(94vw, 560px);
          aspect-ratio: 1 / 1;
          border-radius: 24px;
          padding: 10px;
          border: 2px solid rgba(255, 145, 58, 0.8);
          overflow: hidden;
        }

        .loadingBoard {
          width: min(94vw, 560px);
          aspect-ratio: 1 / 1;
          display: grid;
          place-items: center;
          color: #fff4c6;
          background: rgba(0, 0, 0, 0.4);
          border-radius: 24px;
          border: 1px solid rgba(255, 145, 58, 0.4);
        }

        .buttons {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .buttons button {
          min-height: 48px;
          border-radius: 16px;
          color: #fff1c8;
          font-weight: 900;
          border: 1px solid rgba(255, 220, 140, 0.18);
        }

        canvas {
          display: block;
          width: 100% !important;
          height: 100% !important;
        }

        @media (max-height: 760px) {
          .pageShell { gap: 7px; padding-top: 8px; }
          .pill { height: 44px; }
          .pill b { font-size: 24px; }
          .stat { min-height: 48px; }
          .goalCard { min-height: 72px; padding: 10px 12px; }
        }
      `}</style>
    </main>
  );
}
