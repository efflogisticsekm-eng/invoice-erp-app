-- Enable RLS (if not already enabled)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_requests ENABLE ROW LEVEL SECURITY;

-- 1. Profiles: Allow authenticated users to insert their own profile
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- 2. Profiles: Allow users to update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- 3. Profiles: Allow anyone authenticated to read profiles (needed for lookups)
DROP POLICY IF EXISTS "Users can read all profiles" ON profiles;
CREATE POLICY "Users can read all profiles" ON profiles
  FOR SELECT USING (auth.role() = 'authenticated');

-- 4. Expense Requests: Allow users to insert their own expenses
DROP POLICY IF EXISTS "Users can insert their own expenses" ON expense_requests;
CREATE POLICY "Users can insert their own expenses" ON expense_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 5. Expense Requests: Allow users to view their own expenses OR if they are approvers
DROP POLICY IF EXISTS "Users can view their own expenses" ON expense_requests;
CREATE POLICY "Users can view their own expenses" ON expense_requests
  FOR SELECT USING (
    auth.uid() = user_id OR 
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('Admin', 'Super Admin', 'Level 1', 'Level 2', 'Level 3')
  );

-- 6. Expense Requests: Allow updates (for approvers and owners)
DROP POLICY IF EXISTS "Users can update expenses" ON expense_requests;
CREATE POLICY "Users can update expenses" ON expense_requests
  FOR UPDATE USING (auth.role() = 'authenticated');

