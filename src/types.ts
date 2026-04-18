/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Reminder {
  id: string;
  text: string;
  time: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
}

export interface ScheduleItem {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  category: 'work' | 'personal' | 'health' | 'other';
}

export interface AppPreference {
  theme: 'light' | 'dark' | 'system';
  automationLevel: 'manual' | 'suggest' | 'auto';
  voiceEnabled: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  image?: string; // Base64 screen capture
}
