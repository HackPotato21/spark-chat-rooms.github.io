-- Reset all data in Supabase tables
-- Delete all messages first
DELETE FROM public.messages;

-- Delete all room users
DELETE FROM public.room_users;

-- Delete all chat rooms
DELETE FROM public.chat_rooms;

-- Delete from G table (appears to be a test table)
DELETE FROM public.G;

-- Reset sequences if any (to start IDs from 1 again)
-- Note: UUID fields don't use sequences, but if there were any bigint sequences, we'd reset them here