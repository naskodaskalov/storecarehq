// Phones only: the hero's sample report sits below the fold there, so the first screen tells the product in three
// notifications instead — caught, fixed, proven. Same incident as the sample report and the month replay.

const NOTES = [
  { tone: 'alert', app: 'StoreCare HQ · Alert', time: '06:02', title: 'Juniper & Ash: checkout test failed', body: 'Stuck at the shipping step on mobile. Second failed run, so we told you.' },
  { tone: 'ok', app: 'StoreCare HQ', time: '06:31', title: 'Checkout is working again', body: 'Down 29 minutes. You logged “rolled back the shipping app update”, 45 min.' },
  { tone: 'report', app: 'Report · 1 November', time: '07:00', title: 'October report is ready to send', body: '99.93% uptime, 1 incident handled, 4.8h of 10h used. Your logo, your client’s inbox.' },
] as const;

export function HeroStory() {
  return (
    <ol className="lp-story" aria-label="How a store problem shows up in StoreCare HQ">
      {NOTES.map((n, i) => (
        <li key={n.title} className={`lp-note lp-note-${n.tone}`} style={{ animationDelay: `${0.35 + i * 0.7}s` }}>
          <span className="lp-note-icon" aria-hidden="true">{n.tone === 'alert' ? '!' : n.tone === 'ok' ? '✓' : '↗'}</span>
          <span className="lp-note-text">
            <span className="lp-note-meta"><span>{n.app}</span><time>{n.time}</time></span>
            <strong>{n.title}</strong>
            <span>{n.body}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
