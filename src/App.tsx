/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Plus, 
  Calendar as CalendarIcon, 
  Bell, 
  MessageSquare, 
  Monitor, 
  Settings, 
  ChevronRight, 
  CheckCircle2, 
  Clock,
  Send,
  Loader2,
  Trash2,
  MonitorOff,
  User as UserIcon,
  Bot,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Layout,
  Eye,
  Activity,
  History,
  X,
  PlusCircle,
  CalendarDays,
  AlarmClock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Reminder, ScheduleItem, ChatMessage, AppPreference, Alarm } from './types';
import { 
  chatWithAura, 
  getAuraVoice, 
  AIProvider, 
  APIKeys, 
  getStoredKeys, 
  saveStoredKeys 
} from './services/auraService';

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [isScreenActive, setIsScreenActive] = useState(false);
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [preferences, setPreferences] = useState<AppPreference>({
    theme: 'dark',
    automationLevel: 'suggest',
    voiceEnabled: false,
    preferredVoice: 'Kore',
    activeModule: 'sight',
    automation: {
      autoAddMeetings: false,
      autoAddReminders: true,
      autoTaskManagement: true,
      screenScanningFrequency: 30,
      preferredCategories: ['work', 'personal'],
      restrictedApps: ['Banking', 'Private Messenger']
    }
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<NotificationPermission | 'unsupported'>('default');
  
  // AI Provider State
  const [activeProvider, setActiveProvider] = useState<AIProvider>('gemini');
  const [apiKeys, setApiKeys] = useState<APIKeys>(getStoredKeys());

  const videoRef = useRef<HTMLVideoElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const notifiedItems = useRef<Set<string>>(new Set());

  // Initialize audio context for playback
  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.onplay = () => setIsSpeaking(true);
    audioRef.current.onended = () => setIsSpeaking(false);
    audioRef.current.onpause = () => setIsSpeaking(false);
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  // Alarm System Logic
  useEffect(() => {
    const checkAlarms = setInterval(() => {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const currentDay = now.getDay();

      alarms.forEach(alarm => {
        if (alarm.enabled && alarm.time === currentTime && alarm.days.includes(currentDay)) {
          // Trigger Alarm
          if (notificationStatus === 'granted') {
            new Notification("AURA ALARM", {
              body: alarm.label || "Time is up.",
              icon: "https://picsum.photos/seed/alarm/128/128"
            });
          }
          playVoice(`Your alarm for ${alarm.label || 'scheduled time'} is triggering now.`);
        }
      });
    }, 60000); // Check every minute

    return () => clearInterval(checkAlarms);
  }, [alarms, notificationStatus, preferences.voiceEnabled]);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
        // We delay slightly to ensure state is set before sending
        setTimeout(() => handleSend(transcript), 100);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech Recognition Error:", event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setIsListening(true);
      recognitionRef.current?.start();
    }
  };

  const playVoice = async (text: string) => {
    if (!preferences.voiceEnabled) return;
    const base64Audio = await getAuraVoice(text, preferences.preferredVoice);
    if (base64Audio && audioRef.current) {
      const binary = atob(base64Audio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      audioRef.current.src = url;
      audioRef.current.play();
    }
  };

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      setNotificationStatus('unsupported');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setNotificationStatus(permission);
      
      if (permission === 'granted') {
         new Notification("Aura Assistant", {
           body: "Neural Alerts are now active.",
           tag: 'aura-test'
         });
      }
    } catch (err) {
      console.error("Error requesting notification permission:", err);
    }
  };

  // Load from local storage
  useEffect(() => {
    try {
      const savedReminders = localStorage.getItem('aura_reminders');
      const savedSchedule = localStorage.getItem('aura_schedule');
      if (savedReminders) setReminders(JSON.parse(savedReminders));
      if (savedSchedule) setSchedule(JSON.parse(savedSchedule));
    } catch (err) {
      console.error("Failed to load persistence layer:", err);
      localStorage.removeItem('aura_reminders');
      localStorage.removeItem('aura_schedule');
    }
    
    // Load Provider
    const savedProvider = localStorage.getItem('aura_active_provider');
    if (savedProvider) setActiveProvider(savedProvider as AIProvider);

    // Initial message
    setMessages([{
      id: '1',
      role: 'assistant',
      content: "SYSTEM ONLINE. Aura Assistant ready. How can I help you today?",
      timestamp: Date.now()
    }]);

    // Check initial notification status
    if (!('Notification' in window)) {
      setNotificationStatus('unsupported');
    } else {
      setNotificationStatus(Notification.permission);
      if (Notification.permission === 'default') {
        requestNotificationPermission();
      }
    }
  }, []);

  // Notification Monitor Loop
  useEffect(() => {
    const checkSchedule = () => {
      const now = Date.now();
      const fiveMinutesFromNow = now + (5 * 60 * 1000);

      // Check Schedule Items
      schedule.forEach(item => {
        const itemTime = new Date(item.startTime).getTime();
        if (itemTime > now && itemTime <= fiveMinutesFromNow && !notifiedItems.current.has(item.id)) {
          sendNotification("Upcoming Meeting", item.title);
          notifiedItems.current.add(item.id);
        }
      });

      // Check Reminders
      reminders.forEach(reminder => {
        if (!reminder.completed && reminder.time) {
          const itemTime = new Date(reminder.time).getTime();
          if (itemTime > now && itemTime <= fiveMinutesFromNow && !notifiedItems.current.has(reminder.id)) {
            sendNotification("Task Reminder", reminder.text);
            notifiedItems.current.add(reminder.id);
          }
        }
      });
    };

    const sendNotification = (title: string, body: string) => {
      if (!('Notification' in window)) return;
      
      if (Notification.permission === 'granted') {
        try {
          new Notification(title, {
            body,
            icon: '/logo.png',
            tag: 'aura-alert'
          });
        } catch (err) {
          console.error("Failed to display notification:", err);
          // Potential fallback: add a system message to chat
          setMessages(prev => [...prev, {
            id: `system-alert-${Date.now()}`,
            role: 'assistant',
            content: `[ALERT] ${title}: ${body}`,
            timestamp: Date.now()
          }]);
        }
      } else if (Notification.permission === 'denied') {
        console.warn("Notifications denied by user.");
      }
    };

    const interval = setInterval(checkSchedule, 60000); // Check every minute
    checkSchedule(); // Immediate check

    return () => clearInterval(interval);
  }, [schedule, reminders]);

  // Sync to local storage
  useEffect(() => {
    localStorage.setItem('aura_reminders', JSON.stringify(reminders));
    localStorage.setItem('aura_schedule', JSON.stringify(schedule));
  }, [reminders, schedule]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsScreenActive(true);
      }
      
      stream.getVideoTracks()[0].onended = () => {
        setIsScreenActive(false);
      };
    } catch (err) {
      console.error("Screen share error:", err);
      alert("Screen sharing might be blocked.");
    }
  };

  const stopScreenShare = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      setIsScreenActive(false);
    }
  };

  const takeSnapshot = (): string | null => {
    if (!videoRef.current || !isScreenActive) return null;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(videoRef.current, 0, 0);
    return canvas.toDataURL('image/jpeg').split(',')[1];
  };

  const handleFunctionCall = useCallback((name: string, args: any) => {
    if (name === 'add_reminder') {
      const newReminder: Reminder = {
        id: Math.random().toString(36).substring(7),
        text: args.text,
        time: args.time,
        priority: args.priority || 'medium',
        completed: false
      };
      setReminders(prev => [newReminder, ...prev]);
    } else if (name === 'add_schedule_item') {
      const newItem: ScheduleItem = {
        id: Math.random().toString(36).substring(7),
        title: args.title,
        startTime: args.startTime,
        endTime: args.endTime,
        category: args.category || 'other'
      };
      setSchedule(prev => [newItem, ...prev].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()));
    }
  }, []);

  // Save Keys
  useEffect(() => {
    saveStoredKeys(apiKeys);
  }, [apiKeys]);

  // Save Provider
  useEffect(() => {
    localStorage.setItem('aura_active_provider', activeProvider);
  }, [activeProvider]);

  const handleSend = async (overrideInput?: string) => {
    const finalInput = overrideInput || input;
    if (!finalInput.trim() && !isScreenActive) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: finalInput,
      timestamp: Date.now(),
      image: isScreenActive ? takeSnapshot() || undefined : undefined
    };

    setMessages(prev => [...prev, userMessage]);
    if (!overrideInput) setInput('');
    setIsTyping(true);

    const history = messages.slice(-5).map(msg => ({
      role: msg.role,
      parts: [
        { text: msg.content },
        ...(msg.image ? [{ inlineData: { mimeType: 'image/jpeg', data: msg.image } }] : [])
      ]
    }));

    history.push({
      role: 'user',
      parts: [
        { text: finalInput },
        ...(userMessage.image ? [{ inlineData: { mimeType: 'image/jpeg', data: userMessage.image } }] : [])
      ]
    });

    const auraResponse = await chatWithAura(history, handleFunctionCall, activeProvider);

    setMessages(prev => [...prev, {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: auraResponse,
      timestamp: Date.now()
    }]);
    setIsTyping(false);

    if (preferences.voiceEnabled) {
      playVoice(auraResponse);
    }
  };

  const toggleReminder = (id: string) => {
    setReminders(prev => {
      const updated = prev.map(r => r.id === id ? { ...r, completed: !r.completed } : r);
      const isNowCompleted = updated.find(r => r.id === id)?.completed;
      if (isNowCompleted) {
        notifiedItems.current.delete(id);
      }
      return updated;
    });
  };

  const deleteReminder = (id: string) => {
    setReminders(prev => prev.filter(r => r.id !== id));
    notifiedItems.current.delete(id);
  };

  const deleteScheduleItem = (id: string) => {
    setSchedule(prev => prev.filter(s => s.id !== id));
    notifiedItems.current.delete(id);
  };

  const addAlarm = (time: string, label: string) => {
    const newAlarm: Alarm = {
      id: Math.random().toString(36).substring(7),
      time,
      label,
      enabled: true,
      days: [0, 1, 2, 3, 4, 5, 6]
    };
    setAlarms(prev => [...prev, newAlarm]);
  };

  const deleteAlarm = (id: string) => {
    setAlarms(prev => prev.filter(a => a.id !== id));
  };

  const toggleAlarm = (id: string) => {
    setAlarms(prev => prev.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a));
  };

  // Sub-Components
  const VoiceVisualizer = () => (
    <div className="flex items-center gap-1.5 h-12 bg-black/40 px-6 rounded-3xl border border-white/5 shadow-inner">
       {[...Array(12)].map((_, i) => (
        <motion.div
          key={i}
          animate={{ 
            height: isListening || isSpeaking ? [8, 30, 12, 24, 8] : 8,
            opacity: isListening || isSpeaking ? 1 : 0.3,
            backgroundColor: isListening ? '#f87171' : isSpeaking ? '#00f2ff' : '#ffffff'
          }}
          transition={{ 
            repeat: Infinity, 
            duration: 0.5 + Math.random() * 0.5,
            ease: "easeInOut",
            delay: i * 0.05
          }}
          className="w-1.5 rounded-full"
        />
      ))}
    </div>
  );

  const CalendarModule = () => {
    const today = new Date();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    
    const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
    const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
    
    const monthName = currentMonth.toLocaleString('default', { month: 'long' });
    
    return (
      <div className="p-10 h-full overflow-y-auto bg-black/20">
        <div className="flex items-center justify-between mb-6 px-4">
           <div className="text-[10px] font-bold tracking-[0.4em] text-accent uppercase">Chrono-Visualization Module</div>
           <div className="text-[10px] font-mono text-zinc-500">SYNC_BUFFER: OK // NODE: PRIMARY</div>
        </div>
        <div className="flex items-center justify-between mb-12">
          <div>
            <h2 className="text-4xl font-light tracking-tighter uppercase">{monthName}</h2>
            <div className="text-xs text-zinc-500 font-mono tracking-widest mt-1">LUNAR-CHRONO POSITION: {currentMonth.getFullYear()}</div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))}
              className="p-3 bg-white/5 border border-white/10 rounded-2xl hover:border-accent transition-all"
            >
              <ChevronRight className="w-5 h-5 rotate-180" />
            </button>
            <button 
              onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))}
              className="p-3 bg-white/5 border border-white/10 rounded-2xl hover:border-accent transition-all"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-4 mb-8">
          {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => (
            <div key={d} className="text-center text-[10px] font-bold text-zinc-500 tracking-widest">{d}</div>
          ))}
          {[...Array(firstDay)].map((_, i) => <div key={`empty-${i}`} />)}
          {[...Array(daysInMonth)].map((_, i) => {
            const day = i + 1;
            const isToday = today.getDate() === day && today.getMonth() === currentMonth.getMonth() && today.getFullYear() === currentMonth.getFullYear();
            const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const hasItems = schedule.some(item => item.startTime.startsWith(dateStr));
            return (
              <motion.button
                key={day}
                whileHover={{ scale: 1.05 }}
                className={`aspect-square rounded-3xl border flex flex-col items-center justify-center relative transition-all ${
                  isToday 
                  ? 'bg-accent border-accent text-black shadow-[0_0_20px_rgba(0,242,255,0.3)]' 
                  : 'bg-white/[0.03] border-white/5 hover:border-white/20'
                }`}
              >
                <div className="text-lg font-bold">{day}</div>
                {hasItems && <div className={`w-1 h-1 rounded-full mt-1 ${isToday ? 'bg-black' : 'bg-accent animate-pulse'}`} />}
              </motion.button>
            );
          })}
        </div>
      </div>
    );
  };

  const AlarmModule = () => {
    const [newAlarmTime, setNewAlarmTime] = useState('08:00');
    const [newAlarmLabel, setNewAlarmLabel] = useState('');

    return (
      <div className="p-10 h-full overflow-y-auto bg-black/20">
        <h2 className="text-4xl font-light tracking-tighter uppercase mb-2">NEURAL ALARMS</h2>
        <p className="text-sm text-zinc-400 mb-12">Set time-critical triggers for your bio-cycle.</p>

        <div className="bg-white/[0.03] border border-white/10 p-8 rounded-[32px] mb-12">
          <div className="flex gap-4 items-end mb-6">
            <div className="flex-1">
              <label className="block text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-2 ml-1">TRUNCATED TIME</label>
              <input 
                type="time" 
                value={newAlarmTime}
                onChange={(e) => setNewAlarmTime(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-2xl font-mono text-accent focus:border-accent outline-none"
              />
            </div>
            <div className="flex-[2]">
              <label className="block text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-2 ml-1">ALARM LABEL</label>
              <input 
                placeholder="Biological Restart..."
                value={newAlarmLabel}
                onChange={(e) => setNewAlarmLabel(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-lg focus:border-accent outline-none"
              />
            </div>
            <button 
              onClick={() => { addAlarm(newAlarmTime, newAlarmLabel); setNewAlarmLabel(''); }}
              className="p-5 bg-accent text-black rounded-2xl hover:scale-95 transition-all shadow-[0_0_20px_rgba(0,242,255,0.2)]"
            >
              <Plus className="w-6 h-6 font-bold" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {alarms.map(alarm => (
            <motion.div 
              layout
              key={alarm.id} 
              className={`p-8 rounded-[36px] border transition-all ${alarm.enabled ? 'bg-accent/5 border-accent/20' : 'bg-white/[0.02] border-white/5 opacity-50'}`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="text-4xl font-mono font-bold tracking-tighter">{alarm.time}</div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => toggleAlarm(alarm.id)}
                    className={`w-12 h-6 rounded-full relative transition-all ${alarm.enabled ? 'bg-accent' : 'bg-zinc-700'}`}
                  >
                    <motion.div 
                      animate={{ x: alarm.enabled ? 24 : 4 }}
                      className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm" 
                    />
                  </button>
                  <button onClick={() => deleteAlarm(alarm.id)} className="p-2 text-zinc-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="text-xs uppercase tracking-[0.2em] font-bold text-zinc-400">{alarm.label || 'Standard Alarm'}</div>
            </motion.div>
          ))}
          {alarms.length === 0 && (
            <div className="col-span-2 text-center py-20 opacity-20 border-2 border-dashed border-white/5 rounded-[40px]">
              <AlarmClock className="w-16 h-16 mx-auto mb-4" />
              <div className="text-xl font-light">NO ALARMS ACTIVE IN SECTOR</div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-[#050505] text-white font-sans overflow-hidden">
      {/* Left Navigation Rail */}
      <nav className="w-20 border-r border-white/10 bg-[#0A0A0A] flex flex-col items-center py-8 gap-8 z-30">
        <div className="text-accent font-bold text-xl tracking-tighter">A.</div>
        
        <div className="flex-1 flex flex-col gap-4">
          {[
            { id: 'sight', icon: Eye, label: 'SIGHT' },
            { id: 'timeline', icon: History, label: 'CHRONO' },
            { id: 'calendar', icon: CalendarDays, label: 'PLAN' },
            { id: 'alarms', icon: AlarmClock, label: 'BIO' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setPreferences(prev => ({ ...prev, activeModule: item.id as any }))}
              className={`p-4 rounded-2xl transition-all group relative ${
                preferences.activeModule === item.id 
                ? 'bg-accent/10 text-accent shadow-[0_0_15px_rgba(0,242,255,0.1)]' 
                : 'text-zinc-500 hover:text-white'
              }`}
              title={item.label}
            >
              <item.icon className="w-6 h-6" />
              {preferences.activeModule === item.id && (
                <motion.div 
                  layoutId="activeNav" 
                  className="absolute left-0 top-2 bottom-2 w-1 bg-accent rounded-r-full" 
                />
              )}
            </button>
          ))}
        </div>

        <button 
          onClick={() => setIsSettingsOpen(true)}
          className="p-4 text-zinc-500 hover:text-white transition-colors"
          aria-label="Open Settings"
        >
          <Settings className="w-6 h-6" />
        </button>
      </nav>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-20 bg-[#0A0A0A]/80 backdrop-blur-md border-b border-white/10 flex items-center justify-between px-10 z-20">
          <div className="flex flex-col">
            <div className="text-xl font-bold tracking-[0.2em]">
              AURA<span className="text-accent">.core</span>
            </div>
            <div className="text-[9px] text-zinc-500 tracking-[0.3em] font-bold uppercase mt-1">MODULE: {preferences.activeModule}</div>
          </div>
          
          <div className="flex items-center gap-8">
            <VoiceVisualizer />
            <div className="flex items-center gap-3 text-[12px] text-zinc-400 font-mono">
              <div className="w-2 h-2 rounded-full bg-accent shadow-[0_0_10px_#00f2ff] animate-pulse" />
              LINK ESTABLISHED
            </div>
          </div>
        </header>

        <main className="flex-1 flex overflow-hidden">
          {/* Main Content Area */}
          <div className="flex-1 relative bg-black/40 overflow-hidden">
            <AnimatePresence mode="wait">
              {preferences.activeModule === 'sight' && (
                <motion.div 
                  key="sight"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.02 }}
                  className="w-full h-full p-8"
                >
                  <div className="flex items-center justify-between mb-6 px-4">
                    <div>
                      <h2 className="text-sm font-bold tracking-[0.3em] uppercase">Visual Neural Feed</h2>
                      <p className="text-[10px] text-zinc-500 font-mono mt-1">STATUS: {isScreenActive ? 'LINK_ESTABLISHED' : 'LINK_INACTIVE'}</p>
                    </div>
                    <div className="flex items-center gap-4 bg-white/5 px-4 py-2 rounded-xl border border-white/10">
                       <Monitor className="w-3 h-3 text-accent" />
                       <span className="text-[10px] font-bold text-zinc-400">FPS: 30 // BUF: 128MB</span>
                    </div>
                  </div>
                  <div className="w-full h-[calc(100%-80px)] bg-[#111] rounded-[40px] border border-white/10 overflow-hidden relative shadow-2xl">
                    {isScreenActive ? (
                      <video ref={videoRef} autoPlay className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-6">
                        <div className="w-24 h-24 bg-accent/5 rounded-[40px] flex items-center justify-center border border-accent/20 rotate-12">
                          <Monitor className="w-10 h-10 text-accent/40" />
                        </div>
                        <div className="text-center">
                          <h3 className="text-2xl font-light mb-2">ACTIVE SIGHT BUFFER</h3>
                          <p className="text-zinc-500 text-sm mb-6">Authorize neural link to scan environmental data.</p>
                          <button 
                            onClick={startScreenShare} 
                            className="px-8 py-3 bg-accent/5 border border-accent/20 text-accent rounded-2xl text-xs font-bold tracking-[0.2em] hover:bg-accent/10 transition-all uppercase"
                          >
                            Establish Link
                          </button>
                        </div>
                      </div>
                    )}
                    {isScreenActive && (
                      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-4 px-6 py-3 bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl">
                        <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest text-red-500 uppercase">
                          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                          Live Stream Active
                        </div>
                        <div className="w-px h-4 bg-white/10" />
                        <button onClick={stopScreenShare} className="text-[10px] font-bold text-white/50 hover:text-white transition-colors">DISCONNECT</button>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {preferences.activeModule === 'timeline' && (
                <motion.div 
                  key="timeline"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="w-full h-full p-8 overflow-y-auto scrollbar-hide"
                >
                  <div className="max-w-4xl mx-auto">
                    <div className="flex items-start justify-between mb-16 px-4">
                      <div className="text-6xl font-light tracking-tighter uppercase leading-none">Day<br/>Overview</div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-accent">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</div>
                        <div className="text-[10px] text-zinc-500 tracking-[0.3em] uppercase font-bold mt-2">Neural Scan: {preferences.automation.autoTaskManagement ? 'AUTONOMOUS' : 'MANUAL'}</div>
                      </div>
                    </div>

                    <div className="relative pl-24 space-y-12">
                      <div className="absolute left-[39px] top-0 bottom-0 w-px bg-gradient-to-b from-accent/50 via-accent/5 to-transparent" />
                      
                      {[
                        ...schedule.map(s => ({ ...s, time: s.startTime, type: 'schedule' })),
                        ...reminders.map(r => ({ ...r, title: r.text, type: 'reminder', time: r.time || Date.now().toString() }))
                      ]
                      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
                      .map((item: any) => (
                        <div key={item.id} className="relative group">
                          <div className="absolute -left-[75px] top-1 text-[11px] font-mono text-zinc-500 bg-[#050505] px-2 py-1 rounded-md z-10 transition-colors group-hover:text-accent font-bold border border-white/5">
                            {new Date(item.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                          <div className={`absolute -left-[44px] top-2 w-3 h-3 rounded-full border-2 border-[#050505] ring-2 ring-accent/20 z-10 ${item.type === 'schedule' ? 'bg-accent shadow-[0_0_10px_rgba(0,242,255,0.5)]' : 'bg-white/10'}`} />
                          
                          <motion.div 
                            whileHover={{ scale: 1.01, x: 10 }}
                            className="bg-white/[0.03] border border-white/5 p-8 rounded-[40px] hover:border-accent/30 transition-all hover:bg-white/[0.05] shadow-sm"
                          >
                            <div className="flex items-start justify-between mb-3">
                               <div className="font-bold text-2xl tracking-tight leading-tight">{item.title}</div>
                               <div className={`text-[10px] px-3 py-1 rounded-full font-bold tracking-widest ${item.type === 'schedule' ? 'bg-accent/10 text-accent border border-accent/20' : 'bg-white/5 text-zinc-400 border border-white/10'}`}>
                                 {item.type.toUpperCase()}
                               </div>
                            </div>
                            <div className="text-sm text-zinc-500 leading-relaxed font-medium">
                              {item.type === 'schedule' 
                                ? `Protocol Duration: ${Math.round((new Date((item as any).endTime).getTime() - new Date((item as any).startTime).getTime()) / 60000)}m`
                                : `Bio-Priority: ${item.priority || 'standard'}`}
                            </div>
                          </motion.div>
                        </div>
                      ))}

                      {schedule.length === 0 && reminders.length === 0 && (
                        <div className="text-center py-32 opacity-20">
                          <Activity className="w-20 h-20 mx-auto mb-6 text-zinc-500 animate-pulse" />
                          <div className="text-2xl font-light tracking-[0.3em] uppercase">Sector Empty</div>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {preferences.activeModule === 'calendar' && <motion.div key="calendar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full"><CalendarModule /></motion.div>}
              {preferences.activeModule === 'alarms' && <motion.div key="alarms" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full"><AlarmModule /></motion.div>}
            </AnimatePresence>
          </div>

          {/* Right Contextual Rail */}
          <aside className="w-[320px] bg-[#0A0A0A] border-l border-white/10 p-8 flex flex-col gap-10 overflow-hidden">
             {/* Log Terminal */}
             <div className="flex-1 flex flex-col min-h-0 bg-black/40 border border-white/5 rounded-[32px] overflow-hidden">
                <div className="p-4 border-b border-white/5 flex items-center justify-between text-[10px] font-bold text-zinc-500 tracking-widest uppercase">
                  <span>Assistant Logs</span>
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  </div>
                </div>
                <div className="flex-1 p-5 overflow-y-auto scrollbar-hide font-mono text-[11px] text-[#00ff66]/80 leading-relaxed bg-[#050505]">
                  {messages.length === 0 ? (
                    <div className="animate-pulse">{">"} READY_FOR_COMMAND_</div>
                  ) : (
                    messages.map(m => (
                      <div key={m.id} className={`mb-3 ${m.role === 'assistant' ? 'text-[#00ff66]' : 'text-zinc-500 opacity-60'}`}>
                        <span className="opacity-40">{new Date(m.timestamp).toLocaleTimeString([], { hour12: false })}</span> [{m.role.toUpperCase()}] {m.content}
                      </div>
                    ))
                  )}
                  <div ref={chatEndRef} />
                </div>
             </div>

             {/* Dynamic Tasks/Context List */}
             <div className="h-1/3 flex flex-col gap-4">
               <div className="flex items-center justify-between">
                 <h3 className="text-[11px] uppercase tracking-[0.2em] text-zinc-400 font-bold">Bio-Tasks</h3>
                 <span className="text-[10px] px-2 py-0.5 bg-accent/10 text-accent rounded-full font-bold">{reminders.length}</span>
               </div>
               <div className="flex-1 overflow-y-auto space-y-3 scrollbar-hide">
                 {reminders.filter(r => !r.completed).map(r => (
                   <div key={r.id} className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl group relative overflow-hidden">
                      <div className="flex items-center gap-3">
                        <button onClick={() => toggleReminder(r.id)} className="w-4 h-4 rounded-full border border-white/20 hover:border-accent transition-colors" />
                        <div className="text-sm font-medium leading-tight truncate">{r.text}</div>
                      </div>
                      <button 
                        onClick={() => deleteReminder(r.id)} 
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition-all font-bold text-[10px]"
                      >
                        PURGE
                      </button>
                   </div>
                 ))}
                 {reminders.length === 0 && <div className="text-center py-8 text-[10px] text-zinc-600 uppercase font-bold tracking-widest italic">All Tasks Cycled</div>}
               </div>
             </div>
          </aside>
        </main>

        <footer className="h-28 border-t border-white/10 px-10 flex items-center bg-[#0A0A0A] z-20">
          <div className="w-full flex items-center gap-6 max-w-5xl mx-auto">
            <div className="flex gap-2">
               <button 
                onClick={() => setPreferences(prev => ({ ...prev, voiceEnabled: !prev.voiceEnabled }))}
                className={`w-12 h-12 rounded-3xl flex items-center justify-center transition-all ${preferences.voiceEnabled ? 'bg-accent/10 text-accent border border-accent/20' : 'bg-white/5 text-zinc-500 border border-white/10'}`}
                aria-label={preferences.voiceEnabled ? "Mute Aura" : "Unmute Aura"}
              >
                {preferences.voiceEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </button>
              <button 
                onClick={toggleListening}
                className={`w-12 h-12 rounded-3xl flex items-center justify-center transition-all ${isListening ? 'bg-red-500/10 text-red-400 border border-red-500/20 shadow-[0_0_15px_rgba(248,113,113,0.3)]' : 'bg-white/5 text-zinc-500 border border-white/10'}`}
                aria-label={isListening ? "Stop listening" : "Start command"}
              >
                {isListening ? <Mic className="w-5 h-5 animate-pulse" /> : <MicOff className="w-5 h-5" />}
              </button>
            </div>
            
            <div className="flex-1 relative group">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Neural link input..."
                className="w-full bg-white/[0.03] border border-white/10 rounded-3xl px-8 py-4 text-sm focus:outline-none focus:border-accent/40 focus:bg-white/[0.05] transition-all resize-none h-14 pr-16 placeholder:text-zinc-600"
                aria-label="Aura command input"
              />
              <button 
                onClick={() => handleSend()}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-accent hover:scale-110 transition-transform disabled:opacity-30"
                disabled={!input.trim()}
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </footer>
      </div>
      <SettingsOverlay />
    </div>
  );

  function SettingsOverlay() {
    return (
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-2xl bg-[#0A0A0A] border border-white/10 rounded-[48px] overflow-hidden shadow-3xl"
            >
              <div className="p-10 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight uppercase">Protocol Configuration</h2>
                  <p className="text-xs text-zinc-500 mt-2 font-mono tracking-widest uppercase">Kernel Version 3.4.1//NEURAL_LINK</p>
                </div>
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-4 bg-white/5 hover:bg-white/10 rounded-full transition-all border border-white/10"
                  aria-label="Close Settings"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-10 space-y-10 overflow-y-auto max-h-[60vh] scrollbar-hide">
                {/* Level Selection */}
                <section>
                  <h3 className="text-[11px] uppercase tracking-[0.3em] text-accent font-bold mb-6">Neural Cortices Selection</h3>
                  <div className="grid grid-cols-3 gap-4">
                    {(['gemini', 'openai', 'claude'] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => setActiveProvider(p)}
                        className={`p-6 rounded-[32px] border text-left transition-all ${
                          activeProvider === p 
                          ? 'bg-accent/10 border-accent text-accent shadow-[0_0_20px_rgba(0,242,255,0.15)]' 
                          : 'bg-white/[0.03] border-white/10 text-zinc-400 hover:border-white/20'
                        }`}
                      >
                        <div className="text-[10px] font-bold uppercase tracking-[0.2em] mb-2">{p}</div>
                        <div className="text-[9px] leading-tight flex items-center gap-1 opacity-60 uppercase font-bold">
                          {p === 'gemini' && "Native Link"}
                          {p === 'openai' && "External V4"}
                          {p === 'claude' && "Logical Core"}
                        </div>
                      </button>
                    ))}
                  </div>
                </section>

                {/* API Key Table */}
                <section className="bg-white/5 border border-white/10 p-8 rounded-[40px] space-y-6">
                   <h4 className="text-[10px] uppercase tracking-[0.3em] text-zinc-400 font-bold border-b border-white/5 pb-4">Encryption Keys</h4>
                   <div className="space-y-4">
                      {['gemini', 'openai', 'claude'].map(k => (
                        <div key={k}>
                          <label className="block text-[9px] text-zinc-500 uppercase tracking-widest mb-2 px-1 font-bold">{k} Access Token</label>
                          <input 
                            type="password"
                            value={apiKeys[k as keyof APIKeys] || ''}
                            onChange={(e) => setApiKeys(prev => ({ ...prev, [k]: e.target.value }))}
                            placeholder={`Authorize ${k}...`}
                            className="w-full bg-black/60 border border-white/10 rounded-2xl px-5 py-3 text-xs focus:border-accent outline-none transition-all placeholder:text-zinc-700 font-mono"
                          />
                        </div>
                      ))}
                   </div>
                </section>

                <section>
                   <h3 className="text-[11px] uppercase tracking-[0.3em] text-accent font-bold mb-6">Voice Synthesis Personality</h3>
                   <div className="grid grid-cols-5 gap-3">
                      {(['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'] as const).map((v) => (
                        <button
                          key={v}
                          onClick={() => setPreferences(prev => ({ ...prev, preferredVoice: v }))}
                          className={`py-4 rounded-3xl border text-[9px] font-bold uppercase tracking-widest transition-all ${
                            preferences.preferredVoice === v 
                            ? 'bg-accent/10 border-accent text-accent shadow-[0_0_15px_rgba(0,242,255,0.1)]' 
                            : 'bg-white/[0.03] border-white/10 text-zinc-500 hover:border-zinc-700'
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                   </div>
                </section>

                <section className="bg-white/5 p-8 rounded-[40px] flex items-center justify-between">
                   <div>
                      <h4 className="text-sm font-bold uppercase tracking-widest">Neural Notification Link</h4>
                      <p className="text-[10px] text-zinc-500 font-bold uppercase mt-1">Browser-level bio-rhythm sync status: {notificationStatus}</p>
                   </div>
                   <button 
                    onClick={requestNotificationPermission}
                    className="px-6 py-2 bg-white/10 border border-white/10 rounded-xl text-[10px] font-bold hover:bg-white/20 transition-all uppercase tracking-widest"
                   >
                     Update Status
                   </button>
                </section>

                {/* New Automation Section */}
                <section>
                  <h3 className="text-[11px] uppercase tracking-[0.3em] text-accent font-bold mb-6">Neural Automation Protocols</h3>
                  <div className="space-y-4">
                    <label className="flex items-center justify-between p-6 bg-white/[0.03] border border-white/10 rounded-3xl cursor-pointer hover:bg-white/[0.05] transition-all">
                      <div>
                        <div className="text-sm font-bold uppercase tracking-widest">Autonomous Task management</div>
                        <div className="text-[10px] text-zinc-500 mt-1">AI-driven prioritization and cycle optimization.</div>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={preferences.automation.autoTaskManagement}
                        onChange={(e) => setPreferences(prev => ({
                          ...prev,
                          automation: { ...prev.automation, autoTaskManagement: e.target.checked }
                        }))}
                        className="w-5 h-5 rounded border-white/20 bg-black text-accent focus:ring-accent"
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <label className="flex items-center justify-between p-6 bg-white/[0.03] border border-white/10 rounded-3xl cursor-pointer hover:bg-white/[0.05] transition-all">
                        <span className="text-xs font-bold uppercase tracking-widest">Auto-Add Meetings</span>
                        <input 
                          type="checkbox" 
                          checked={preferences.automation.autoAddMeetings}
                          onChange={(e) => setPreferences(prev => ({
                            ...prev,
                            automation: { ...prev.automation, autoAddMeetings: e.target.checked }
                          }))}
                          className="w-4 h-4 rounded border-white/20 bg-black text-accent focus:ring-accent"
                        />
                      </label>
                      <label className="flex items-center justify-between p-6 bg-white/[0.03] border border-white/10 rounded-3xl cursor-pointer hover:bg-white/[0.05] transition-all">
                        <span className="text-xs font-bold uppercase tracking-widest">Capture Reminders</span>
                        <input 
                          type="checkbox" 
                          checked={preferences.automation.autoAddReminders}
                          onChange={(e) => setPreferences(prev => ({
                            ...prev,
                            automation: { ...prev.automation, autoAddReminders: e.target.checked }
                          }))}
                          className="w-4 h-4 rounded border-white/20 bg-black text-accent focus:ring-accent"
                        />
                      </label>
                    </div>
                  </div>
                </section>

                <section>
                   <div className="flex items-center justify-between mb-4">
                      <h3 className="text-[11px] uppercase tracking-[0.3em] text-zinc-400 font-bold">Screen Buffer Refresh Frequency</h3>
                      <span className="text-accent text-xs font-mono">{preferences.automation.screenScanningFrequency}s</span>
                   </div>
                   <input 
                      type="range" 
                      min="5" 
                      max="120" 
                      value={preferences.automation.screenScanningFrequency}
                      onChange={(e) => setPreferences(prev => ({
                        ...prev,
                        automation: { ...prev.automation, screenScanningFrequency: parseInt(e.target.value) }
                      }))}
                      className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-accent"
                   />
                </section>
              </div>

              <div className="p-10 bg-white/[0.02] border-t border-white/10 flex justify-end">
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-10 py-4 bg-accent text-black font-bold text-xs rounded-3xl hover:scale-105 active:scale-95 transition-all uppercase tracking-[0.2em] shadow-[0_0_30px_rgba(0,242,255,0.2)]"
                >
                  Deploy Parameters
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }
}
