import { useBookSlot, useCancelBooking, useDriveSlots } from '../../hooks/useBooking.js';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function DriveSlots({ driveId }: { driveId: string }) {
  const { data, isLoading, isError, error } = useDriveSlots(driveId, true);
  const book = useBookSlot();
  const cancel = useCancelBooking();
  const items = data?.items ?? [];

  if (isLoading) return <div className="meta" style={{ padding: '8px 0' }}>Loading slots…</div>;
  if (isError) {
    return (
      <div className="meta" style={{ color: 'var(--danger)', padding: '8px 0' }}>
        {error instanceof Error ? error.message : 'Failed to load slots'}
      </div>
    );
  }
  if (items.length === 0) return <div className="meta" style={{ padding: '8px 0' }}>No slots scheduled yet.</div>;

  return (
    <div className="drive-list" style={{ marginTop: 10 }}>
      {items.map((s) => {
        const full = !s.mine && s.booked >= s.capacity;
        return (
          <div key={s.id} className="card drive">
            <div className="info">
              <b>{fmtDate(s.date)}</b>
              <div className="meta">
                <span>{s.start}–{s.end}</span>
                <span>{s.booked}/{s.capacity} booked</span>
              </div>
            </div>
            {s.mine && <span className="tag selected">Booked</span>}
            {s.mine && (
              <button type="button" className="btn" disabled={cancel.isPending} onClick={() => cancel.mutate(s.id)}>
                Cancel
              </button>
            )}
            {!s.mine && !full && (
              <button type="button" className="btn" disabled={book.isPending} onClick={() => book.mutate(s.id)}>
                Book
              </button>
            )}
            {!s.mine && full && <span className="tag closed">Full</span>}
          </div>
        );
      })}
    </div>
  );
}
