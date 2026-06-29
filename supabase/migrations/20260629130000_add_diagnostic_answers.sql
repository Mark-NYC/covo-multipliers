-- Add diagnostic_answers column to track CFC diagnostic responses
ALTER TABLE disciple_maker_sessions
ADD COLUMN diagnostic_answers jsonb;

-- Add index for efficient querying
CREATE INDEX idx_diagnostic_answers ON disciple_maker_sessions USING GIN (diagnostic_answers);
