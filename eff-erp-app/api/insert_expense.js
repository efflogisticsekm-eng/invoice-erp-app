import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const data = req.body;
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
    );

    const profileData = {
      id: data.user_id,
      full_name: data.user_email || 'User',
      role: data.user_role || 'User',
      branch: data.user_branch || null
    };
    await supabase.from('profiles').upsert(profileData, { onConflict: 'id', ignoreDuplicates: true });

    data.branch = data.user_branch || null;
    delete data.user_email;
    delete data.user_role;
    delete data.user_branch;

    const { error } = await supabase.from('expense_requests').insert(data);
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
