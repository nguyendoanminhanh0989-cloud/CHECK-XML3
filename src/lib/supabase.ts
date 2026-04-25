import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vqoycqhunrcyrhjjhcbk.supabase.co';
const supabaseKey = 'sb_publishable_xmIJosniG6w4zHE6iJVNww_vae_5Pw7';

export const supabase = createClient(supabaseUrl, supabaseKey);
