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
