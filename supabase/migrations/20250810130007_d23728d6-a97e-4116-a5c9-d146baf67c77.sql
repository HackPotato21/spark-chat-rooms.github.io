-- Fix the table G that has RLS enabled but no policies
-- This table appears to be unused, so we'll either add a policy or disable RLS

-- Check what's in table G first, then add a minimal policy
-- If it's truly unused, we could drop it, but let's be safe and add a restrictive policy
CREATE POLICY "No access to table G" 
ON public.G 
FOR ALL 
USING (false) 
WITH CHECK (false);

-- Remove the duplicate policy for public rooms since our main policy already covers it
DROP POLICY IF EXISTS "Anyone can read public rooms" ON public.chat_rooms;