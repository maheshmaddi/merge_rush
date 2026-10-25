/** Fixed decorative backdrop: drifting aurora blobs over a soft starfield. */
export function Backdrop({ rush }: { rush: boolean }) {
  return (
    <div className={rush ? 'backdrop backdrop--rush' : 'backdrop'} aria-hidden="true">
      <div className="backdrop__stars" />
      <div className="backdrop__blob backdrop__blob--a" />
      <div className="backdrop__blob backdrop__blob--b" />
      <div className="backdrop__blob backdrop__blob--c" />
      <div className="backdrop__grid" />
    </div>
  );
}
