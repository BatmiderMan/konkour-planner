export interface StudyBlock {
  lesson: string;
  subject: string;
  start: string;
  end: string;
  desc: string;
  study: boolean;
  cls: boolean;
  review: boolean;
  test: boolean;
  totalTests: string;
  wrong: string;
  blank: string;
}

export interface ChecklistItem {
  id?: string;
  text: string;
  done: boolean;
}

export interface RoutineItem {
  id?: string;
  text: string;
  done: boolean;
}

export interface SleepData {
  targetBedtime: string;
  targetWakeTime: string;
  actualBedtime: string;
  actualWakeTime: string;
  bedtimeCheckedIn?: boolean;
  wakeCheckedIn?: boolean;
  wakeCheckinTimestamp?: number;
  napMinutes: number;
  notes: string;
  checklist?: { text: string; done: boolean }[];
  // Legacy fields for backward compatibility
  bedtime?: string;
  wakeTime?: string;
}

export interface DayData {
  day: string;
  date: string;
  favorite: boolean;
  blocks: StudyBlock[];
  checklist: ChecklistItem[];
  routine: RoutineItem[];
  transfer: ChecklistItem[];
  sleep?: SleepData;
}

export interface DayIndexEntry {
  id: string;
  day: string;
  date: string;
  updatedAt: number;
}

// ---------- Planner (future planning) types ----------

export type PlannerGrade = 'دهم' | 'یازدهم' | 'دوازدهم';

export interface PlannerItem {
  id: string;
  subject: string;
  detail: string;
  grade: PlannerGrade;
  source?: string;
  done: boolean;
  sentToReport?: boolean;
  // optional per-card duration; when missing the global part duration is used
  minutes?: number;
  // optional pinned start time "HH:MM" — the card stays at this time instead of flowing
  start?: string;
}

export interface PlannerSubjectDef {
  n: string;
  grades: PlannerGrade[];
}

// 'test' = تستی, 'descriptive' = تشریحی
export type BookType = 'test' | 'descriptive';

export interface DayWindow {
  start: string; // "HH:MM" when the study time of this weekday begins
  end: string; // "HH:MM" when it ends
}

// A fixed interruption of the day (lunch, prayer, school, nap ...). Study cards flow around it.
export interface RestBlock {
  id: string;
  label: string;
  icon: string;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  days?: number[]; // recurring blocks only: weekday indexes (0 = Saturday ... 6 = Friday); empty/missing = every day
}

export interface PlannerScheduleSettings {
  partMinutes: number; // default length of one part (one planning card)
  breakMinutes: number; // rest between two parts
  longBreakEvery: number; // a longer rest after every N parts (0 = off)
  longBreakMinutes: number;
  days: DayWindow[]; // 7 entries, index 0 = Saturday ... 6 = Friday
  rests: RestBlock[]; // recurring interruptions (lunch, prayer, school ...)
}

export interface PlannerData {
  items: Record<string, PlannerItem[]>; // key: jalali date string "YYYY/MM/DD"
  sourceColors: Record<string, string>;
  sourceTypes: Record<string, BookType>; // missing = not chosen yet
  subjects: PlannerSubjectDef[];
  schedule: PlannerScheduleSettings;
  timeline: Record<string, boolean>; // per day: show the timed schedule or not
  dayRests: Record<string, RestBlock[]>; // one-off interruptions of a specific day
}
