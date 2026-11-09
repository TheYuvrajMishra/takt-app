import type { CategoryColorName } from './theme/tokens';

export type Scope = 'today' | 'onwards' | 'weekday';
export type BlockStatus = 'upcoming' | 'progress' | 'complete' | 'missed' | 'skipped';

export interface Subcategory {
  id: string;
  name: string;
}

export interface Category {
  id: string;
  name: string;
  color: CategoryColorName;
  /** key into CategoryIcon set, e.g. 'job' | 'food' | 'learning' ... */
  icon: string;
  subcategories?: Subcategory[];
  usageCount?: number;
}

export interface Block {
  id: string;
  categoryId: string;
  subcategoryId?: string;
  title: string;
  /** minutes from midnight, local time */
  startMin: number;
  durationMin: number;
  notes?: string;
  doNotNudge?: boolean;
  alarmMode?: boolean;
  /** template block id this instance came from, if any */
  templateBlockId?: string;
}

export interface TemplateBlock extends Block {
  /** 0 = Sunday .. 6 = Saturday */
  weekdays: number[];
}

export interface RoutineTemplate {
  id: string;
  name: string;
  effectiveFrom: string; // YYYY-MM-DD
  blocks: TemplateBlock[];
}

export interface DayOverride {
  date: string; // YYYY-MM-DD
  /** full block list for that date when override exists; otherwise derived from template */
  blocks: Block[];
}

export interface CompletionEntry {
  blockId: string;
  date: string;
  status: BlockStatus;
  doneAt?: string; // ISO
  onTime?: boolean;
  nudgesFired?: number;
  startedAt?: string;
}

export interface Settings {
  nudgeIntervalMin: number; // 5..10, default 7
  maxNudgesPerBlock: number; // default 12
  perDayNudgeCap: number; // default 40
  quietHoursStart: string; // "22:00"
  quietHoursEnd: string; // "07:00"
  onboardingDone: boolean;
  haptics: boolean;
  reduceMotion: boolean;
  largeText: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  nudgeIntervalMin: 7,
  maxNudgesPerBlock: 12,
  perDayNudgeCap: 40,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  onboardingDone: false,
  haptics: true,
  reduceMotion: false,
  largeText: false,
};

export const DEFAULT_DURATION_MIN = 25;

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-job', name: 'Job', color: 'carbon', icon: 'job' },
  {
    id: 'cat-food', name: 'Food', color: 'apricot', icon: 'food',
    subcategories: [
      { id: 'sub-breakfast', name: 'Breakfast' },
      { id: 'sub-brunch', name: 'Brunch' },
      { id: 'sub-lunch', name: 'Lunch' },
      { id: 'sub-snack', name: 'Snack' },
      { id: 'sub-dinner', name: 'Dinner' },
    ],
  },
  { id: 'cat-learning', name: 'Learning', color: 'violet', icon: 'learning' },
  { id: 'cat-workout', name: 'Workout', color: 'orchid', icon: 'workout' },
  { id: 'cat-gaming', name: 'Gaming', color: 'butter', icon: 'gaming' },
  { id: 'cat-journaling', name: 'Journaling', color: 'mint', icon: 'journaling' },
  { id: 'cat-sleep', name: 'Sleep / Rest', color: 'carbon', icon: 'sleep' },
  { id: 'cat-project', name: 'Project', color: 'violet', icon: 'project' },
  { id: 'cat-study', name: 'Study', color: 'butter', icon: 'study' },
  { id: 'cat-custom', name: 'Custom', color: 'apricot', icon: 'custom' },
];
