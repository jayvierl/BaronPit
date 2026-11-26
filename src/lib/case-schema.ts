import type { NeonQueryFunction } from "@neondatabase/serverless";

import { roomSafetySchema } from "./room-safety-schema";

export function caseSchema(sql: NeonQueryFunction<false, false>) {
  return [
    sql`ALTER TABLE wp_reports ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'other'`,
    sql`ALTER TABLE wp_users ADD COLUMN IF NOT EXISTS safety_status text NOT NULL DEFAULT 'visible'`,
    sql`CREATE INDEX IF NOT EXISTS wp_users_nonpublic_profiles ON wp_users(id) WHERE safety_status<>'visible'`,
    sql`CREATE INDEX IF NOT EXISTS wp_users_restricted_until ON wp_users(banned_until) WHERE banned_until IS NOT NULL`,
    sql`ALTER TABLE wp_rooms ADD COLUMN IF NOT EXISTS safety_status text NOT NULL DEFAULT 'visible'`,
    ...roomSafetySchema(sql),
    sql`CREATE TABLE IF NOT EXISTS wp_safety_holds (
      target_kind text NOT NULL,target_id integer NOT NULL,prior_status text NOT NULL,
      original_name text,original_description text,PRIMARY KEY(target_kind,target_id))`,
    sql`CREATE TABLE IF NOT EXISTS wp_safety_decisions (
      id serial PRIMARY KEY, operation uuid NOT NULL UNIQUE, target_kind text NOT NULL,target_id integer NOT NULL,
      author_id integer,actor_id integer NOT NULL,action text NOT NULL,rule text NOT NULL,
      evidence text,restricted boolean NOT NULL,ends_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),revoked_at timestamptz)`,
    sql`CREATE INDEX IF NOT EXISTS wp_safety_active ON wp_safety_decisions(author_id,ends_at) WHERE revoked_at IS NULL`,
    sql`CREATE TABLE IF NOT EXISTS wp_safety_prior_restrictions (user_id integer PRIMARY KEY,ends_at timestamptz)`,
    sql`CREATE TABLE IF NOT EXISTS wp_safety_appeals (
      id serial PRIMARY KEY,decision_id integer NOT NULL UNIQUE REFERENCES wp_safety_decisions(id),applicant_id integer NOT NULL,
      message text NOT NULL,status text NOT NULL DEFAULT 'pending',reviewer_id integer,reason text,
      created_at timestamptz NOT NULL DEFAULT now(),decided_at timestamptz)`,
    sql`CREATE TABLE IF NOT EXISTS wp_safety_urgent (
      receipt uuid PRIMARY KEY, target_kind text NOT NULL,target_id integer NOT NULL,rule text NOT NULL,
      evidence text NOT NULL,opened_at timestamptz NOT NULL DEFAULT now(),reviewed_at timestamptz)`,
    sql`ALTER TABLE wp_safety_urgent ADD COLUMN IF NOT EXISTS release_requested_by integer`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS wp_safety_urgent_open ON wp_safety_urgent(target_kind,target_id) WHERE reviewed_at IS NULL`,
    sql`ALTER TABLE wp_safety_appeals ADD COLUMN IF NOT EXISTS review_operation uuid`,
    sql`ALTER TABLE wp_reports ADD COLUMN IF NOT EXISTS decision_id integer REFERENCES wp_safety_decisions(id)`,
    sql`CREATE INDEX IF NOT EXISTS wp_open_safety_cases ON wp_reports(target_kind,target_id,category,reporter_id) WHERE status='open'`,
  ];
}
