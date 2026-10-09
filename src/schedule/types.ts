export type Inst = 'maz' | 'qalamchi';
export type SKind = 'normal' | 'review' | 'konkur';
export interface SLesson {
  lesson: string; // planner subject name: «حسابان ۲»، «هندسه ۱»، «گسسته» ...
  topic: string;
  pages?: [number, number];
  pagesText?: string; // when the cell lists several page ranges
  tag?: 'required' | 'optional' | 'full';
  fast?: boolean; // Qalamchi «پیشروی سریع» row
}
export interface SGoal { label: string; n: number; of: number }
export interface SSubject { name: string; q: number; min?: number }
export interface SVariant { label: string | null; lessons: SLesson[] }
export interface SExam {
  id: string; inst: Inst; date: string; title: string; kind: SKind;
  stage?: number; stageTotal?: number;
  term?: string | null; similar?: string | null; phase?: string | null; note?: string | null;
  goal?: SGoal[] | null; subjects?: SSubject[] | null; totals?: string[] | null;
  lessons: SLesson[]; variants?: SVariant[];
  sharedDates?: string[] | null;
}
