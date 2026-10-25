/** Public privacy policy (also linked from the Play Store listing). */
export const PRIVACY_POLICY_URL = 'https://maheshmaddi.github.io/merge-rush/privacy-policy.html';

/** Minimal, unobtrusive instructions under the board, plus the privacy link. */
export function SwipeHint() {
  return (
    <footer className="footer">
      <p className="hint">
        Swipe the board or use ← ↑ ↓ → / WASD · merge equal tiles · chain 3 merges to rush · 1–4 fire powers
      </p>
      <a className="footer__link" href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer">
        Privacy policy
      </a>
    </footer>
  );
}
