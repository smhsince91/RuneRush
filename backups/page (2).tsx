"use client";

import dynamic from "next/dynamic";
import { motion } from "motion/react";

const RuneRushPixiBoard = dynamic(() => import("./components/RuneRushPixiBoard"), {
  ssr: false,
  loading: () => <div className="loadingBox">Loading Pixi board...</div>,
});

export default function RuneRushPixiTestPage() {
  return (
    <main className="testApp">
      <section className="topHud">
        <motion.div className="pill level" initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          <span>LEVEL</span>
          <strong>1</strong>
        </motion.div>
        <motion.div className="pill lives" initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.04 }}>
          <span>♥</span>
          <strong>7</strong>
        </motion.div>
      </section>

      <section className="statsRow">
        <div className="stat"><span>MOVES</span><strong>17</strong></div>
        <div className="stat"><span>SCORE</span><strong>0</strong></div>
        <div className="stat"><span>TEST</span><strong>PIXI</strong></div>
      </section>

      <section className="goalCard">
        <div className="star">★</div>
        <div>
          <span>PIXİ BOARD TEST</span>
          <strong>Obsidian tiles + bright rune sprites</strong>
          <div className="progress"><i /></div>
        </div>
      </section>

      <RuneRushPixiBoard />

      <section className="bottomBar">
        <motion.button whileTap={{ scale: 0.96 }}>Sound</motion.button>
        <motion.button whileTap={{ scale: 0.96 }}>Restart</motion.button>
        <motion.button whileTap={{ scale: 0.96 }}>Share</motion.button>
      </section>

      <style jsx global>{`
        html,
        body {
          margin: 0;
          min-height: 100%;
          background: #020706;
          color: #fff3c9;
          font-family: Arial, Helvetica, sans-serif;
          overflow-x: hidden;
        }

        * { box-sizing: border-box; }

        .testApp {
          width: min(100vw, 720px);
          min-height: 100dvh;
          margin: 0 auto;
          padding: max(10px, env(safe-area-inset-top)) 10px max(10px, env(safe-area-inset-bottom));
          background:
            radial-gradient(circle at 50% 0%, rgba(22, 122, 65, 0.25), transparent 42%),
            linear-gradient(180deg, #020706, #030906 50%, #010303);
        }

        .topHud {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-bottom: 10px;
        }

        .pill,
        .stat,
        .goalCard,
        .bottomBar button {
          background-image:
            linear-gradient(rgba(0, 0, 0, 0.18), rgba(0, 0, 0, 0.34)),
            url("/textures/obsidian.png"),
            url("/textures/stone.png");
          background-size: cover;
          background-position: center;
          border: 1px solid rgba(255, 240, 180, 0.16);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 10px 22px rgba(0,0,0,0.42);
        }

        .pill {
          height: 76px;
          border-radius: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
        }

        .pill span,
        .stat span,
        .goalCard span {
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.08em;
          color: rgba(255, 239, 188, 0.72);
        }

        .pill strong {
          font-size: 42px;
          line-height: 1;
          color: #fff3c9;
        }

        .lives span {
          font-size: 26px;
          color: #ff5c67;
        }

        .statsRow {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-bottom: 10px;
        }

        .stat {
          height: 64px;
          border-radius: 18px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .stat strong {
          font-size: 25px;
          line-height: 1;
        }

        .goalCard {
          min-height: 86px;
          border-radius: 24px;
          padding: 14px 16px;
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 10px;
        }

        .goalCard strong {
          display: block;
          margin-top: 4px;
          font-size: 17px;
          color: #fff;
        }

        .star {
          font-size: 40px;
          color: #ffc764;
        }

        .progress {
          width: 100%;
          height: 10px;
          margin-top: 10px;
          border-radius: 999px;
          background: rgba(0,0,0,0.45);
          overflow: hidden;
        }

        .progress i {
          display: block;
          width: 42%;
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #49ff72, #ceff6a);
        }

        .pixiBoardWrap {
          width: 100%;
        }

        .pixiBoardHost {
          width: 100%;
          aspect-ratio: 1;
          border-radius: 30px;
          overflow: hidden;
          border: 4px solid rgba(112, 72, 40, 0.9);
          background: #040604;
          box-shadow: 0 20px 50px rgba(0,0,0,0.65);
          touch-action: none;
        }

        .pixiBoardHost canvas {
          image-rendering: auto;
        }

        .pixiBoardHelp {
          margin: 8px 2px 10px;
          color: rgba(255,255,255,0.62);
          font-size: 12px;
          text-align: center;
        }

        .loadingBox {
          height: 360px;
          border-radius: 30px;
          display: grid;
          place-items: center;
          color: rgba(255,255,255,0.72);
          background: #050806;
        }

        .bottomBar {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-top: 8px;
        }

        .bottomBar button {
          border-radius: 20px;
          border: 1px solid rgba(255, 240, 180, 0.16);
          color: #fff3c9;
          height: 58px;
          font-size: 14px;
          font-weight: 900;
          letter-spacing: 0.04em;
        }
      `}</style>
    </main>
  );
}
