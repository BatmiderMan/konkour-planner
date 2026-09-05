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

export interface DayData {
  day: string;
  date: string;
  favorite: boolean;
  blocks: StudyBlock[];
  checklist: ChecklistItem[];
  routine: RoutineItem[];
  transfer: ChecklistItem[];
}

export interface DayIndexEntry {
  id: string;
  day: string;
  date: string;
  updatedAt: number;
}
