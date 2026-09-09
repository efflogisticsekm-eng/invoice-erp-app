import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://ktxhjnhghgzcyokbcsoe.supabase.co';
const supabaseKey = 'sb_secret_pVTO1a3fvJsmrIIm4nL3Rw_-7Yy1FPn';
const supabase = createClient(supabaseUrl, supabaseKey);
async function run() {
  const { data, error } = await supabase.from('expense_requests').select('*').order('created_at', { ascending: false }).limit(2);
  console.log(error ? error : JSON.stringify(data, null, 2));
}
run();
