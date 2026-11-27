import { q } from "./db";

export async function consumeWindow(bucket: string, max: number, minutes: number): Promise<boolean> {
  const rows = await q`INSERT INTO wp_action_windows(bucket,hits,expires_at) VALUES (${bucket},ARRAY[now()],now()+make_interval(mins=>${minutes}))
    ON CONFLICT(bucket) DO UPDATE SET hits=ARRAY(SELECT t FROM unnest(wp_action_windows.hits) AS t
      WHERE t>now()-make_interval(mins=>${minutes}))||ARRAY[now()], expires_at=excluded.expires_at
    WHERE (SELECT count(*) FROM unnest(wp_action_windows.hits) AS t WHERE t>now()-make_interval(mins=>${minutes}))<${max}
    RETURNING bucket`;
  return rows.length > 0;
}
