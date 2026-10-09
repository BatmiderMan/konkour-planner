/** Doorway for the rest of the app: open the scanner from anywhere (a report part, the timer's finish form, the period report). */
import type { SavedSheet, ScanLink, ScanRecord } from './model';

export interface PartCounts { total: number; wrong: number; blank: number }
export interface ScanContext {
  /** what the planner knows about the part that was just finished — used to pick the right book and range */
  lesson?: string; subject?: string; source?: string; detail?: string;
  bookId?: string;                 // open with this library book already chosen
  link?: ScanLink;                 // where the saved scan belongs (report day / part / planner card)
  current?: { total?: string; wrong?: string; blank?: string }; // numbers already typed in the part
  applyLabel?: string;             // text of the main button, e.g. «ثبت در این پارت»
  onApply?: (counts: PartCounts, rec: ScanRecord) => void;
  sheet?: SavedSheet;              // compare this already-saved sheet with a key: no photo step
  sheetOnly?: boolean;             // photo → save the sheet for later, no key and no grading
}

let opener: ((c: ScanContext) => void) | null = null;
export const registerScanOpener = (fn: ((c: ScanContext) => void) | null) => { opener = fn; };
export function openScan(ctx: ScanContext = {}): void { if (opener) opener(ctx); }

export const GOTO_CHECKER_EVENT = 'planex:goto-checker';
export interface CheckerFocus { tab?: 'books' | 'sheets' | 'history'; source?: string; lesson?: string; newBook?: boolean }
/** switch the app to the checker section (library tab by default) */
export function goToChecker(focus: CheckerFocus = {}): void {
  window.dispatchEvent(new CustomEvent(GOTO_CHECKER_EVENT, { detail: focus }));
}

/** a report part made from a planner card carries «کتاب: X» in its description */
export function sourceFromDesc(desc?: string): string | undefined {
  const m = /کتاب:\s*([^.\n]+)/.exec(desc || '');
  return m ? m[1].trim() : undefined;
}
