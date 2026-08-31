import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://ktxhjnhghgzcyokbcsoe.supabase.co', 'sb_secret_pVTO1a3fvJsmrIIm4nL3Rw_-7Yy1FPn');

async function run() {
  const { data, error } = await supabase.from('expense_requests').select('*, user_id(role)').order('created_at', { ascending: false }).limit(1);
  console.log(JSON.stringify(data, null, 2));
}
run();
