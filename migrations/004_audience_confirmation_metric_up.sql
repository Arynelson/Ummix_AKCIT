BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE campaign_assistant.metrics
  DROP CONSTRAINT IF EXISTS metrics_event_name_check;

ALTER TABLE campaign_assistant.metrics
  ADD CONSTRAINT metrics_event_name_check CHECK (event_name IN (
    'session_started',
    'message_sent',
    'proposal_ready',
    'draft_created',
    'review_reached',
    'audience_clarification_confirmed',
    'manual_fallback',
    'error'
  ));

COMMIT;
