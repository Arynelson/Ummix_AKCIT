import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('campaign content migrations', () => {
  it('acomoda IDs UUID das opções e usa timestamp real para ordenar mensagens', async () => {
    const migration = await readFile(
      new URL('../../migrations/003_campaign_content_runtime_fixes_up.sql', import.meta.url),
      'utf8',
    );

    expect(migration).toMatch(/ALTER COLUMN selected_option_id TYPE VARCHAR\(80\)/iu);
    expect(migration).toMatch(/ALTER COLUMN created_at SET DEFAULT clock_timestamp\(\)/iu);
  });
});
