import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { LastMoveInfo } from '../game/types';

interface BoardFxProps {
  lastMove: LastMoveInfo | null;
  /** Lite render mode: skip decorative particles on low-end devices. */
  lite?: boolean;
}

interface Particle {
  key: string;
  row: number;
  col: number;
  dx: number;
  dy: number;
  size: number;
  color: string;
  delay: number;
}

interface Burst {
  key: string;
  row: number;
  col: number;
  kind: 'merge' | 'bomb' | 'sweep';
  color: string;
}

const FX_MS = 900;

/** Glow colour per tile tier, matching the tile palette in board.css. */
export function tierColor(value: number): string {
  const palette: Record<number, string> = {
    2: '#9aa6ff',
    4: '#b39cff',
    8: '#9d6bff',
    16: '#b77bff',
    32: '#d16bff',
    64: '#ff5bd8',
    128: '#ff4f9a',
    256: '#ff6b6b',
    512: '#2fe0ff',
    1024: '#ffcf3d',
    2048: '#ffb020',
  };
  return palette[value] ?? '#e6fbff';
}

function spray(
  prefix: string,
  row: number,
  col: number,
  count: number,
  spread: number,
  colors: string[],
): Particle[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6;
    const distance = spread * (0.55 + Math.random() * 0.6);
    return {
      key: `${prefix}-${i}`,
      row,
      col,
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance,
      size: 0.06 + Math.random() * 0.07,
      color: colors[i % colors.length],
      delay: Math.random() * 60,
    };
  });
}

/**
 * Decorative particle bursts and shockwaves layered over the board: merge
 * sparks, bomb blasts, sweep flashes, shuffle swirl.
 */
export function BoardFx({ lastMove, lite = false }: BoardFxProps) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [swirl, setSwirl] = useState<string | null>(null);
  const lastRef = useRef<LastMoveInfo | null>(lastMove);

  useEffect(() => {
    if (lastMove === null || lastMove === lastRef.current) return;
    lastRef.current = lastMove;
    if (lite) {
      // Dozens of glowing particles re-rasterize mid-animation; low-end
      // devices skip them and rely on pops, banners, sound, and haptics.
      setParticles([]);
      setBursts([]);
      setSwirl(null);
      return;
    }
    const stamp = String(Date.now());
    const nextParticles: Particle[] = [];
    const nextBursts: Burst[] = [];

    if (lastMove.power === null) {
      lastMove.mergeCells.forEach((cell, i) => {
        const color = tierColor(cell.value);
        const big = cell.value >= 128;
        nextParticles.push(
          ...spray(`${stamp}-m${i}`, cell.row, cell.col, big ? 14 : 8, big ? 1.1 : 0.8, [color, '#ffffff']),
        );
        nextBursts.push({ key: `${stamp}-b${i}`, row: cell.row, col: cell.col, kind: 'merge', color });
      });
      setSwirl(null);
    } else {
      const { id, cells } = lastMove.power;
      cells.forEach((cell, i) => {
        if (id === 'bomb') {
          nextParticles.push(
            ...spray(`${stamp}-p${i}`, cell.row, cell.col, 22, 1.8, ['#ff6b5e', '#ffb347', '#fff2b0', tierColor(cell.value)]),
          );
        } else if (id === 'sweep') {
          nextParticles.push(...spray(`${stamp}-p${i}`, cell.row, cell.col, 8, 0.9, ['#d7c2ff', '#b388ff', '#ffffff']));
        }
        if (id !== 'shuffle') {
          nextBursts.push({
            key: `${stamp}-b${i}`,
            row: cell.row,
            col: cell.col,
            kind: id,
            color: id === 'bomb' ? '#ff6b5e' : '#b388ff',
          });
        }
      });
      setSwirl(id === 'shuffle' ? stamp : null);
    }

    setParticles(nextParticles);
    setBursts(nextBursts);
    const timer = window.setTimeout(() => {
      setParticles([]);
      setBursts([]);
      setSwirl(null);
    }, FX_MS);
    return () => window.clearTimeout(timer);
  }, [lastMove, lite]);

  if (particles.length === 0 && bursts.length === 0 && swirl === null) return null;

  return (
    <div className="fx" aria-hidden="true">
      {swirl !== null && <div key={swirl} className="fx__swirl" />}
      {bursts.map((burst) => (
        <span
          key={burst.key}
          className={`fx__burst fx__burst--${burst.kind}`}
          style={{ '--row': burst.row, '--col': burst.col, '--fx-color': burst.color } as CSSProperties}
        />
      ))}
      {particles.map((p) => (
        <span
          key={p.key}
          className="fx__particle"
          style={
            {
              '--row': p.row,
              '--col': p.col,
              '--dx': p.dx,
              '--dy': p.dy,
              '--size': p.size,
              '--fx-color': p.color,
              animationDelay: `${p.delay}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
