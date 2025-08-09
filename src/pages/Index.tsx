import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Crown, Users, Send, Image, Video, X, Instagram, Moon, Sun, Search, Home, Globe, Key, User, Dice6, Sparkles, Zap } from 'lucide-react';
import { useTheme } from 'next-themes';

interface Message {
  id: string;
  user_name: string;
  message: string | null;
  media_url: string | null;
  media_type: string | null;
  created_at: string;
  room_id: string;
  
}


interface Room {
  id: string;
  room_name: string;
  session_id: string;
  room_type: 'public' | 'private';
  owner_name: string;
  user_count: number;
}

interface RoomUser {
  id: string;
  user_name: string;
  is_owner: boolean;
  last_activity: string;
}

const Index = () => {
  const { setTheme, theme } = useTheme();
  const [currentView, setCurrentView] = useState<'home' | 'chat' | 'publicRooms'>('home');
  const [sessionId, setSessionId] = useState('');
  const [userName, setUserName] = useState('');
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [roomUsers, setRoomUsers] = useState<RoomUser[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [publicRooms, setPublicRooms] = useState<Room[]>([]);
  const [filteredPublicRooms, setFilteredPublicRooms] = useState<Room[]>([]);
  const [roomType, setRoomType] = useState<'public' | 'private'>('public');
  const [roomName, setRoomName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showRoomTypeDialog, setShowRoomTypeDialog] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activityRef = useRef<number>();
  const visibilityRef = useRef<boolean>(true);
  const channelRef = useRef<any>(null);
  const publicRoomsChannelRef = useRef<any>(null);
  const tabCheckRef = useRef<number>();
  const roomUsersIntervalRef = useRef<NodeJS.Timeout>();

  // Tab close detection - reliable cleanup when tab closes
  useEffect(() => {
    if (isConnected && currentRoom && userName) {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        // Show confirmation dialog
        e.preventDefault();
        e.returnValue = 'Closing this tab will remove you from the chat room. Are you sure you want to leave?';
        
        // Use sendBeacon for reliable cleanup when tab is closing
        const blob = new Blob([JSON.stringify({
          p_room_id: currentRoom.id,
          p_user_name: userName
        })], { type: 'application/json' });
        
        navigator.sendBeacon(
          `https://evqwblpumuhemkixmsyw.supabase.co/rest/v1/rpc/cleanup_user_from_room_beacon`,
          blob
        );
        
        return 'Closing this tab will remove you from the chat room. Are you sure you want to leave?';
      };

      const handlePageHide = () => {
        // Also handle page hide event for mobile
        const blob = new Blob([JSON.stringify({
          p_room_id: currentRoom.id,
          p_user_name: userName
        })], { type: 'application/json' });
        
        navigator.sendBeacon(
          `https://evqwblpumuhemkixmsyw.supabase.co/rest/v1/rpc/cleanup_user_from_room_beacon`,
          blob
        );
      };

      // Add event listeners
      window.addEventListener('beforeunload', handleBeforeUnload);
      window.addEventListener('pagehide', handlePageHide);
      
      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
        window.removeEventListener('pagehide', handlePageHide);
      };
    }
  }, [isConnected, currentRoom, userName]);

  // Activity tracking (kick after 5 minutes of inactivity)
  const updateActivity = useCallback(async () => {
    if (currentRoom && userName && isConnected) {
      await supabase.rpc('cleanup_user_from_room', {
        p_room_id: currentRoom.id,
        p_user_name: userName
      });
      
      await supabase.from('room_users').upsert({
        room_id: currentRoom.id,
        user_name: userName,
        is_owner: currentRoom.owner_name === userName,
        last_activity: new Date().toISOString()
      });
    }
  }, [currentRoom, userName, isConnected]);

  // Track user activity for 5-minute timeout (but don't kick on tab switch)
  useEffect(() => {
    const resetActivity = () => {
      if (activityRef.current) clearTimeout(activityRef.current);
      updateActivity();
      
      activityRef.current = window.setTimeout(() => {
        if (currentRoom && userName) {
          leaveRoom();
          toast({
            title: "Disconnected",
            description: "You were disconnected due to inactivity."
          });
        }
      }, 5 * 60 * 1000); // 5 minutes
    };

    const handleActivity = () => {
      // Always reset activity on user interaction, regardless of tab visibility
      resetActivity();
    };

    if (isConnected) {
      document.addEventListener('mousedown', handleActivity);
      document.addEventListener('keydown', handleActivity);
      document.addEventListener('scroll', handleActivity);
      document.addEventListener('focus', handleActivity);
      resetActivity();
    }

    return () => {
      document.removeEventListener('mousedown', handleActivity);
      document.removeEventListener('keydown', handleActivity);
      document.removeEventListener('scroll', handleActivity);
      document.removeEventListener('focus', handleActivity);
      if (activityRef.current) clearTimeout(activityRef.current);
    };
  }, [isConnected, currentRoom, userName, updateActivity]);

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Generate random session ID
  const generateSessionId = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setSessionId(result);
  };


  // Load public rooms with real-time updates
  const loadPublicRooms = async () => {
    try {
      const { data: rooms, error } = await supabase
        .from('chat_rooms')
        .select('*')
        .eq('room_type', 'public');

      if (error) throw error;

      const roomsWithUserCount = await Promise.all(
        (rooms || []).map(async (room) => {
          const { data: count } = await supabase.rpc('get_active_room_user_count', {
            room_uuid: room.id
          });
          return { ...room, user_count: count || 0 };
        })
      );

      // Sort by user count (most members on top)
      const sortedRooms = roomsWithUserCount.sort((a, b) => b.user_count - a.user_count);
      setPublicRooms(sortedRooms);
    } catch (error) {
      console.error('Error loading public rooms:', error);
    }
  };

  // Filter public rooms based on search
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredPublicRooms(publicRooms);
    } else {
      const filtered = publicRooms.filter(room => 
        room.room_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        room.session_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        room.owner_name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredPublicRooms(filtered);
    }
  }, [searchQuery, publicRooms]);

  // Setup real-time subscription for public rooms
  useEffect(() => {
    if (currentView === 'publicRooms') {
      loadPublicRooms();
      
      // Real-time updates for public rooms
      const publicRoomsChannel = supabase
        .channel('public-rooms-updates')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'chat_rooms',
          filter: 'room_type=eq.public'
        }, () => {
          loadPublicRooms();
        })
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'room_users'
        }, () => {
          loadPublicRooms();
        })
        .subscribe();

      publicRoomsChannelRef.current = publicRoomsChannel;

      // Auto-refresh every 5 seconds
      const interval = setInterval(loadPublicRooms, 5000);

      return () => {
        clearInterval(interval);
        if (publicRoomsChannelRef.current) {
          supabase.removeChannel(publicRoomsChannelRef.current);
        }
      };
    }
  }, [currentView]);

  // Handle joining/creating room
  const handleJoinRoom = async (skipDialog = false) => {
    if (!sessionId || !userName) {
      toast({
        title: "Error",
        description: "Please enter both session ID and username.",
        variant: "destructive"
      });
      return;
    }

    try {
      // Check if room exists
      const { data: existingRoom, error: roomError } = await supabase
        .from('chat_rooms')
        .select('*')
        .eq('session_id', sessionId)
        .single();

      if (roomError && roomError.code !== 'PGRST116') {
        throw roomError;
      }

      let room = existingRoom;

      // Clean up any existing instances of this user in this room first
      let wasAlreadyInRoom = false;
      if (room) {
        // Check if user was already in room
        const { data: existingUser } = await supabase
          .from('room_users')
          .select('user_name')
          .eq('room_id', room.id)
          .eq('user_name', userName)
          .maybeSingle();
        
        wasAlreadyInRoom = !!existingUser;

        await supabase.rpc('cleanup_user_from_room', {
          p_room_id: room.id,
          p_user_name: userName
        });

        // Double check - remove any lingering records directly
        await supabase
          .from('room_users')
          .delete()
          .eq('room_id', room.id)
          .eq('user_name', userName);
      }

      // If room doesn't exist and we haven't shown the dialog, show it
      if (!room && !skipDialog) {
        setShowRoomTypeDialog(true);
        return;
      }

      // Create room if it doesn't exist
      if (!room) {
        const { data: newRoom, error: createError } = await supabase
          .from('chat_rooms')
          .insert({
            room_name: roomName || `Room-${sessionId}`,
            session_id: sessionId,
            room_type: roomType,
            owner_name: userName
          })
          .select()
          .single();

        if (createError) throw createError;
        room = newRoom;

        // Add system message for room creation
        await supabase.from('messages').insert({
          room_id: room.id,
          user_name: 'System',
          message: `${userName} created the room`
        });
      } else if (!wasAlreadyInRoom) {
        // Only add join message if user wasn't already in the room
        await supabase.from('messages').insert({
          room_id: room.id,
          user_name: 'System',
          message: `${userName} joined the room`
        });
      }

      // Add user to room
      await supabase.from('room_users').insert({
        room_id: room.id,
        user_name: userName,
        is_owner: room.owner_name === userName
      });

      setCurrentRoom({ ...room, user_count: 1 });
      setIsConnected(true);
      setCurrentView('chat');
      setShowRoomTypeDialog(false);
      
      // Load initial data
      loadMessages(room.id);
      loadRoomUsers(room.id);
      setupRealtimeSubscription(room.id);
      setupRoomUsersInterval(room.id);

      toast({
        title: "Connected",
        description: `Joined room ${sessionId} successfully!`
      });
    } catch (error) {
      console.error('Error joining room:', error);
      toast({
        title: "Error",
        description: "Failed to join room. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Load messages
  const loadMessages = async (roomId: string) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  // Load room users
  const loadRoomUsers = async (roomId: string) => {
    try {
      const { data, error } = await supabase
        .from('room_users')
        .select('*')
        .eq('room_id', roomId)
        .order('joined_at', { ascending: true });

      if (error) throw error;
      setRoomUsers(data || []);
    } catch (error) {
      console.error('Error loading room users:', error);
    }
  };

  // Setup realtime subscription
  const setupRealtimeSubscription = (roomId: string) => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`room-${roomId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `room_id=eq.${roomId}`
      }, (payload) => {
        setMessages(prev => [...prev, payload.new as Message]);
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'room_users',
        filter: `room_id=eq.${roomId}`
      }, () => {
        loadRoomUsers(roomId);
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'room_users',
        filter: `room_id=eq.${roomId}`
      }, () => {
        loadRoomUsers(roomId);
      })
      .subscribe();

    channelRef.current = channel;
  };

  // Setup room users refresh interval
  const setupRoomUsersInterval = (roomId: string) => {
    // Clear existing interval
    if (roomUsersIntervalRef.current) {
      clearInterval(roomUsersIntervalRef.current);
    }

    // Update room users every 0.1 second (100ms)
    const interval = setInterval(() => {
      loadRoomUsers(roomId);
    }, 100);

    roomUsersIntervalRef.current = interval;
  };

  // Send message
  const sendMessage = async () => {
    if ((!newMessage.trim() && !selectedFile) || !currentRoom || !userName) return;

    try {
      let mediaUrl = null;
      let mediaType = null;

      // Handle file upload
      if (selectedFile) {
        if (selectedFile.size > 5 * 1024 * 1024) {
          toast({
            title: "Error",
            description: "File size must be under 5MB.",
            variant: "destructive"
          });
          return;
        }

        setIsUploading(true);
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const filePath = `${currentRoom.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('chat-media')
          .upload(filePath, selectedFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('chat-media')
          .getPublicUrl(filePath);

        mediaUrl = publicUrl;
        mediaType = selectedFile.type.startsWith('image/') ? 'image' : 'video';
        setSelectedFile(null);
        setIsUploading(false);
      }

      const { error } = await supabase.from('messages').insert({
        room_id: currentRoom.id,
        user_name: userName,
        message: newMessage.trim() || null,
        media_url: mediaUrl,
        media_type: mediaType
      });

      if (error) throw error;

      setNewMessage('');
      updateActivity();
    } catch (error) {
      console.error('Error sending message:', error);
      setIsUploading(false);
      toast({
        title: "Error",
        description: "Failed to send message.",
        variant: "destructive"
      });
    }
  };

  // Leave room
  const leaveRoom = async () => {
    if (!currentRoom || !userName) return;

    try {
      // Add leave message FIRST
      const { error: messageError } = await supabase.from('messages').insert({
        room_id: currentRoom.id,
        user_name: 'System',
        message: `${userName} left the room`
      });

      if (messageError) {
        console.error('Error sending leave message:', messageError);
      }

      // Wait a bit longer to ensure message is visible and real-time updates have processed
      await new Promise(resolve => setTimeout(resolve, 500));

      // Remove user from room with cleanup function
      const { error: cleanupError } = await supabase.rpc('cleanup_user_from_room', {
        p_room_id: currentRoom.id,
        p_user_name: userName
      });

      if (cleanupError) {
        console.error('Error in cleanup function:', cleanupError);
      }

      // Double check - remove any lingering records directly
      await supabase
        .from('room_users')
        .delete()
        .eq('room_id', currentRoom.id)
        .eq('user_name', userName);

      // Wait another moment to ensure room user list updates
      await new Promise(resolve => setTimeout(resolve, 200));

      // Reset all state and cleanup subscriptions
      resetAppState();
    } catch (error) {
      console.error('Error leaving room:', error);
      // Even if there's an error, reset the state
      resetAppState();
    }
  };

  // Reset all app state
  const resetAppState = () => {
    // Cleanup realtime subscriptions
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (publicRoomsChannelRef.current) {
      supabase.removeChannel(publicRoomsChannelRef.current);
      publicRoomsChannelRef.current = null;
    }
    
    // Clear all timers
    if (tabCheckRef.current) {
      clearInterval(tabCheckRef.current);
    }
    if (activityRef.current) {
      clearTimeout(activityRef.current);
    }
    if (roomUsersIntervalRef.current) {
      clearInterval(roomUsersIntervalRef.current);
      roomUsersIntervalRef.current = undefined;
    }

    // Reset all state
    setCurrentRoom(null);
    setIsConnected(false);
    setMessages([]);
    setRoomUsers([]);
    setNewMessage('');
    setSelectedFile(null);
    setSessionId('');
    setUserName('');
    setCurrentView('home');
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "Error",
          description: "File size must be under 5MB.",
          variant: "destructive"
        });
        return;
      }
      
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        toast({
          title: "Error",
          description: "Only images and videos are allowed.",
          variant: "destructive"
        });
        return;
      }
      
      setSelectedFile(file);
    }
  };

  // Format timestamp
  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Join room from public rooms list
  const joinPublicRoom = (room: Room) => {
    setSessionId(room.session_id);
    setCurrentView('home');
  };

  // Render chat view
  if (currentView === 'chat' && currentRoom) {
    return (
      <div className="h-screen flex flex-col bg-background">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-card slide-enter">
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={leaveRoom} className="animated-button hover-glow">
              ← Leave
            </Button>
            <div className="fade-enter">
              <h1 className="font-semibold">{currentRoom.room_name}</h1>
              <p className="text-sm text-muted-foreground">Session: {currentRoom.session_id}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={currentRoom.room_type === 'public' ? 'default' : 'secondary'} className="bounce-enter">
              {currentRoom.room_type}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                // Add liquid animation to body
                document.body.classList.add('theme-transitioning');
                setTimeout(() => document.body.classList.remove('theme-transitioning'), 800);
                setTheme(theme === 'dark' ? 'light' : 'dark');
              }}
              className="animated-button hover-glow theme-transition theme-ripple-effect"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Messages */}
          <div className="flex-1 flex flex-col">
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.user_name === 'System'
                      ? 'justify-center'
                      : message.user_name === userName
                      ? 'justify-end'
                      : 'justify-start'
                  }`}
                >
                  <div
                    className={`message-bubble ${
                      message.user_name === 'System'
                        ? 'message-bubble-system'
                        : message.user_name === userName
                        ? 'message-bubble-own'
                        : 'message-bubble-other'
                    }`}
                  >
                    {message.user_name !== 'System' && message.user_name !== userName && (
                      <div className="flex items-center gap-1 mb-1">
                        <span className="text-xs font-medium">{message.user_name}</span>
                        {currentRoom.owner_name === message.user_name && (
                          <Crown className="w-3 h-3 text-yellow-500" />
                        )}
                      </div>
                    )}
                    
                    {message.media_url && (
                      <div className="mb-2">
                        {message.media_type === 'image' ? (
                          <img
                            src={message.media_url}
                            alt="Shared image"
                            className="max-w-full h-auto rounded-lg"
                            style={{ maxHeight: '300px' }}
                          />
                        ) : (
                          <video
                            src={message.media_url}
                            controls
                            className="max-w-full h-auto rounded-lg"
                            style={{ maxHeight: '300px' }}
                          />
                        )}
                      </div>
                    )}
                    
                    {message.message && <div>{message.message}</div>}
                    
                    <div className="text-xs opacity-70">
                      {formatTime(message.created_at)}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Message input */}
            <div className="p-4 border-t bg-card">
              {selectedFile && (
                <div className="flex items-center gap-2 mb-2 p-2 bg-muted rounded-lg">
                  <span className="text-sm">{selectedFile.name}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedFile(null)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}
              
              <div className="flex gap-2">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  disabled={isUploading}
                />
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="animated-button hover-glow"
                >
                  <Image className="w-4 h-4" />
                </Button>
                
                <Button onClick={sendMessage} disabled={isUploading} className="animated-button hover-glow">
                  {isUploading ? '...' : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>

          {/* Users sidebar */}
          <div className="w-64 border-l bg-card p-4 slide-enter">
            <div className="flex items-center gap-2 mb-4 fade-enter">
              <Users className="w-4 h-4" />
              <h3 className="font-semibold">Users ({roomUsers.length})</h3>
            </div>
            
            <div className="space-y-2">
              {roomUsers.map((user, index) => (
                <div 
                  key={user.id} 
                  className="flex items-center gap-2 p-2 rounded-lg bg-muted hover-scale transition-all duration-200"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="online-indicator" />
                  <span className="flex-1">{user.user_name}</span>
                  {user.is_owner && <Crown className="w-4 h-4 text-yellow-500 animate-float" />}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Made by footer */}
        <div className="fixed bottom-4 right-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.open('https://www.instagram.com/with._.hacker/', '_blank')}
            className="flex items-center gap-1 text-xs"
          >
            <Instagram className="w-3 h-3" />
            Made By @with._.hacker
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative">
      <div className="relative z-10 p-6">
        <div className="max-w-6xl mx-auto">
          {/* Hero Header */}
          <div className="text-center mb-12 fade-enter">
            <div className="flex items-center justify-center gap-6 mb-6">
              <div className="relative">
                <h1 className="text-6xl font-bold text-foreground bounce-enter">
                  Ignite Chat
                </h1>
              </div>
              <Button
                variant="ghost"
                size="lg"
                onClick={() => {
                  document.body.classList.add('theme-transitioning');
                  setTimeout(() => document.body.classList.remove('theme-transitioning'), 800);
                  setTheme(theme === 'dark' ? 'light' : 'dark');
                }}
                className="w-14 h-14 rounded-full shadow-[inset_6px_6px_12px_#d1d9e6,inset_-6px_-6px_12px_#ffffff] dark:shadow-[inset_6px_6px_12px_#0f1419,inset_-6px_-6px_12px_#2a2a2a] hover:shadow-[inset_8px_8px_16px_#d1d9e6,inset_-8px_-8px_16px_#ffffff] dark:hover:shadow-[inset_8px_8px_16px_#0f1419,inset_-8px_-8px_16px_#2a2a2a] transition-all duration-300 bg-background border-0 flex items-center justify-center"
              >
                {theme === 'dark' ? 
                  <Sun className="w-6 h-6 transition-transform duration-500 hover:rotate-180" /> : 
                  <Moon className="w-6 h-6 transition-transform duration-500 hover:rotate-180" />
                }
              </Button>
            </div>
            <p className="text-xl text-muted-foreground slide-enter max-w-2xl mx-auto leading-relaxed">
              Experience next-generation real-time messaging with beautiful neumorphic design
            </p>
          </div>

          <Tabs value={currentView} onValueChange={(v) => setCurrentView(v as any)} className="w-full slide-enter">
            <TabsList className="grid w-full grid-cols-2 bg-transparent rounded-2xl p-3 mb-8 border-0 gap-4">
              <TabsTrigger 
                value="home" 
                className="rounded-2xl transition-all duration-300 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-lg data-[state=inactive]:bg-card data-[state=inactive]:text-muted-foreground data-[state=inactive]:border data-[state=inactive]:border-border hover:text-foreground hover:scale-105 active:scale-95 font-medium py-4 px-6 flex items-center justify-center gap-3 text-sm min-h-[60px]"
              >
                <Home className="w-5 h-5" />
                Home
              </TabsTrigger>
              <TabsTrigger 
                value="publicRooms" 
                className="rounded-2xl transition-all duration-300 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-lg data-[state=inactive]:bg-card data-[state=inactive]:text-muted-foreground data-[state=inactive]:border data-[state=inactive]:border-border hover:text-foreground hover:scale-105 active:scale-95 font-medium py-4 px-6 flex items-center justify-center gap-3 text-sm min-h-[60px]"
              >
                <Globe className="w-5 h-5" />
                Public Rooms
              </TabsTrigger>
            </TabsList>

            <TabsContent value="home" className="space-y-8">
              <Card className="bg-background border border-border rounded-2xl transition-all duration-500 hover:scale-[1.01]">
                <CardHeader className="text-center pb-6 pt-8">
                  <CardTitle className="text-3xl font-bold text-primary mb-2 flex items-center justify-center gap-3">
                    <Sparkles className="w-8 h-8 text-primary animate-pulse" />
                    Join or Create Room
                  </CardTitle>
                  <p className="text-muted-foreground">Start your journey into seamless communication</p>
                </CardHeader>
                <CardContent className="space-y-6 px-8 pb-8">
                  <div className="space-y-6">
                    <div className="flex gap-4">
                      <div className="relative flex-1">
                        <Key className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground z-10" />
                        <Input
                          value={sessionId}
                          onChange={(e) => setSessionId(e.target.value.toUpperCase())}
                          placeholder="Enter session ID"
                          maxLength={8}
                          className="pl-12 bg-background shadow-[inset_6px_6px_12px_#d1d9e6,inset_-6px_-6px_12px_#ffffff] dark:shadow-[inset_6px_6px_12px_#0f1419,inset_-6px_-6px_12px_#2a2a2a] border-0 rounded-xl text-lg py-6 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:shadow-[inset_8px_8px_16px_#d1d9e6,inset_-8px_-8px_16px_#ffffff] dark:focus-visible:shadow-[inset_8px_8px_16px_#0f1419,inset_-8px_-8px_16px_#2a2a2a]"
                        />
                      </div>
                      <Button 
                        onClick={generateSessionId} 
                        className="px-6 py-6 bg-background shadow-[inset_6px_6px_12px_#d1d9e6,inset_-6px_-6px_12px_#ffffff] dark:shadow-[inset_6px_6px_12px_#0f1419,inset_-6px_-6px_12px_#2a2a2a] hover:shadow-[inset_8px_8px_16px_#d1d9e6,inset_-8px_-8px_16px_#ffffff] dark:hover:shadow-[inset_8px_8px_16px_#0f1419,inset_-8px_-8px_16px_#2a2a2a] border-0 rounded-xl text-primary hover:text-primary transition-all duration-300 active:scale-95 flex items-center justify-center gap-2"
                      >
                        <Dice6 className="w-5 h-5" />
                        Generate
                      </Button>
                    </div>
                    
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground z-10" />
                      <Input
                        value={userName}
                        onChange={(e) => setUserName(e.target.value)}
                        placeholder="Enter your username"
                        className="pl-12 bg-background shadow-[inset_6px_6px_12px_#d1d9e6,inset_-6px_-6px_12px_#ffffff] dark:shadow-[inset_6px_6px_12px_#0f1419,inset_-6px_-6px_12px_#2a2a2a] border-0 rounded-xl text-lg py-6 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:shadow-[inset_8px_8px_16px_#d1d9e6,inset_-8px_-8px_16px_#ffffff] dark:focus-visible:shadow-[inset_8px_8px_16px_#0f1419,inset_-8px_-8px_16px_#2a2a2a]"
                      />
                    </div>

                    <Button 
                      onClick={() => handleJoinRoom()} 
                      className="w-full py-6 text-lg rounded-xl font-semibold transition-all duration-300 active:scale-95 flex items-center justify-center gap-3" 
                      disabled={!sessionId || !userName}
                    >
                      <Zap className="w-5 h-5" />
                      Join / Create Room
                    </Button>
                  </div>
                  
                  <div className="text-center">
                    <p className="text-muted-foreground/60 text-sm leading-relaxed max-w-md mx-auto flex items-center justify-center gap-2">
                      <Sparkles className="w-4 h-4 text-primary/60" />
                      Enter an existing room ID to join instantly, or create a brand new room if it doesn't exist
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="publicRooms" className="space-y-12 pt-4">
              <div className="text-center fade-enter">
                <h2 className="text-4xl font-bold text-primary mb-6 flex items-center justify-center gap-4">
                  <Globe className="w-10 h-10 text-primary animate-pulse" />
                  Discover Public Rooms
                </h2>
                <p className="text-muted-foreground mb-8">Join vibrant communities and start chatting instantly</p>
              </div>

              <div className="relative slide-enter mb-8">
                <Search className="absolute left-6 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground z-10" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search rooms by name, owner, or session ID..."
                  className="pl-14 py-6 text-lg bg-background shadow-[inset_6px_6px_12px_#d1d9e6,inset_-6px_-6px_12px_#ffffff] dark:shadow-[inset_6px_6px_12px_#0f1419,inset_-6px_-6px_12px_#2a2a2a] border-0 rounded-xl focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:shadow-[inset_8px_8px_16px_#d1d9e6,inset_-8px_-8px_16px_#ffffff] dark:focus-visible:shadow-[inset_8px_8px_16px_#0f1419,inset_-8px_-8px_16px_#2a2a2a]"
                />
              </div>

              <div className="grid gap-6">
                {filteredPublicRooms.length === 0 ? (
                  <Card className="bg-background border border-border rounded-2xl">
                    <CardContent className="text-center py-12">
                      <Search className="w-16 h-16 text-muted-foreground/40 mx-auto mb-4" />
                      <p className="text-xl text-muted-foreground mb-2">
                        {searchQuery ? 'No rooms match your search' : 'No active public rooms found'}
                      </p>
                      <p className="text-sm text-muted-foreground/60">
                        {searchQuery ? 'Try adjusting your search terms' : 'Be the first to create a public room!'}
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  filteredPublicRooms.map((room, index) => (
                    <Card 
                      key={room.id} 
                      className="cursor-pointer bg-background border border-border hover:border-primary/50 rounded-2xl transition-all duration-500 group hover:scale-[1.01] active:scale-95" 
                      onClick={() => joinPublicRoom(room)}
                      style={{ animationDelay: `${index * 0.1}s` }}
                    >
                      <CardContent className="p-6">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-4">
                                <div className="w-4 h-4 bg-green-500 rounded-full animate-pulse"></div>
                                <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors duration-300">
                                  {room.room_name}
                                </h3>
                              </div>
                              <div className="space-y-3">
                                <p className="text-sm text-muted-foreground flex items-center gap-2">
                                  <Crown className="w-4 h-4 text-yellow-500" />
                                  <span>Owner: <span className="font-medium">{room.owner_name}</span></span>
                                </p>
                                <p className="text-sm text-muted-foreground flex items-center gap-2">
                                  <Key className="w-4 h-4 text-primary/60" />
                                  Session: 
                                  <span className="font-mono bg-background px-3 py-1 rounded-lg shadow-[inset_3px_3px_6px_#d1d9e6,inset_-3px_-3px_6px_#ffffff] dark:shadow-[inset_3px_3px_6px_#0f1419,inset_-3px_-3px_6px_#2a2a2a] text-sm">
                                    {room.session_id}
                                  </span>
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-4">
                              <Badge 
                                className="bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold rounded-full flex items-center gap-2"
                              >
                                <Users className="w-4 h-4" />
                                {room.user_count} {room.user_count === 1 ? 'user' : 'users'}
                              </Badge>
                              <Button 
                                size="sm" 
                                variant="outline"
                                className="opacity-0 group-hover:opacity-100 transition-all duration-300 active:scale-95 flex items-center justify-center gap-2 px-4 py-2"
                              >
                                Join Now
                                <Zap className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>

          {/* Room Type Dialog */}
        <Dialog open={showRoomTypeDialog} onOpenChange={setShowRoomTypeDialog}>
          <DialogContent className="slide-enter">
            <DialogHeader className="fade-enter">
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Create New Room
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground fade-enter">
                Session ID "{sessionId}" doesn't exist. Let's create a new room:
              </p>
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="roomName" className="text-sm font-medium flex items-center gap-2 mb-2">
                    <Home className="w-4 h-4" />
                    Room Name (optional)
                  </Label>
                  <Input
                    id="roomName"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder={`Room-${sessionId}`}
                    className="border border-border rounded-lg shadow-[inset_6px_6px_12px_#d1d9e6,inset_-6px_-6px_12px_#ffffff] dark:shadow-[inset_6px_6px_12px_#0f1419,inset_-6px_-6px_12px_#2a2a2a] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:shadow-[inset_8px_8px_16px_#d1d9e6,inset_-8px_-8px_16px_#ffffff] dark:focus-visible:shadow-[inset_8px_8px_16px_#0f1419,inset_-8px_-8px_16px_#2a2a2a]"
                  />
                </div>
                
                <div>
                  <Label className="text-sm font-medium flex items-center gap-2 mb-3">
                    <Globe className="w-4 h-4" />
                    Room Type
                  </Label>
                  <RadioGroup value={roomType} onValueChange={(v) => setRoomType(v as any)} className="space-y-3">
                    <div className="flex items-center space-x-3 p-3 rounded-lg shadow-[inset_3px_3px_6px_#d1d9e6,inset_-3px_-3px_6px_#ffffff] dark:shadow-[inset_3px_3px_6px_#0f1419,inset_-3px_-3px_6px_#2a2a2a] border-0 hover:shadow-[inset_4px_4px_8px_#d1d9e6,inset_-4px_-4px_8px_#ffffff] dark:hover:shadow-[inset_4px_4px_8px_#0f1419,inset_-4px_-4px_8px_#2a2a2a] transition-all cursor-pointer">
                      <RadioGroupItem value="public" id="public" />
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-green-500" />
                        <Label htmlFor="public" className="cursor-pointer">Public - Visible to everyone</Label>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3 p-3 rounded-lg shadow-[inset_3px_3px_6px_#d1d9e6,inset_-3px_-3px_6px_#ffffff] dark:shadow-[inset_3px_3px_6px_#0f1419,inset_-3px_-3px_6px_#2a2a2a] border-0 hover:shadow-[inset_4px_4px_8px_#d1d9e6,inset_-4px_-4px_8px_#ffffff] dark:hover:shadow-[inset_4px_4px_8px_#0f1419,inset_-4px_-4px_8px_#2a2a2a] transition-all cursor-pointer">
                      <RadioGroupItem value="private" id="private" />
                      <div className="flex items-center gap-2">
                        <Key className="w-4 h-4 text-blue-500" />
                        <Label htmlFor="private" className="cursor-pointer">Private - Only accessible with session ID</Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>
              </div>
              
              <Button onClick={() => handleJoinRoom(true)} className="w-full py-3 flex items-center justify-center gap-2">
                <Zap className="w-4 h-4" />
                Create Room
              </Button>
            </div>
          </DialogContent>
        </Dialog>

          {/* Made by footer */}
          <div className="fixed bottom-4 right-4 z-20">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open('https://www.instagram.com/with._.hacker/', '_blank')}
              className="flex items-center justify-center gap-2 text-xs transition-all duration-300 active:scale-95 px-3 py-2"
            >
              <Instagram className="w-4 h-4" />
              Made By @with._.hacker
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;