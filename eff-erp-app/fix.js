import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://ktxhjnhghgzcyokbcsoe.supabase.co', 'sb_secret_pVTO1a3fvJsmrIIm4nL3Rw_-7Yy1FPn', {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function fix() {
  const { data: { users }, error } = await supabase.auth.admin.listUsers();
  if (error) { console.error("Auth error", error); return; }
  
  const user = users.find(u => u.email === 'efflogistics.ekm@gmail.com');
  if (user) {
    console.log("Found user", user.id);
    const { error: insertErr } = await supabase.from('profiles').upsert({
      id: user.id,
      email: user.email,
      full_name: 'Anwar',
      role: 'HR',
      permission: 'User/Approver'
    });
    if (insertErr) console.error("Insert error", insertErr);
    else console.log("Profile inserted!");
  } else {
    console.log("User not found");
  }
}
fix();
