-- Reset all data
TRUNCATE TABLE public.messages CASCADE;
TRUNCATE TABLE public.room_users CASCADE;
TRUNCATE TABLE public.chat_rooms CASCADE;

-- Improve the cleanup function to be more reliable
CREATE OR REPLACE FUNCTION public.cleanup_user_from_room(p_room_id uuid, p_user_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Delete the user from the room
  DELETE FROM public.room_users 
  WHERE room_id = p_room_id AND user_name = p_user_name;
  
  -- If no users left in a private room, delete the room
  IF NOT EXISTS (SELECT 1 FROM public.room_users WHERE room_id = p_room_id) THEN
    DELETE FROM public.chat_rooms 
    WHERE id = p_room_id AND room_type = 'private';
  END IF;
END;
$function$;