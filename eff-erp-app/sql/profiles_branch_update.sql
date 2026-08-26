-- Run this SQL in your Supabase SQL Editor to map profiles with branch strictly.

-- 1. Add branch column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS branch TEXT;

-- 2. Update existing BM profiles to default to 'EDATHALA' (you can change this later for other BMs)
UPDATE public.profiles SET branch = 'EDATHALA' WHERE role = 'BM' AND branch IS NULL;
