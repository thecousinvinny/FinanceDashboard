-- Add cal_event_id to subscriptions so the next-renewal Google Calendar
-- event ID can be stored alongside each subscription.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS cal_event_id text;
