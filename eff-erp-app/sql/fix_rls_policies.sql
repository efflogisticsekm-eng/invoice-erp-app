-- Run this SQL in your Supabase SQL Editor to fix Row Level Security (RLS) policies.
-- This will ensure that managers and approvers can view and approve requests properly.

-- 1. Fix Profiles table policies (Allow everyone to view profiles, so names show up instead of 'Unknown')
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read access to profiles" ON public.profiles;
CREATE POLICY "Allow public read access to profiles" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow users to update their own profile" ON public.profiles;
CREATE POLICY "Allow users to update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- 2. Fix Expense Requests table policies
-- (Allows authenticated users to view requests so VM, FM, RM, etc. can see pending requests they need to approve)
ALTER TABLE public.expense_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read to expense_requests" ON public.expense_requests;
CREATE POLICY "Allow authenticated read to expense_requests" ON public.expense_requests FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated insert to expense_requests" ON public.expense_requests;
CREATE POLICY "Allow authenticated insert to expense_requests" ON public.expense_requests FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated update to expense_requests" ON public.expense_requests;
CREATE POLICY "Allow authenticated update to expense_requests" ON public.expense_requests FOR UPDATE TO authenticated USING (true);
