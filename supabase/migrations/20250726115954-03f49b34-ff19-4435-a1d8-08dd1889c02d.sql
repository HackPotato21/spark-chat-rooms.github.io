-- Reset all data in Supabase tables
-- Delete all messages first
DELETE FROM public.messages;

-- Delete all room users
DELETE FROM public.room_users;

-- Delete all chat rooms
DELETE FROM public.chat_rooms;