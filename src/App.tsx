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
  Bot
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Reminder, ScheduleItem, ChatMessage, AppPreference } from './types';
import { chatWithAura } from './services/auraService';

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [isScreenActive, setIsScreenActive] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [preferences, setPreferences] = useState<AppPreference>({
    theme: 'dark',
    automationLevel: 'suggest',
    voiceEnabled: false
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load from local storage
  useEffect(() => {
    const savedReminders = localStorage.getItem('aura_reminders');
    const savedSchedule = localStorage.getItem('aura_schedule');
    if (savedReminders) setReminders(JSON.parse(savedReminders));
    if (savedSchedule) setSchedule(JSON.parse(savedSchedule));

    // Initial message
    setMessages([{
      id: '1',
      role: 'assistant',
      content: "SYSTEM ONLINE. Aura Assistant ready at your command. I am monitoring your workflow for optimal performance.",
      timestamp: Date.now()
    }]);
  }, []);

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
      alert("Screen sharing might be blocked in this frame. Open in a new tab for full functionality.");
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

  const handleSend = async () => {
    if (!input.trim() && !isScreenActive) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: Date.now(),
      image: isScreenActive ? takeSnapshot() || undefined : undefined
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
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
        { text: input },
        ...(userMessage.image ? [{ inlineData: { mimeType: 'image/jpeg', data: userMessage.image } }] : [])
      ]
    });

    const auraResponse = await chatWithAura(history, handleFunctionCall);

    setMessages(prev => [...prev, {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: auraResponse,
      timestamp: Date.now()
    }]);
    setIsTyping(false);
  };

  const toggleReminder = (id: string) => {
    setReminders(prev => prev.map(r => r.id === id ? { ...r, completed: !r.completed } : r));
  };

  const deleteReminder = (id: string) => {
    setReminders(prev => prev.filter(r => r.id !== id));
  };

  return (
    <div className="flex h-screen bg-[#050505] text-white font-sans overflow-hidden">
      {/* 3-Column Grid Layout */}
      <div className="flex-1 grid grid-cols-[280px_1fr_280px] grid-rows-[80px_1fr_100px] gap-[1px] bg-white/5">
        
        {/* Header */}
        <header className="col-start-1 col-end-4 bg-[#0A0A0A]/80 backdrop-blur-md border-b border-white/10 flex items-center justify-between px-10 z-20">
          <div className="flex items-center gap-3">
            <div className="text-xl font-bold tracking-[0.2em] transform-gpu">
              AURA<span className="text-accent">.core</span>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 text-[13px] text-[#8e8e93]">
              <div className="w-2 h-2 rounded-full bg-accent shadow-[0_0_10px_#00f2ff] animate-pulse" />
              SYSTEM ONLINE • ACTIVE SIGHT ENABLED
            </div>
            <div className="flex items-center gap-5 text-[11px] font-bold tracking-[0.15em] text-[#8e8e93]">
              <span className="hover:text-white cursor-pointer transition-colors">CALENDAR</span>
              <span className="hover:text-white cursor-pointer transition-colors">CONTEXT</span>
              <span className="text-accent cursor-pointer">AUTOMATE</span>
            </div>
          </div>
        </header>

        {/* Sidebar Left: Schedule */}
        <aside className="bg-[#050505] p-6 border-r border-white/5 overflow-y-auto scrollbar-hide">
          <div className="mb-8">
            <h3 className="text-[11px] uppercase tracking-[0.15em] text-[#8e8e93] mb-5">Schedule Management</h3>
            <div className="space-y-4">
              {schedule.length === 0 ? (
                <div className="p-4 bg-white/[0.03] border border-white/5 rounded-xl text-center">
                  <p className="text-[10px] text-[#8e8e93]">NO ACTIVE EVENTS</p>
                </div>
              ) : (
                schedule.map((item) => (
                  <div key={item.id} className="bg-white/[0.03] border border-white/5 p-4 rounded-xl hover:border-accent/30 transition-all group">
                    <div className="text-sm font-semibold mb-1 group-hover:text-accent transition-colors">{item.title}</div>
                    <div className="text-[12px] text-[#8e8e93] mb-3">{new Date(item.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {new Date(item.endTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                    <div className="inline-block text-[10px] px-2 py-0.5 rounded-sm bg-accent/10 text-accent font-bold">
                      {item.category.toUpperCase()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <h3 className="text-[11px] uppercase tracking-[0.15em] text-[#8e8e93] mb-5">Preference Profile</h3>
            <div className="bg-white/[0.03] border border-white/5 p-4 rounded-xl opacity-70">
              <div className="text-xs font-semibold mb-2">Focus Mode: ON</div>
              <div className="text-xs font-semibold">Recording: ENABLED</div>
            </div>
          </div>
        </aside>

        {/* Main Content Area: Screen & Chat */}
        <main className="bg-[#050505] flex flex-col p-8 gap-6 overflow-hidden">
          {/* Visual Context Stream (Viewport) */}
          <div className="flex-1 bg-[#111] rounded-[20px] border border-white/10 relative overflow-hidden shadow-[inset_0_0_40px_rgba(0,0,0,0.5)]">
            <div className="absolute top-5 left-5 bg-accent text-black text-[10px] font-extrabold px-2.5 py-1 rounded-sm tracking-wide z-10">
              VISUAL CONTEXT STREAM
            </div>
            
            {isScreenActive ? (
              <div className="w-full h-full relative">
                <video 
                  ref={videoRef} 
                  autoPlay 
                  className="w-full h-full object-cover" 
                />
                <div className="absolute inset-0 border-2 border-accent/30 pointer-events-none" />
                <div className="absolute bottom-5 left-5 right-5 flex justify-between z-10">
                  <div className="text-[10px] text-accent font-bold tracking-widest">SCANNING DOM... 100%</div>
                  <div className="text-[10px] text-accent font-bold tracking-widest">OCR ACTIVE</div>
                </div>
              </div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-white/10">
                <div className="text-5xl font-extralight tracking-tighter mb-4">[ OFFLINE ]</div>
                <button 
                  onClick={startScreenShare}
                  className="flex items-center gap-2 px-6 py-2 border border-accent/20 hover:border-accent bg-accent/5 hover:bg-accent/10 text-accent rounded-full text-xs font-bold tracking-widest transition-all"
                >
                  <Plus className="w-4 h-4" /> ENABLE ACTIVE SIGHT
                </button>
              </div>
            )}
          </div>

          {/* Automation Log */}
          <div className="h-40 bg-black/30 border border-white/5 rounded-xl p-5 overflow-y-auto scrollbar-thin">
            <div className="font-mono text-[12px] text-[#00ff66] space-y-1">
              {messages.length === 0 ? (
                <div>{">"} INITIALIZING NEURAL NETWORK... DONE.</div>
              ) : (
                messages.filter(m => m.role === 'assistant').slice(-3).map(m => (
                  <div key={m.id} className="opacity-80">{">"} {m.content.substring(0, 100)}...</div>
                ))
              )}
              {isTyping && <div className="animate-pulse">{">"} ANALYZING VISUAL BUFFER...</div>}
            </div>
          </div>
        </main>

        {/* Sidebar Right: Reminders & Chat */}
        <aside className="bg-[#050505] p-6 border-l border-white/5 overflow-y-auto scrollbar-hide flex flex-col">
          <section className="flex-1">
            <h3 className="text-[11px] uppercase tracking-[0.15em] text-[#8e8e93] mb-5">Reminders & Tasks</h3>
            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {reminders.length === 0 ? (
                  <div className="text-center py-8 bg-white/[0.03] border border-dashed border-white/5 rounded-xl">
                    <p className="text-[10px] text-[#8e8e93]">NO PENDING TASKS</p>
                  </div>
                ) : (
                  reminders.map((reminder) => (
                    <motion.div 
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      key={reminder.id} 
                      className={`p-4 rounded-xl border transition-all ${
                        reminder.completed 
                        ? 'bg-transparent border-white/5 opacity-40' 
                        : 'bg-white/[0.03] border-white/10 active-automation'
                      } ${reminder.completed ? '' : 'border-l-[3px] border-l-accent'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div onClick={() => toggleReminder(reminder.id)} className="cursor-pointer flex-1 min-w-0">
                          <div className={`text-sm font-semibold truncate ${reminder.completed ? 'line-through text-[#8e8e93]' : ''}`}>{reminder.text}</div>
                          <div className="text-[12px] text-[#8e8e93] mt-1">{reminder.time}</div>
                        </div>
                        <button onClick={() => deleteReminder(reminder.id)} className="p-1 hover:text-red-400 opacity-30 hover:opacity-100 transition-all">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </section>

          <section className="mt-8 pt-6 border-t border-white/5">
            <h3 className="text-[11px] uppercase tracking-[0.15em] text-[#8e8e93] mb-4">Neural Feedback</h3>
            <div className="max-h-48 overflow-y-auto scrollbar-thin pr-2 space-y-4">
              {messages.slice(-3).map(m => (
                <div key={m.id} className={`text-[11px] leading-relaxed ${m.role === 'user' ? 'text-[#8e8e93] italic' : 'text-accent'}`}>
                   {m.role === 'user' ? 'Prompt: ' : 'Response: '} {m.content.substring(0, 150)}
                </div>
              ))}
            </div>
          </section>
        </aside>

        {/* Footer: Command Bar */}
        <footer className="col-start-1 col-end-4 border-t border-white/10 px-10 flex items-center bg-[#050505]/95 z-20">
          <div className="w-full h-14 bg-white/[0.03] border border-white/10 rounded-full flex items-center px-6 gap-4 focus-within:border-accent/40 transition-all">
            <div className="w-6 h-6 bg-accent rounded-full flex items-center justify-center shrink-0">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="black">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={isScreenActive ? "Ask Aura to manage your workflow..." : "Initialize command sequence..."}
              className="flex-1 bg-transparent border-none focus:ring-0 text-[15px] py-2 resize-none h-10 scrollbar-hide text-white placeholder-[#8e8e93]"
            />
            <div className="text-[10px] text-[#8e8e93] border border-white/10 px-2 py-0.5 rounded-sm tracking-widest font-bold">
              ENTER
            </div>
            {isScreenActive && (
              <button onClick={stopScreenShare} className="text-red-500/50 hover:text-red-500 transition-colors">
                <MonitorOff className="w-4 h-4" />
              </button>
            )}
          </div>
        </footer>

      </div>
    </div>
  );
}
