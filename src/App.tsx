/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Plus, 
  Calendar, 
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
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Reminder, ScheduleItem, ChatMessage, AppPreference } from './types';
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
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [viewMode, setViewMode] = useState<'sight' | 'timeline'>('sight');
  const [preferences, setPreferences] = useState<AppPreference>({
    theme: 'dark',
    automationLevel: 'suggest',
    voiceEnabled: false,
    automation: {
      autoAddMeetings: false,
      autoAddReminders: true,
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
    return () => {
      audioRef.current?.pause();
    };
  }, []);

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
    const base64Audio = await getAuraVoice(text);
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

  return (
    <div className="flex h-screen bg-[#050505] text-white font-sans overflow-hidden">
      <div className="flex-1 grid grid-cols-[280px_1fr_280px] grid-rows-[80px_1fr_100px] gap-[1px] bg-white/5">
        
        <header className="col-start-1 col-end-4 bg-[#0A0A0A]/80 backdrop-blur-md border-b border-white/10 flex items-center justify-between px-10 z-20">
          <div className="flex items-center gap-3">
            <div className="text-xl font-bold tracking-[0.2em]">
              AURA<span className="text-accent">.core</span>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 text-[13px] text-[#8e8e93]">
              <div className="w-2 h-2 rounded-full bg-accent shadow-[0_0_10px_#00f2ff] animate-pulse" />
              SYSTEM ONLINE
            </div>
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 hover:bg-white/5 rounded-full transition-colors text-[#8e8e93] hover:text-white"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Settings Overlay */}
        <AnimatePresence>
          {isSettingsOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6"
            >
              <motion.div 
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="w-full max-w-2xl bg-[#0A0A0A] border border-white/10 rounded-[32px] overflow-hidden shadow-2xl"
              >
                <div className="p-8 border-b border-white/5 flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight">Automation Protocol</h2>
                    <p className="text-sm text-[#8e8e93] mt-1">Configure how Aura interacts with your OS environment.</p>
                  </div>
                  <button 
                    onClick={() => setIsSettingsOpen(false)}
                    className="p-2 hover:bg-white/5 rounded-full transition-colors"
                  >
                    <Plus className="w-6 h-6 rotate-45" />
                  </button>
                </div>

                <div className="p-8 space-y-8 overflow-y-auto max-h-[70vh] scrollbar-hide">
                  {/* Level Selection */}
                  <section>
                    <h3 className="text-[11px] uppercase tracking-[0.2em] text-accent font-bold mb-4">Neural Cortices (AI Models)</h3>
                    <div className="space-y-6">
                      <div className="grid grid-cols-3 gap-3">
                        {(['gemini', 'openai', 'claude'] as const).map((p) => (
                          <button
                            key={p}
                            onClick={() => setActiveProvider(p)}
                            className={`p-4 rounded-2xl border text-left transition-all ${
                              activeProvider === p 
                              ? 'bg-accent/10 border-accent text-accent shadow-[0_0_20px_rgba(0,242,255,0.1)]' 
                              : 'bg-white/[0.03] border-white/5 text-[#8e8e93] hover:border-white/20'
                            }`}
                          >
                            <div className="text-xs font-bold uppercase tracking-widest mb-1">{p === 'openai' ? 'ChatGPT' : p === 'claude' ? 'Claude' : 'Gemini'}</div>
                            <div className="text-[10px] leading-tight flex items-center gap-1 opacity-60">
                              {p === 'gemini' && "Recommended"}
                              {p === 'openai' && "GPT-4o Intelligence"}
                              {p === 'claude' && "Sonnet 3.5 Logic"}
                            </div>
                          </button>
                        ))}
                      </div>

                      <div className="space-y-4 bg-white/[0.02] border border-white/5 p-6 rounded-[24px]">
                        <h4 className="text-[10px] uppercase tracking-[0.15em] text-[#8e8e93] mb-4">Manual Key Entry</h4>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-[10px] text-[#8e8e93] uppercase tracking-widest mb-2 ml-1">Gemini API Key</label>
                            <input 
                              type="password"
                              value={apiKeys.gemini || ''}
                              onChange={(e) => setApiKeys(prev => ({ ...prev, gemini: e.target.value }))}
                              placeholder="Enter Gemini Key..."
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:border-accent outline-none transition-all placeholder:text-white/10"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-[#8e8e93] uppercase tracking-widest mb-2 ml-1">OpenAI API Key</label>
                            <input 
                              type="password"
                              value={apiKeys.openai || ''}
                              onChange={(e) => setApiKeys(prev => ({ ...prev, openai: e.target.value }))}
                              placeholder="sk-..."
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:border-accent outline-none transition-all placeholder:text-white/10"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-[#8e8e93] uppercase tracking-widest mb-2 ml-1">Anthropic API Key</label>
                            <input 
                              type="password"
                              value={apiKeys.claude || ''}
                              onChange={(e) => setApiKeys(prev => ({ ...prev, claude: e.target.value }))}
                              placeholder="sk-ant-..."
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:border-accent outline-none transition-all placeholder:text-white/10"
                            />
                          </div>
                        </div>
                        <p className="text-[9px] text-[#8e8e93] mt-4 leading-relaxed italic">
                          *Keys are stored locally in your neural buffer (localStorage) and never transmitted to our servers.
                        </p>
                      </div>
                    </div>
                  </section>

                  {/* Level Selection */}
                  <section>
                    <h3 className="text-[11px] uppercase tracking-[0.2em] text-accent font-bold mb-4">Core Automation Level</h3>
                    <div className="grid grid-cols-3 gap-3">
                      {(['manual', 'suggest', 'auto'] as const).map((level) => (
                        <button
                          key={level}
                          onClick={() => setPreferences(prev => ({ ...prev, automationLevel: level }))}
                          className={`p-4 rounded-2xl border text-left transition-all ${
                            preferences.automationLevel === level 
                            ? 'bg-accent/10 border-accent text-accent shadow-[0_0_20px_rgba(0,242,255,0.1)]' 
                            : 'bg-white/[0.03] border-white/5 text-[#8e8e93] hover:border-white/20'
                          }`}
                        >
                          <div className="text-xs font-bold uppercase tracking-widest mb-1">{level}</div>
                          <div className="text-[10px] leading-tight flex items-center gap-1 opacity-60">
                            {level === 'manual' && "User triggers only"}
                            {level === 'suggest' && "Ask before acting"}
                            {level === 'auto' && "Autonomous execution"}
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>

                  {/* Triggers */}
                  <section className="grid grid-cols-2 gap-6">
                    <div>
                      <h3 className="text-[11px] uppercase tracking-[0.2em] text-[#8e8e93] mb-4">Contextual Triggers</h3>
                      <div className="space-y-3">
                        <label className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-2xl cursor-pointer hover:bg-white/[0.04] transition-all">
                          <span className="text-sm">Auto-add Meetings</span>
                          <input 
                            type="checkbox" 
                            checked={preferences.automation.autoAddMeetings}
                            onChange={(e) => setPreferences(prev => ({
                              ...prev,
                              automation: { ...prev.automation, autoAddMeetings: e.target.checked }
                            }))}
                            className="w-4 h-4 rounded border-white/10 bg-black text-accent focus:ring-accent"
                          />
                        </label>
                        <label className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-2xl cursor-pointer hover:bg-white/[0.04] transition-all">
                          <span className="text-sm">Capture Reminders</span>
                          <input 
                            type="checkbox" 
                            checked={preferences.automation.autoAddReminders}
                            onChange={(e) => setPreferences(prev => ({
                              ...prev,
                              automation: { ...prev.automation, autoAddReminders: e.target.checked }
                            }))}
                            className="w-4 h-4 rounded border-white/10 bg-black text-accent focus:ring-accent"
                          />
                        </label>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-[11px] uppercase tracking-[0.2em] text-[#8e8e93] mb-4">Resource Guard</h3>
                      <div className="space-y-3">
                        <div className="p-4 bg-white/[0.02] border border-white/10 rounded-2xl">
                          <div className="text-[11px] text-[#8e8e93] mb-2 uppercase font-bold tracking-widest">Restricted Hosts</div>
                          <div className="flex flex-wrap gap-2">
                            {preferences.automation.restrictedApps.map(app => (
                              <span key={app} className="text-[10px] px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-md">
                                {app}
                              </span>
                            ))}
                            <button className="text-[10px] px-2 py-0.5 bg-white/5 text-white/40 rounded-md border border-white/10 hover:text-white transition-all">
                              + ADD
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Frequency Slider */}
                  <section>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-[11px] uppercase tracking-[0.2em] text-[#8e8e93]">Screen Buffer Refresh</h3>
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
                      className="w-full h-1.5 bg-white/5 rounded-lg appearance-none cursor-pointer accent-accent"
                    />
                    <div className="flex justify-between mt-2 text-[9px] text-[#8e8e93] font-mono">
                      <span>AGGRESSIVE (5s)</span>
                      <span>POWER SAVING (120s)</span>
                    </div>
                  </section>

                  {/* Notification Status */}
                  <section className="bg-white/[0.02] border border-white/5 p-6 rounded-3xl">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold mb-1">Neural Alert System</h3>
                        <p className="text-[10px] text-[#8e8e93]">Browser-level notifications for time-critical events.</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded text-[8px] font-bold tracking-widest uppercase ${
                          notificationStatus === 'granted' ? 'bg-green-500/20 text-green-400' :
                          notificationStatus === 'denied' ? 'bg-red-500/20 text-red-400' :
                          'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          {notificationStatus}
                        </span>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => {
                              notifiedItems.current.clear();
                              alert("Neural cache purged.");
                            }}
                            className="text-[10px] text-red-400 hover:underline font-bold"
                          >
                            PURGE CACHE
                          </button>
                          {notificationStatus !== 'granted' && (
                            <button 
                              onClick={requestNotificationPermission}
                              className="text-[10px] text-accent hover:underline font-bold"
                            >
                              FIX PERMISSIONS
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </section>
                </div>

                <div className="p-8 bg-white/[0.02] border-t border-white/5 flex items-center justify-between">
                  <div className="text-[10px] text-[#8e8e93] flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                    PREFERENCES SYNCED TO LOCAL KERNEL
                  </div>
                  <button 
                    onClick={() => setIsSettingsOpen(false)}
                    className="px-8 py-3 bg-accent text-black font-bold text-xs rounded-full hover:scale-105 active:scale-95 transition-all"
                  >
                    DEPLOY CONFIGURATION
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <aside className="bg-[#050505] p-6 border-r border-white/5 overflow-y-auto scrollbar-hide">
          <h3 className="text-[11px] uppercase tracking-[0.15em] text-[#8e8e93] mb-5">Schedule</h3>
          <div className="space-y-4">
            {schedule.map((item) => (
              <div key={item.id} className="group bg-white/[0.03] border border-white/5 p-4 rounded-xl relative overflow-hidden">
                <div className="text-sm font-semibold">{item.title}</div>
                <div className="text-[12px] text-[#8e8e93]">{new Date(item.startTime).toLocaleTimeString()}</div>
                <button 
                  onClick={() => deleteScheduleItem(item.id)}
                  className="absolute top-2 right-2 p-1 text-[#8e8e93] opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </aside>

        <main className="bg-[#050505] flex flex-col p-8 gap-6 overflow-hidden">
          {/* Main View Header / Tabs */}
          <div className="flex items-center justify-between">
            <div className="flex bg-white/[0.03] border border-white/10 p-1 rounded-full">
              <button 
                onClick={() => setViewMode('sight')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-bold tracking-widest transition-all ${viewMode === 'sight' ? 'bg-accent text-black' : 'text-[#8e8e93] hover:text-white'}`}
              >
                <Eye className="w-3 h-3" /> ACTIVE SIGHT
              </button>
              <button 
                onClick={() => setViewMode('timeline')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-bold tracking-widest transition-all ${viewMode === 'timeline' ? 'bg-accent text-black' : 'text-[#8e8e93] hover:text-white'}`}
              >
                <Activity className="w-3 h-3" /> NEURAL TIMELINE
              </button>
            </div>
            
            <div className="text-[10px] text-[#8e8e93] font-mono">
              LATENCY: 24MS • BUFFER: 100%
            </div>
          </div>

          <div className="flex-1 bg-[#111] rounded-[20px] border border-white/10 relative overflow-hidden">
            <AnimatePresence mode="wait">
              {viewMode === 'sight' ? (
                <motion.div 
                  key="sight"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="w-full h-full"
                >
                  {isScreenActive ? (
                    <video ref={videoRef} autoPlay className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                      <div className="w-20 h-20 bg-accent/5 rounded-full flex items-center justify-center border border-accent/20">
                        <Monitor className="w-8 h-8 text-accent/40" />
                      </div>
                      <button onClick={startScreenShare} className="px-6 py-2 border border-accent/20 text-accent rounded-full text-xs font-bold tracking-widest hover:bg-accent/10 transition-all">
                        ENABLE ACTIVE SIGHT
                      </button>
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div 
                  key="timeline"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="w-full h-full p-8 overflow-y-auto scrollbar-hide"
                >
                  <div className="flex items-start justify-between mb-8">
                    <div className="text-4xl font-light tracking-tighter">Day Overview</div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-accent">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</div>
                      <div className="text-[10px] text-[#8e8e93] tracking-widest uppercase">Visualizing next 12 cycles</div>
                    </div>
                  </div>

                  <div className="relative pl-16 space-y-12">
                    <div className="absolute left-[31px] top-0 bottom-0 w-px bg-gradient-to-b from-accent/50 via-accent/10 to-transparent" />
                    
                    {/* Combine schedule and reminders for timeline */}
                    {[
                      ...schedule.map(s => ({ ...s, time: s.startTime, type: 'schedule' })),
                      ...reminders.map(r => ({ ...r, title: r.text, type: 'reminder', time: Date.now().toString() })) // Fallback time if not set
                    ]
                    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
                    .map((item: any) => (
                      <div key={item.id} className="relative group">
                        <div className="absolute -left-[45px] top-1 text-[11px] font-mono text-[#8e8e93] bg-[#111] px-1 z-10 transition-colors group-hover:text-accent">
                          {new Date(item.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className={`absolute -left-[35px] top-2 w-2 h-2 rounded-full border border-accent bg-[#111] z-10 ${item.type === 'schedule' ? 'bg-accent' : 'border-dashed'}`} />
                        
                        <div className="bg-white/[0.03] border border-white/5 p-6 rounded-3xl hover:border-accent/30 transition-all hover:bg-white/[0.05]">
                          <div className="flex items-start justify-between mb-2">
                             <div className="font-bold text-lg tracking-tight">{item.title}</div>
                             <div className={`text-[10px] px-2 py-0.5 rounded-sm font-bold tracking-widest ${item.type === 'schedule' ? 'bg-accent/20 text-accent' : 'bg-white/10 text-[#8e8e93]'}`}>
                               {item.type.toUpperCase()}
                             </div>
                          </div>
                          <div className="text-sm text-[#8e8e93] leading-relaxed">
                            {item.type === 'schedule' 
                              ? `Duration: ${Math.round((new Date((item as any).endTime).getTime() - new Date((item as any).startTime).getTime()) / 60000)} minutes`
                              : `Priority: ${item.priority || 'standard'}`}
                          </div>
                        </div>
                      </div>
                    ))}

                    {schedule.length === 0 && reminders.length === 0 && (
                      <div className="text-center py-20 opacity-20 select-none">
                        <Activity className="w-16 h-16 mx-auto mb-4" />
                        <div className="text-xl font-light">NO DATA IN CHRONO-BUFFER</div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="h-40 bg-black/30 border border-white/5 rounded-xl p-5 overflow-y-auto">
             <div className="font-mono text-[12px] text-[#00ff66] space-y-1">
              {messages.length === 0 ? (
                <div>{">"} INITIALIZING...</div>
              ) : (
                messages.filter(m => m.role === 'assistant').slice(-3).map(m => (
                  <div key={m.id}>{">"} {m.content.substring(0, 100)}...</div>
                ))
              )}
            </div>
          </div>
        </main>

        <aside className="bg-[#050505] p-6 border-l border-white/5 overflow-y-auto flex flex-col">
          <h3 className="text-[11px] uppercase tracking-[0.15em] text-[#8e8e93] mb-5">Tasks</h3>
          <div className="space-y-3">
            {reminders.map((reminder) => (
              <div key={reminder.id} className="p-4 rounded-xl border border-white/10 bg-white/[0.03]">
                <div className="text-sm font-semibold">{reminder.text}</div>
                <button onClick={() => deleteReminder(reminder.id)} className="text-xs text-[#8e8e93] hover:text-red-400 mt-2">DELETE</button>
              </div>
            ))}
          </div>
        </aside>

        <footer className="col-start-1 col-end-4 border-t border-white/10 px-10 flex items-center bg-[#050505]/95 z-20">
          <div className="w-full h-14 bg-white/[0.03] border border-white/10 rounded-full flex items-center px-6 gap-2">
             <button 
              onClick={() => setPreferences(prev => ({ ...prev, voiceEnabled: !prev.voiceEnabled }))}
              className={`p-2 rounded-full transition-all ${preferences.voiceEnabled ? 'bg-accent/20 text-accent' : 'text-gray-600'}`}
              title="Toggle Hindi Voice Response"
            >
              {preferences.voiceEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </button>
            <button 
              onClick={toggleListening}
              className={`p-2 rounded-full transition-all ${isListening ? 'bg-red-500/20 text-red-500 animate-pulse' : 'text-gray-600 hover:text-white'}`}
              title="Voice Command"
            >
              {isListening ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Ask Aura..."
              className="flex-1 bg-transparent border-none focus:ring-0 text-[15px] resize-none h-10 text-white"
            />
             <div ref={chatEndRef} />
             {isScreenActive && (
              <button onClick={stopScreenShare} className="text-red-500/50">
                <MonitorOff className="w-4 h-4" />
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
