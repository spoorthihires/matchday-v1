import { useMemo } from 'react';
import type { DriveInput } from '../../../types/drives.js';
import { fmtLabel, fmtMonth, isoDateOnly, upcomingDates } from './dateUtils.js';
import type { WizardStepProps } from './types.js';

// Ported from matchday-admin-app_23.html lines 2089-2106 (STEP 2: Schedule). The prototype's
// `.datechips` stored the human-readable label as the toggle key; here the same chips are
// generated (next ~6 dates matching `model.eventDay`) but the toggle key is the chip's ISO
// date string, since `model.eventDates` must be server-compatible (see dateUtils.ts).

const EVENT_DAYS: DriveInput['eventDay'][] = ['Wednesday', 'Saturday'];

export function StepSchedule({ model, onChange, errors }: WizardStepProps) {
  const datesErr = errors.length > 0 && model.eventDates.length === 0;
  // Regenerate candidate chips whenever the selected event day changes.
  const candidates = useMemo(() => upcomingDates(model.eventDay), [model.eventDay]);

  function toggleDate(iso: string) {
    const next = model.eventDates.includes(iso)
      ? model.eventDates.filter((d) => d !== iso)
      : [...model.eventDates, iso];
    onChange({ eventDates: next });
  }

  return (
    <section className="wstep active" data-panel="1">
      <div className="wh">
        <div className="eyebrow">Step 2</div>
        <h2>Schedule</h2>
        <p>MatchDays run on Wednesdays or Saturdays. Pick the cadence, event dates and capacity.</p>
      </div>
      <div className="wgrid">
        <div className="wfld">
          <label>Frequency</label>
          <select
            id="wFreq"
            value={model.frequency}
            onChange={(e) => onChange({ frequency: e.target.value as DriveInput['frequency'] })}
          >
            <option>Weekly</option>
            <option>Bi-weekly</option>
            <option>Monthly</option>
            <option>One-time</option>
          </select>
        </div>
        <div className="wfld">
          <label>Event day</label>
          <div className="pick" data-single="day">
            {EVENT_DAYS.map((v) => (
              <span
                key={v}
                className={`opt${model.eventDay === v ? ' on' : ''}`}
                data-v={v}
                // Changing the event day invalidates previously selected dates (they no longer
                // match the new weekday), so clear them — matching the prototype's
                // `model.dates=[];buildDateChips();` on day change.
                onClick={() => onChange({ eventDay: v, eventDates: [] })}
              >
                <i className="ti ti-calendar" /> {v}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className={`wfld full${datesErr ? ' err' : ''}`} id="w-dates">
        <label>
          Drive dates <span className="req">*</span>
        </label>
        <div className="desc">Select one or more upcoming event dates.</div>
        <div className="datechips" id="dateChips">
          {candidates.map((d) => {
            const iso = isoDateOnly(d);
            const on = model.eventDates.includes(iso);
            return (
              <div
                key={iso}
                className={`datechip${on ? ' on' : ''}`}
                data-date={iso}
                onClick={() => toggleDate(iso)}
              >
                <span className="cbx">
                  <i className="ti ti-check" />
                </span>
                <div className="dt">
                  <b>{fmtLabel(d)}</b>
                  <span>
                    {model.frequency} · {fmtMonth(d)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="emsg">
          <i className="ti ti-alert-circle" /> Select at least one drive date.
        </div>
      </div>
      <div className="wgrid">
        <div className="wfld">
          <label>Jobseeker capacity</label>
          <input
            type="number"
            id="wCand"
            min={0}
            value={model.candCap}
            onChange={(e) => onChange({ candCap: Number(e.target.value) || 0 })}
          />
        </div>
        <div className="wfld">
          <label>Employer capacity</label>
          <input
            type="number"
            id="wEmp"
            min={0}
            value={model.empCap}
            onChange={(e) => onChange({ empCap: Number(e.target.value) || 0 })}
          />
        </div>
      </div>
      <div className="wfld full">
        <label>Slot capacity</label>
        <input
          type="number"
          id="wSlot"
          min={0}
          value={model.slotCap}
          onChange={(e) => onChange({ slotCap: Number(e.target.value) || 0 })}
        />
        <div className="desc">Total interview slots across all employers for each event.</div>
      </div>
    </section>
  );
}
