import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import type { GameState, LastMoveInfo, PowerId, Tile } from '../game/types';
import { BOARD_SIZE } from '../game/constants';
import { canUsePower } from '../game/powers';
import { FloatingScores } from './FloatingScores';
import { BoardFx } from './BoardFx';

interface BoardProps {
  game: GameState;
  boardRef: RefObject<HTMLDivElement>;
  /** Armed targeted power; tiles become pickable while set. */
  targeting?: PowerId | null;
  onTileClick?: (cell: number) => void;
  /** Lite render mode: skip the decorative FX layer on low-end devices. */
  lite?: boolean;
}

/** Shake the board for a bomb blast or a big merge. */
function shakeLevel(lastMove: LastMoveInfo): '' | 'board--shake' | 'board--shake-big' {
  if (lastMove.power?.id === 'bomb') return 'board--shake-big';
  const best = lastMove.mergeCells.reduce((max, cell) => Math.max(max, cell.value), 0);
  if (best >= 512) return 'board--shake-big';
  if (best >= 128) return 'board--shake';
  return '';
}

/** How long merge/spawn/ghost visuals stay applied before classes clear. */
const EFFECT_MS = 320;

function positionStyle(row: number, col: number): CSSProperties {
  return { '--row': row, '--col': col } as CSSProperties;
}

function tileTierClass(value: number): string {
  if (value >= 8192) return 'tile--v8192';
  if (value >= 4096) return 'tile--v4096';
  return `tile--v${value}`;
}

interface TileViewProps {
  tile: Tile;
  className: string;
  onClick?: () => void;
}

function TileView({ tile, className, onClick }: TileViewProps) {
  return (
    <div
      data-testid="tile"
      className={`tile ${tileTierClass(tile.value)} ${className}`}
      style={positionStyle(tile.row, tile.col)}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      aria-label={onClick ? `Target tile ${tile.value}` : undefined}
      data-value={tile.value}
      data-digits={String(tile.value).length}
      data-pos={`${tile.row},${tile.col}`}
    >
      {tile.value}
    </div>
  );
}

/**
 * The 4x4 board. Tiles keep stable ids across moves, so React reuses DOM
 * nodes and the CSS transform transition animates slides. Merge "ghosts"
 * (absorbed tiles) render briefly under the arriving survivor, then fade.
 */
export function Board({ game, boardRef, targeting = null, onTileClick, lite = false }: BoardProps) {
  const [ghosts, setGhosts] = useState<Tile[]>([]);
  const [shake, setShake] = useState('');
  const [ghostKind, setGhostKind] = useState<'merge' | 'blast'>('merge');
  const [mergedIds, setMergedIds] = useState<number[]>([]);
  const [spawnId, setSpawnId] = useState<number | null>(null);
  const lastMoveRef = useRef(game.lastMove);

  useEffect(() => {
    const lastMove = game.lastMove;
    if (lastMove === null || lastMove === lastMoveRef.current) return;
    lastMoveRef.current = lastMove;
    setGhosts(lastMove.ghosts);
    setGhostKind(lastMove.power !== null ? 'blast' : 'merge');
    setShake(shakeLevel(lastMove));
    setMergedIds(lastMove.mergedTileIds);
    setSpawnId(lastMove.spawnedTileId);
    const timer = window.setTimeout(() => {
      setGhosts([]);
      setMergedIds([]);
      setSpawnId(null);
    }, EFFECT_MS);
    const shakeTimer = window.setTimeout(() => setShake(''), 420);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(shakeTimer);
    };
  }, [game.lastMove]);

  const boardClass = [
    'board',
    game.rush.active ? 'board--rush' : '',
    targeting !== null ? `board--targeting board--targeting-${targeting}` : '',
    shake,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={boardClass}
      ref={boardRef}
      role="application"
      aria-label="Merge Rush board. Swipe or use arrow keys to move the tiles."
    >
      <span className="board__rim" aria-hidden="true">
        <span className="board__rim-rotor" />
      </span>
      <div className="board__cells" aria-hidden="true">
        {Array.from({ length: 16 }, (_, i) => (
          <div key={i} className="cell" />
        ))}
      </div>
      <div className="board__tiles">
        {ghosts.map((ghost) => (
          <div
            key={`ghost-${ghost.id}`}
            className={`tile tile--ghost${ghostKind === 'blast' ? ' tile--blasted' : ''} ${tileTierClass(ghost.value)}`}
            style={positionStyle(ghost.row, ghost.col)}
            aria-hidden="true"
          >
            {ghost.value}
          </div>
        ))}
        {game.tiles.map((tile) => {
          const cell = tile.row * BOARD_SIZE + tile.col;
          const pickable =
            targeting !== null && onTileClick !== undefined && canUsePower(game, targeting, cell);
          return (
            <TileView
              key={tile.id}
              tile={tile}
              onClick={pickable ? () => onTileClick(cell) : undefined}
              className={[
                mergedIds.includes(tile.id) ? 'tile--merged' : '',
                tile.id === spawnId ? 'tile--spawn' : '',
                pickable ? 'tile--pickable' : '',
                game.lastMove?.power?.id === 'shuffle' ? 'tile--shuffled' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            />
          );
        })}
      </div>
      <BoardFx lastMove={game.lastMove} lite={lite} />
      <FloatingScores lastMove={game.lastMove} />
    </div>
  );
}
