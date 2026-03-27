"use client";

import React, { useMemo } from "react";

type Props = {
  show: boolean;
};

const COLORS = ["#ec4899", "#38bdf8", "#8b5cf6", "#f5f7fb", "#d946ef"];

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export default function AuctionWinConfetti({ show }: Props) {
  const pieces = useMemo(() => {
    if (!show) return [];

    return Array.from({ length: 260 }, (_, i) => {
      const color = COLORS[i % COLORS.length];
      const left = rand(-10, 110);
      const top = rand(-30, -6);

      const sizeW = rand(6, 14);
      const sizeH = rand(8, 20);

      const duration = rand(2.4, 4.8);
      const delay = -rand(0, duration * 0.95);

      const drift = rand(-34, 34);
      const spin = `${rand(700, 2200)}deg`;

      const borderRadius = Math.random() > 0.45 ? "999px" : "3px";

      return {
        id: i,
        style: {
          left: `${left}vw`,
          top: `${top}vh`,
          "--w": `${sizeW}px`,
          "--h": `${sizeH}px`,
          "--c": color,
          "--d": `${duration}s`,
          "--x-start": "0vw",
          "--x-end": `${drift}vw`,
          "--spin": spin,
          "--r": borderRadius,
          animationDelay: `${delay}s`,
        } as React.CSSProperties,
      };
    });
  }, [show]);

  if (!show) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((piece) => (
        <span key={piece.id} className="confetti-piece" style={piece.style} />
      ))}
    </div>
  );
}