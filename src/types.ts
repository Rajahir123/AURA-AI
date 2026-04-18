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

export interface AutomationSettings {
  autoAddMeetings: boolean;
  autoAddReminders: boolean;
  autoTaskManagement: boolean;
  screenScanningFrequency: number; // in seconds
  preferredCategories: string[];
  restrictedApps: string[]; // Names of apps to ignore
}

export interface Alarm {
  id: string;
  time: string; // 24h format HH:mm
  label: string;
  enabled: boolean;
  days: number[]; // 0-6
}

export interface AppPreference {
  theme: 'light' | 'dark' | 'system';
  automationLevel: 'manual' | 'suggest' | 'auto';
  voiceEnabled: boolean;
  preferredVoice: 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';
  activeModule: 'sight' | 'timeline' | 'calendar' | 'alarms';
  automation: AutomationSettings;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  image?: string; // Base64 screen capture
}
