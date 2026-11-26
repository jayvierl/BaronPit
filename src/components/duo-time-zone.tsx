"use client";

import { useId, useSyncExternalStore } from "react";
const subscribe = () => () => {};
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export function useBrowserTimeZone() {
  return useSyncExternalStore(subscribe, browserZone, () => "UTC");
}

export function DuoTimeZone({ value, onChange }: { value: string; onChange: (zone: string) => void }) {
  const id = useId();
  const browserZone = useBrowserTimeZone();
  return <label>Schedule time zone
    <input required list={id} value={value} onChange={e => onChange(e.target.value)} autoComplete="off" maxLength={80} />
    <datalist id={id}>
      {Array.from(new Set(["UTC", browserZone, "America/Los_Angeles", "America/Chicago", "America/New_York", "Europe/London", "Europe/Paris", "America/Sao_Paulo", "Asia/Seoul", "Asia/Tokyo", "Australia/Sydney"])).filter(Boolean)
        .map(zone => <option key={zone} value={zone} />)}
    </datalist>
  </label>;
}
