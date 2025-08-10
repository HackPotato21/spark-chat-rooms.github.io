-- First, let's see what we have and fix the major security vulnerability
-- The current RLS policies allow anyone to read everything with "true" conditions
-- This is a critical security flaw that exposes all private conversations

-- Drop the existing overly permissive policies
DROP POLICY IF EXISTS "Anyone can read messages" ON public.messages;
DROP POLICY IF EXISTS "Anyone can read private rooms by session_id" ON public.chat_rooms;
DROP POLICY IF EXISTS "Anyone can read room users" ON public.room_users;

-- Create a security definer function to check if a user belongs to a room
-- Since there's no auth system, we'll use user_name as identifier for now
-- This is still not ideal but better than completely public access
CREATE OR REPLACE FUNCTION public.user_has_room_access(room_uuid uuid, username text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.room_users 
    WHERE room_id = room_uuid 
    AND user_name = username
  );
$$;

-- Create more restrictive RLS policies for messages
-- Users can only read messages from rooms they belong to
CREATE POLICY "Users can read messages from their rooms"
ON public.messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.room_users ru 
    WHERE ru.room_id = messages.room_id 
    AND ru.user_name = current_setting('app.current_user_name', true)
  )
);

-- Update chat_rooms policies to be more restrictive
-- Users can only read rooms they belong to, or public rooms
CREATE POLICY "Users can read rooms they belong to"
ON public.chat_rooms
FOR SELECT
USING (
  room_type = 'public' OR
  EXISTS (
    SELECT 1 FROM public.room_users ru 
    WHERE ru.room_id = chat_rooms.id 
    AND ru.user_name = current_setting('app.current_user_name', true)
  )
);

-- Users can only see room users for rooms they belong to
CREATE POLICY "Users can see room users for their rooms"
ON public.room_users
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.room_users ru2 
    WHERE ru2.room_id = room_users.room_id 
    AND ru2.user_name = current_setting('app.current_user_name', true)
  )
);

-- Keep the insert/update/delete policies but make them slightly more restrictive
-- Users can only create messages in rooms they belong to
DROP POLICY IF EXISTS "Anyone can create messages" ON public.messages;
CREATE POLICY "Users can create messages in their rooms"
ON public.messages
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.room_users ru 
    WHERE ru.room_id = messages.room_id 
    AND ru.user_name = messages.user_name
    AND ru.user_name = current_setting('app.current_user_name', true)
  )
);

-- Update room creation policy to require user identification
DROP POLICY IF EXISTS "Anyone can create rooms" ON public.chat_rooms;
CREATE POLICY "Users can create rooms"
ON public.chat_rooms
FOR INSERT
WITH CHECK (
  owner_name = current_setting('app.current_user_name', true)
  AND owner_name IS NOT NULL 
  AND owner_name != ''
);

-- Update room joining policy
DROP POLICY IF EXISTS "Anyone can join rooms" ON public.room_users;
CREATE POLICY "Users can join rooms"
ON public.room_users
FOR INSERT
WITH CHECK (
  user_name = current_setting('app.current_user_name', true)
  AND user_name IS NOT NULL 
  AND user_name != ''
);

-- Allow users to leave rooms (but only their own entry)
DROP POLICY IF EXISTS "Users can leave rooms" ON public.room_users;
CREATE POLICY "Users can leave their own room entries"
ON public.room_users
FOR DELETE
USING (
  user_name = current_setting('app.current_user_name', true)
);

-- Room owners can update their rooms (but verify ownership)
DROP POLICY IF EXISTS "Room owners can update their rooms" ON public.chat_rooms;
CREATE POLICY "Room owners can update their own rooms"
ON public.chat_rooms
FOR UPDATE
USING (
  owner_name = current_setting('app.current_user_name', true)
);

-- Add a comment explaining the security improvement
COMMENT ON FUNCTION public.user_has_room_access IS 'Security function to check room membership - prevents unauthorized access to private room data';

-- Important: The application must now set the current user name using:
-- SET LOCAL app.current_user_name = 'username';
-- This should be done before any database operations