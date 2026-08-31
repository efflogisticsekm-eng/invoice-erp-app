import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ktxhjnhghgzcyokbcsoe.supabase.co';
const supabaseKey = 'sb_publishable_5CrNpGooLCzL8aNPO-iaPA_8YlxZFMX'; // ANON key
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  // Try to login as a test user
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'effedathala',
    password: '@eff2019'
  });
  
  if (authErr) {
    console.log("Login error:", authErr.message);
    return;
  }
  
  console.log("Logged in as:", authData.user.id);
  
  // Try to insert a dummy expense
  const { data, error } = await supabase.from('expense_requests').insert({
    user_id: authData.user.id,
    category: 'Test',
    amount: 1,
    status: 'Pending',
    current_level: 'Level 1'
  }).select();
  
  if (error) {
    console.log("Insert error:", error.message);
  } else {
    console.log("Insert successful:", data);
    
    // Clean up
    await supabase.from('expense_requests').delete().eq('id', data[0].id);
  }
}
test();
