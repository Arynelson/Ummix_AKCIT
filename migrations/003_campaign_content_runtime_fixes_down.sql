BEGIN;

ALTER TABLE campaign_content.messages
  ALTER COLUMN created_at SET DEFAULT NOW();

ALTER TABLE campaign_content.contents
  ALTER COLUMN selected_option_id TYPE VARCHAR(32);

COMMIT;
