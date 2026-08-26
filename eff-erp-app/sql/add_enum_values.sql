-- Run this SQL in your Supabase SQL Editor.
-- This will add 'Clarification' to the expense_status enum and 'Approved' to the user_role enum
-- to prevent database constraint errors and enable the clarification flow.

ALTER TYPE public.expense_status ADD VALUE IF NOT EXISTS 'Clarification';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'Approved';
