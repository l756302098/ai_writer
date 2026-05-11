import Dexie, { type Table } from 'dexie';

export interface Chapter {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  wordCount: number;
}

export interface OutlineNode {
  id: string;
  parentId: string | null;
  title: string;
  order: number;
  chapterId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Character {
  id: string;
  name: string;
  role: string;
  appearance: string;
  personality: string;
  traits: string[];
  psychology: string;
  motivation: string;
  relationships: { characterId: string; characterName: string; description: string }[];
  createdAt: number;
  updatedAt: number;
}

export interface CharacterEvolution {
  id: string;
  characterId: string;
  chapterContext: string;
  previousState: string;
  newState: string;
  timestamp: number;
  accepted: boolean;
}

export interface Worldview {
  id: string;
  content: string;
  updatedAt: number;
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
  outlineNodes!: Table<OutlineNode, string>;
  characters!: Table<Character, string>;
  characterEvolutions!: Table<CharacterEvolution, string>;
  worldview!: Table<Worldview, string>;
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

    this.version(2).stores({
      chapters: 'id, title, updatedAt',
      outlineNodes: 'id, parentId, order',
      characters: 'id, name',
      characterEvolutions: 'id, characterId, timestamp',
      worldview: 'id',
      locations: 'id, name',
      settings: 'id',
    });
  }

  async getRecentChapters(limit = 50): Promise<Chapter[]> {
    return this.chapters.orderBy('updatedAt').reverse().limit(limit).toArray();
  }

  async getOutlineTree(): Promise<OutlineNode[]> {
    return this.outlineNodes.orderBy('order').toArray();
  }

  async getOutlineChildren(parentId: string | null): Promise<OutlineNode[]> {
    return this.outlineNodes.where({ parentId }).sortBy('order');
  }

  async getSettings(): Promise<WritingSettings> {
    let s = await this.settings.get('app_settings');
    if (!s) {
      s = {
        id: 'app_settings',
        apiKey: '',
        model: 'deepseek-v4-flash',
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

  async getWorldview(): Promise<Worldview> {
    let w = await this.worldview.get('default');
    if (!w) {
      w = { id: 'default', content: '', updatedAt: Date.now() };
      await this.worldview.add(w);
    }
    return w;
  }

  async updateWorldview(content: string): Promise<void> {
    await this.worldview.put({ id: 'default', content, updatedAt: Date.now() });
  }

  async getCharacterEvolutions(characterId: string): Promise<CharacterEvolution[]> {
    return this.characterEvolutions
      .where({ characterId })
      .reverse()
      .sortBy('timestamp');
  }
}

export const db = new WritingDatabase();
