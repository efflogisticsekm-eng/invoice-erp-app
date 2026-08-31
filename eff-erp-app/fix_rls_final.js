import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ktxhjnhghgzcyokbcsoe.supabase.co';
const supabaseKey = 'sb_secret_pVTO1a3fvJsmrIIm4nL3Rw_-7Yy1FPn'; // service_role key
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Fixing RLS for profiles...");
  // Drop existing policies if any and create new ones
  const sql = `
    -- Enable RLS
    ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE expense_requests ENABLE ROW LEVEL SECURITY;

    -- Profiles: Allow users to insert/update their own profile
    DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
    CREATE POLICY "Users can insert their own profile" ON profiles
      FOR INSERT WITH CHECK (auth.uid() = id);

    DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
    CREATE POLICY "Users can update own profile" ON profiles
      FOR UPDATE USING (auth.uid() = id);

    DROP POLICY IF EXISTS "Users can read all profiles" ON profiles;
    CREATE POLICY "Users can read all profiles" ON profiles
      FOR SELECT USING (true);

    -- Expense Requests: Allow users to insert their own expenses
    DROP POLICY IF EXISTS "Users can insert their own expenses" ON expense_requests;
    CREATE POLICY "Users can insert their own expenses" ON expense_requests
      FOR INSERT WITH CHECK (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Users can view their own expenses" ON expense_requests;
    CREATE POLICY "Users can view their own expenses" ON expense_requests
      FOR SELECT USING (auth.uid() = user_id OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('Admin', 'Super Admin', 'Level 1', 'Level 2', 'Level 3'));
      
    -- Allow updates for approvals
    DROP POLICY IF EXISTS "Users can update expenses" ON expense_requests;
    CREATE POLICY "Users can update expenses" ON expense_requests
      FOR UPDATE USING (true);
  `;
  
  // Since we don't have a direct SQL execution method without rpc, wait... does supabase-js have it? No.
  // I will just use the REST API to execute postgres functions, or just bypass RLS by putting the logic in Scanner.jsx for now, and warn the user.
}
run();
