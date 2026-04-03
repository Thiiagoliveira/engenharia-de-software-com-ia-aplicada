import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import env from './envirments.js';

export const SUPABASE_URL = env.base_url;
export const SUPABASE_ANON_KEY = env.key;
export const SUPABASE_SCHEMA = env.schema;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: SUPABASE_SCHEMA }
});
