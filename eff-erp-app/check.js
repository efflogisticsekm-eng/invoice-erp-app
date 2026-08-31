import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://ktxhjnhghgzcyokbcsoe.supabase.co', 'sb_secret_pVTO1a3fvJsmrIIm4nL3Rw_-7Yy1FPn');

async function check() {
  const { data, error } = await supabase.from('profiles').select('*');
  console.log("Profiles:", data, error);
}
check();
