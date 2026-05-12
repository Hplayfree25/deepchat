'use server';

import fs from 'fs/promises';
import path from 'path';
import { getRelevantChatHistoryMemories, getRelevantSavedMemories } from './memory';

const PERSONA_FILE = path.join(process.cwd(), 'data', 'user', 'persona.json');

export interface PersonaData {
  instructions: string;
  styleTone?: string;
  charWarm?: string;
  charEnthusiastic?: string;
  charHeaders?: string;
  charEmoji?: string;
  aboutName?: string;
  aboutOccupation?: string;
  aboutMore?: string;
  memoryReferenceSaved?: boolean;
  memoryReferenceHistory?: boolean;
}

export async function ensurePersonaFile() {
  try {
    await fs.mkdir(path.join(process.cwd(), 'data', 'user'), { recursive: true });
    try {
      await fs.access(PERSONA_FILE);
    } catch {
      await fs.writeFile(PERSONA_FILE, JSON.stringify({ 
        instructions: '', 
        styleTone: 'default', 
        charWarm: 'default',
        charEnthusiastic: 'default',
        charHeaders: 'default',
        charEmoji: 'default',
        aboutName: '', 
        aboutOccupation: '', 
        aboutMore: '',
        memoryReferenceSaved: true,
        memoryReferenceHistory: true
      }, null, 2));
    }
  } catch {
  }
}

export async function getPersona(): Promise<PersonaData> {
  await ensurePersonaFile();
  try {
    const data = await fs.readFile(PERSONA_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { 
      instructions: '', 
      styleTone: 'default', 
      charWarm: 'default',
      charEnthusiastic: 'default',
      charHeaders: 'default',
      charEmoji: 'default',
      aboutName: '', 
      aboutOccupation: '', 
      aboutMore: '',
      memoryReferenceSaved: true,
      memoryReferenceHistory: true
    };
  }
}

export async function savePersona(data: PersonaData): Promise<boolean> {
  await ensurePersonaFile();
  try {
    await fs.writeFile(PERSONA_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch {
    return false;
  }
}

export async function getInjectedSystemPrompt(baseSystemPrompt: string = '', currentUserMessage: string = ''): Promise<string> {
  const persona = await getPersona();
  let finalPrompt = baseSystemPrompt;
  
  const parts: string[] = [];

  if (persona.styleTone && persona.styleTone !== 'default') {
    parts.push(`- Style and Tone: ${persona.styleTone}`);
  }

  const characteristics: string[] = [];
  if (persona.charWarm && persona.charWarm !== 'default') characteristics.push(`Warmth: ${persona.charWarm === 'more' ? 'High' : 'Low'}`);
  if (persona.charEnthusiastic && persona.charEnthusiastic !== 'default') characteristics.push(`Enthusiasm: ${persona.charEnthusiastic === 'more' ? 'High' : 'Low'}`);
  if (persona.charHeaders && persona.charHeaders !== 'default') characteristics.push(`Use of Headers/Lists: ${persona.charHeaders === 'more' ? 'Frequent' : 'Minimal'}`);
  if (persona.charEmoji && persona.charEmoji !== 'default') characteristics.push(`Use of Emojis: ${persona.charEmoji === 'more' ? 'Frequent' : 'Minimal'}`);

  if (characteristics.length > 0) {
    parts.push(`- Characteristics:\n  - ${characteristics.join('\n  - ')}`);
  }

  if (persona.aboutName || persona.aboutOccupation || persona.aboutMore) {
    let about = '- About the User:\n';
    if (persona.aboutName) about += `  - Name: ${persona.aboutName}\n`;
    if (persona.aboutOccupation) about += `  - Occupation: ${persona.aboutOccupation}\n`;
    if (persona.aboutMore) about += `  - Details: ${persona.aboutMore}\n`;
    parts.push(about.trimEnd());
  }

  if (persona.memoryReferenceSaved !== false) {
    const memories = await getRelevantSavedMemories(currentUserMessage, 14);
    const memoryLines = memories.map(memory => `  - ${memory.content}`);
    if (memoryLines.length > 0) {
      parts.push(`- Relevant Saved Memories:\nUse these only when they are useful for the latest user message.\n${memoryLines.join('\n')}`);
    }
  }

  if (persona.memoryReferenceHistory === false) {
    parts.push('- Chat History Preference: Do not use previous chat history unless the user explicitly asks for it.');
  } else {
    const chatHistory = await getRelevantChatHistoryMemories(currentUserMessage, 8);
    const historyLines = chatHistory.map(item => `  - Previous user: ${item.userMessage}\n    Previous assistant: ${item.assistantMessage}`);
    if (historyLines.length > 0) {
      parts.push(`- Smart Context From Relevant Chat History:\nUse this only when it helps answer the latest user message.\n${historyLines.join('\n')}`);
    }
  }

  if (persona.instructions && persona.instructions.trim().length > 0) {
    parts.push(`- Custom Instructions:\n${persona.instructions}`);
  }

  if (parts.length > 0) {
    finalPrompt = `[System Instructions / User Personalization Settings]:\n${parts.join('\n\n')}\n\n${baseSystemPrompt}`;
  }
  
  return finalPrompt;
}
