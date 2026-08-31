import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ktxhjnhghgzcyokbcsoe.supabase.co';
const supabaseKey = 'sb_publishable_5CrNpGooLCzL8aNPO-iaPA_8YlxZFMX'; // ANON key
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'test@example.com',
    password: 'password'
  });
  console.log("Login error:", error);
  // wait wait I don't have a user
}
check();
