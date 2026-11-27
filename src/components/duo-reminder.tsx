export function DuoReminder({ id }: { id: number }) {
  return <details>
    <summary>Remind me before we play</summary>
    <p className="meta">Add this session to your calendar for a reminder 10 minutes before you play. If you add it later, the reminder is at the start. Remove the event from your calendar if the booking changes.</p>
    <a className="text-btn" href={`/api/lfg/reminder?id=${id}`} download="duo-session.ics">Add calendar reminder</a>
  </details>;
}
