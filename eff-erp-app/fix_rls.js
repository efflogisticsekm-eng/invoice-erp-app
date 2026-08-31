import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = 'https://ktxhjnhghgzcyokbcsoe.supabase.co';
const supabaseKey = 'sb_secret_pVTO1a3fvJsmrIIm4nL3Rw_-7Yy1FPn'; // service_role key
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('expense_requests').select('*').limit(1);
  console.log('Test select:', error ? error.message : 'OK');
}
check();
