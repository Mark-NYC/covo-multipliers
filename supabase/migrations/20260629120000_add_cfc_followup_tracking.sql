-- Add CFC follow-up email tracking to disciple_maker_sessions
--
-- Tracks when the day+1 CFC profile follow-up email is sent to allow
-- retry logic and prevent duplicate sends.

ALTER TABLE disciple_maker_sessions
ADD COLUMN cfc_followup_sent_at timestamp with time zone DEFAULT NULL;

-- Index for efficient querying of sessions eligible for follow-up
CREATE INDEX idx_disciple_maker_sessions_cfc_followup
  ON disciple_maker_sessions(status, cfc_followup_sent_at, completed_at)
  WHERE status = 'completed' AND cfc_followup_sent_at IS NULL;
