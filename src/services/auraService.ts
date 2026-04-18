/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { Reminder, ScheduleItem } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

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

export const systemInstruction = `You are Aura, a highly advanced personal AI assistant. 
You can see the user's screen (if provided) and help them manage their life.
Your tone is helpful, sophisticated, and proactive.
You have access to tools for managing reminders and schedule.
When the user shares their screen, analyze the active window to provide context-aware help.
If you see something that looks like an appointment or a task, suggest adding it to the schedule or reminders.
Always respect the user's preferences for automation.`;

export async function chatWithAura(
  messages: { role: string; parts: any[] }[],
  onFunctionCall: (name: string, args: any) => void
) {
  try {
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
  } catch (error) {
    console.error("Aura API Error:", error);
    return "I encountered an error while trying to help. Please check your connection.";
  }
}
