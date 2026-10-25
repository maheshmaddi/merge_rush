interface NextTilePreviewProps {
  value: 2 | 4;
}

/** Small preview showing the value of the tile that spawns after the next move. */
export function NextTilePreview({ value }: NextTilePreviewProps) {
  return (
    <div className="next" aria-label={`Next tile: ${value}`}>
      <span className="next__label">Next</span>
      <span className={value === 4 ? 'next__tile next__tile--4' : 'next__tile'}>{value}</span>
    </div>
  );
}
