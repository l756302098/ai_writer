import Dexie, { type Table } from 'dexie';

export interface Chapter {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  wordCount: number;
}

export interface Character {
  id: string;
  name: string;
  description: string;
  traits: string[];
  createdAt: number;
}

export interface Location {
  id: string;
  name: string;
  description: string;
  createdAt: number;
}

export interface WritingSettings {
  id: 'app_settings';
  apiKey: string;
  model: string;
  style: 'formal' | 'casual' | 'literary' | 'concise';
}

export class WritingDatabase extends Dexie {
  chapters!: Table<Chapter, string>;
  characters!: Table<Character, string>;
  locations!: Table<Location, string>;
  settings!: Table<WritingSettings, string>;

  constructor() {
    super('WritingStudioDB');
    this.version(1).stores({
      chapters: 'id, title, updatedAt',
      characters: 'id, name',
      locations: 'id, name',
      settings: 'id',
    });
  }

  async getRecentChapters(limit = 50): Promise<Chapter[]> {
    return this.chapters.orderBy('updatedAt').reverse().limit(limit).toArray();
  }

  async getSettings(): Promise<WritingSettings> {
    let s = await this.settings.get('app_settings');
    if (!s) {
      s = {
        id: 'app_settings',
        apiKey: '',
        model: 'deepseek-chat',
        style: 'casual',
      };
      await this.settings.add(s);
    }
    return s;
  }

  async updateSettings(patch: Partial<Omit<WritingSettings, 'id'>>): Promise<void> {
    const current = await this.getSettings();
    await this.settings.put({ ...current, ...patch });
  }
}

export const db = new WritingDatabase();
