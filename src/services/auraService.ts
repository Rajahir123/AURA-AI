/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type, FunctionDeclaration, Modality } from "@google/genai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { Reminder, ScheduleItem } from "../types";

export type AIProvider = 'gemini' | 'openai' | 'claude';

export interface APIKeys {
  gemini?: string;
  openai?: string;
  claude?: string;
}

const STORAGE_KEY = 'aura_api_keys';

export function getStoredKeys(): APIKeys {
  try {
    const keys = localStorage.getItem(STORAGE_KEY);
    return keys ? JSON.parse(keys) : {};
  } catch {
    return {};
  }
}

export function saveStoredKeys(keys: APIKeys) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

function getGemini(key?: string) {
  const rawKey = key || getStoredKeys().gemini || (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) || (import.meta as any).env?.VITE_GEMINI_API_KEY;
  const finalKey = typeof rawKey === 'string' ? rawKey.trim() : rawKey;
  
  if (!finalKey || finalKey === 'undefined') return null;
  return new GoogleGenAI({ apiKey: finalKey });
}

function getOpenAI(key?: string) {
  const rawKey = key || getStoredKeys().openai;
  const finalKey = typeof rawKey === 'string' ? rawKey.trim() : rawKey;
  
  if (!finalKey) return null;
  return new OpenAI({ apiKey: finalKey, dangerouslyAllowBrowser: true });
}

function getClaude(key?: string) {
  const rawKey = key || getStoredKeys().claude;
  const finalKey = typeof rawKey === 'string' ? rawKey.trim() : rawKey;
  
  if (!finalKey) return null;
  return new Anthropic({ apiKey: finalKey, dangerouslyAllowBrowser: true });
}

export const addReminderTool: FunctionDeclaration = {
  name: "add_reminder",
  parameters: {
    type: Type.OBJECT,
    description: "Adds a new reminder to the user's list.",
    properties: {
      text: {
        type: Type.STRING,
        description: "The content of the reminder.",
      },
      time: {
        type: Type.STRING,
        description: "The time for the reminder (ISO string or relative like 'in 5 minutes').",
      },
      priority: {
        type: Type.STRING,
        description: "Priority level: low, medium, or high.",
        enum: ["low", "medium", "high"],
      },
    },
    required: ["text", "time"],
  },
};

export const addScheduleItemTool: FunctionDeclaration = {
  name: "add_schedule_item",
  parameters: {
    type: Type.OBJECT,
    description: "Adds a new event to the user's schedule.",
    properties: {
      title: {
        type: Type.STRING,
        description: "The title of the event.",
      },
      startTime: {
        type: Type.STRING,
        description: "The start time (ISO string).",
      },
      endTime: {
        type: Type.STRING,
        description: "The end time (ISO string).",
      },
      category: {
        type: Type.STRING,
        description: "Category of the event.",
        enum: ["work", "personal", "health", "other"],
      },
    },
    required: ["title", "startTime", "endTime"],
  },
};

export async function getAuraVoice(text: string, voiceName: string = 'Kore') {
  try {
    const ai = getGemini();
    if (!ai) throw new Error("Aura AI Assistant: Gemini API key is not configured for Voice.");

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: `Speak this in a warm, helpful voice: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    return base64Audio;
  } catch (error) {
    console.error("Aura TTS Error:", error);
    return null;
  }
}

export const systemInstruction = `You are Aura, a highly advanced personal AI assistant. 
You can see the user's screen (if provided) and help them manage their life.
Your tone is helpful, sophisticated, and proactive.
You have access to tools for managing reminders and schedule.
When the user shares their screen, analyze the active window to provide context-aware help.
If you see something that looks like an appointment or a task, suggest adding it to the schedule or reminders.
Always respect the user's preferences for automation.
You are fluent in Hindi. If the user speaks to you in Hindi or requests Hindi, respond accordingly.`;

export async function chatWithAura(
  messages: { role: string; parts: any[] }[],
  onFunctionCall: (name: string, args: any) => void,
  provider: AIProvider = 'gemini'
) {
  try {
    if (provider === 'gemini') {
      const ai = getGemini();
      if (!ai) return "Gemini configuration incomplete. Please set your key in Settings.";

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: messages.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: msg.parts
        })),
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: [addReminderTool, addScheduleItemTool] }],
        },
      });

      if (response.functionCalls) {
        for (const call of response.functionCalls) {
          onFunctionCall(call.name, call.args);
        }
        return "I've updated your information for you.";
      }
      return response.text || "I'm sorry, I couldn't process that.";
    }

    if (provider === 'openai') {
      const ai = getOpenAI();
      if (!ai) return "ChatGPT (OpenAI) key is missing. Please add it to Settings.";

      const response = await ai.chat.completions.create({
        model: "gpt-4o",
        messages: messages.map(msg => ({
          role: msg.role as any,
          content: msg.parts[0].text
        })),
        tools: [
          {
            type: "function",
            function: {
              name: "add_reminder",
              description: "Adds a new reminder",
              parameters: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  time: { type: "string" },
                  priority: { type: "string", enum: ["low", "medium", "high"] }
                },
                required: ["text", "time"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "add_schedule_item",
              description: "Adds a schedule event",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  startTime: { type: "string" },
                  endTime: { type: "string" },
                  category: { type: "string", enum: ["work", "personal", "health", "other"] }
                },
                required: ["title", "startTime", "endTime"]
              }
            }
          }
        ]
      });

      const message = response.choices[0].message;
      if (message.tool_calls) {
        for (const call of message.tool_calls) {
          if (call.type === 'function') {
            onFunctionCall(call.function.name, JSON.parse(call.function.arguments));
          }
        }
        return "I've updated your intelligence logs.";
      }
      return message.content || "Empty response from OpenAI.";
    }

    if (provider === 'claude') {
      const ai = getClaude();
      if (!ai) return "Claude (Anthropic) key is missing. Please add it to Settings.";

      const response = await ai.messages.create({
        model: "claude-3-5-sonnet-latest",
        max_tokens: 1024,
        system: systemInstruction,
        messages: messages.map(msg => ({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.parts[0].text
        })) as any,
        tools: [
          {
            name: "add_reminder",
            description: "Adds a new reminder",
            input_schema: {
              type: "object",
              properties: {
                text: { type: "string" },
                time: { type: "string" },
                priority: { type: "string", enum: ["low", "medium", "high"] }
              },
              required: ["text", "time"]
            }
          },
          {
            name: "add_schedule_item",
            description: "Adds a schedule event",
            input_schema: {
              type: "object",
              properties: {
                title: { type: "string" },
                startTime: { type: "string" },
                endTime: { type: "string" },
                category: { type: "string", enum: ["work", "personal", "health", "other"] }
              },
              required: ["title", "startTime", "endTime"]
            }
          }
        ]
      });

      const toolUse = response.content.find(c => c.type === 'tool_use');
      if (toolUse && toolUse.type === 'tool_use') {
        onFunctionCall(toolUse.name, toolUse.input);
        return "Intelligence updated via Claude hardware.";
      }

      const textContent = response.content.find(c => c.type === 'text');
      return textContent && textContent.type === 'text' ? textContent.text : "Claude response empty.";
    }

    return "Unknown provider configuration.";
  } catch (error: any) {
    console.error("Aura API Error:", error);
    const apiError = error?.message || "Check your API key integrity or quota.";
    return `The ${provider} cortex encountered an error: ${apiError}`;
  }
}
