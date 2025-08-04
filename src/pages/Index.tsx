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
import { Crown, Users, Send, Image, Video, X, Instagram, Moon, Sun, Search } from 'lucide-react';
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
            room_name: `Room-${sessionId}`,
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
                    
                    <div className="text-xs opacity-70 mt-1">
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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl animate-float"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-accent/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }}></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse-glow"></div>
      </div>

      <div className="relative z-10 p-6">
        <div className="max-w-6xl mx-auto">
          {/* Hero Header */}
          <div className="text-center mb-12 fade-enter">
            <div className="flex items-center justify-center gap-6 mb-6">
              <div className="relative">
                <h1 className="text-6xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent bounce-enter animate-pulse-glow">
                  Ignite Chat
                </h1>
                <div className="absolute -inset-4 bg-primary/20 rounded-2xl blur-xl opacity-30 animate-pulse-glow"></div>
              </div>
              <Button
                variant="ghost"
                size="lg"
                onClick={() => {
                  document.body.classList.add('theme-transitioning');
                  setTimeout(() => document.body.classList.remove('theme-transitioning'), 800);
                  setTheme(theme === 'dark' ? 'light' : 'dark');
                }}
                className="relative overflow-hidden group bg-card/50 backdrop-blur-sm border border-primary/20 hover:border-primary/40 transition-all duration-500 hover:scale-110 hover:rotate-12"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-accent/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                {theme === 'dark' ? 
                  <Sun className="w-6 h-6 relative z-10 transition-transform duration-500 group-hover:rotate-180" /> : 
                  <Moon className="w-6 h-6 relative z-10 transition-transform duration-500 group-hover:rotate-180" />
                }
              </Button>
            </div>
            <p className="text-xl text-muted-foreground/80 slide-enter max-w-2xl mx-auto leading-relaxed">
              Experience next-generation real-time messaging with beautiful animations and seamless collaboration
            </p>
          </div>

          <Tabs value={currentView} onValueChange={(v) => setCurrentView(v as any)} className="w-full slide-enter">
            <TabsList className="grid w-full grid-cols-2 bg-card/50 backdrop-blur-sm border border-primary/20 rounded-2xl p-2 mb-8">
              <TabsTrigger 
                value="home" 
                className="relative overflow-hidden rounded-xl transition-all duration-300 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/25"
              >
                <span className="relative z-10">🏠 Home</span>
              </TabsTrigger>
              <TabsTrigger 
                value="publicRooms" 
                className="relative overflow-hidden rounded-xl transition-all duration-300 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/25"
              >
                <span className="relative z-10">🌐 Public Rooms</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="home" className="space-y-8">
              <Card className="relative overflow-hidden bg-card/60 backdrop-blur-xl border-2 border-primary/20 shadow-2xl shadow-primary/10 transition-all duration-500 hover:border-primary/40 hover:shadow-3xl hover:shadow-primary/20 hover:scale-[1.02]">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none"></div>
                <CardHeader className="relative z-10 text-center pb-6">
                  <CardTitle className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent mb-2">
                    ✨ Join or Create Room
                  </CardTitle>
                  <p className="text-muted-foreground/70">Start your journey into seamless communication</p>
                </CardHeader>
                <CardContent className="relative z-10 space-y-6 px-8 pb-8">
                  <div className="space-y-4">
                    <div className="relative group">
                      <div className="flex gap-3">
                        <Input
                          value={sessionId}
                          onChange={(e) => setSessionId(e.target.value.toUpperCase())}
                          placeholder="🔑 Enter session ID or room code"
                          maxLength={8}
                          className="bg-background/60 backdrop-blur-sm border-2 border-primary/20 focus:border-primary/50 transition-all duration-300 text-lg py-6 rounded-xl shadow-lg hover:shadow-xl group-hover:scale-[1.01]"
                        />
                        <Button 
                          onClick={generateSessionId} 
                          className="px-6 py-6 bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 rounded-xl"
                        >
                          🎲 Generate
                        </Button>
                      </div>
                      <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-accent/20 rounded-xl blur opacity-0 group-hover:opacity-30 transition-opacity duration-300 -z-10"></div>
                    </div>
                    
                    <div className="relative group">
                      <Input
                        value={userName}
                        onChange={(e) => setUserName(e.target.value)}
                        placeholder="👤 Enter your username"
                        className="bg-background/60 backdrop-blur-sm border-2 border-primary/20 focus:border-primary/50 transition-all duration-300 text-lg py-6 rounded-xl shadow-lg hover:shadow-xl group-hover:scale-[1.01]"
                      />
                      <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-accent/20 rounded-xl blur opacity-0 group-hover:opacity-30 transition-opacity duration-300 -z-10"></div>
                    </div>

                    <Button 
                      onClick={() => handleJoinRoom()} 
                      className="w-full py-6 text-lg bg-gradient-to-r from-primary via-accent to-primary hover:from-primary/90 hover:via-accent/90 hover:to-primary/90 shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-[1.02] rounded-xl font-semibold relative overflow-hidden group" 
                      disabled={!sessionId || !userName}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                      <span className="relative z-10">🚀 Join / Create Room</span>
                    </Button>
                  </div>
                  
                  <div className="text-center">
                    <p className="text-muted-foreground/60 text-sm leading-relaxed max-w-md mx-auto">
                      💡 Enter an existing room ID to join instantly, or create a brand new room if it doesn't exist
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="publicRooms" className="space-y-8">
              <div className="text-center fade-enter">
                <h2 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent mb-2">
                  🌐 Discover Public Rooms
                </h2>
                <p className="text-muted-foreground/70">Join vibrant communities and start chatting instantly</p>
              </div>

              <div className="relative slide-enter group">
                <Search className="absolute left-6 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground z-10" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="🔍 Search rooms by name, owner, or session ID..."
                  className="pl-14 py-6 text-lg bg-background/60 backdrop-blur-sm border-2 border-primary/20 focus:border-primary/50 transition-all duration-300 rounded-2xl shadow-lg hover:shadow-xl group-hover:scale-[1.01]"
                />
                <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-accent/20 rounded-2xl blur opacity-0 group-hover:opacity-30 transition-opacity duration-300 -z-10"></div>
              </div>

              <div className="grid gap-4">
                {filteredPublicRooms.length === 0 ? (
                  <Card className="relative overflow-hidden bg-card/60 backdrop-blur-xl border-2 border-primary/20 shadow-xl">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none"></div>
                    <CardContent className="relative z-10 text-center py-12">
                      <div className="text-6xl mb-4">🔍</div>
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
                      className="relative overflow-hidden cursor-pointer bg-card/60 backdrop-blur-xl border-2 border-primary/20 shadow-xl hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/20 transition-all duration-500 hover:scale-[1.02] group" 
                      onClick={() => joinPublicRoom(room)}
                      style={{ animationDelay: `${index * 0.1}s` }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none"></div>
                      <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-accent/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
                      
                      <CardContent className="relative z-10 p-6">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-3">
                              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                              <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors duration-300">
                                {room.room_name}
                              </h3>
                            </div>
                            <div className="space-y-2">
                              <p className="text-sm text-muted-foreground flex items-center gap-2">
                                <Crown className="w-4 h-4 text-yellow-500" />
                                <span>Owner: <span className="font-medium">{room.owner_name}</span></span>
                              </p>
                              <p className="text-sm text-muted-foreground flex items-center gap-2">
                                🔑 Session: <span className="font-mono bg-muted px-2 py-1 rounded">{room.session_id}</span>
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-3">
                            <Badge 
                              className="bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-lg px-3 py-1.5 text-sm font-semibold rounded-full"
                            >
                              <Users className="w-4 h-4 mr-2" />
                              {room.user_count} {room.user_count === 1 ? 'user' : 'users'}
                            </Badge>
                            <Button 
                              size="sm" 
                              className="bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 rounded-xl opacity-0 group-hover:opacity-100"
                            >
                              Join Now 🚀
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
              <DialogTitle>Room doesn't exist - Create new room</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground fade-enter">
                Session ID "{sessionId}" doesn't exist. Choose room type to create:
              </p>
              <RadioGroup value={roomType} onValueChange={(v) => setRoomType(v as any)} className="space-y-2">
                <div className="flex items-center space-x-2 fade-enter hover-scale transition-all duration-200">
                  <RadioGroupItem value="public" id="public" />
                  <Label htmlFor="public">Public - Visible to everyone</Label>
                </div>
                <div className="flex items-center space-x-2 fade-enter hover-scale transition-all duration-200">
                  <RadioGroupItem value="private" id="private" />
                  <Label htmlFor="private">Private - Only accessible with session ID</Label>
                </div>
              </RadioGroup>
              <Button onClick={() => handleJoinRoom(true)} className="w-full animated-button hover-glow">
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
              className="flex items-center gap-2 text-xs bg-card/50 backdrop-blur-sm border border-primary/20 hover:border-primary/40 transition-all duration-300 hover:scale-105"
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