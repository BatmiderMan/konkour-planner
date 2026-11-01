import React from 'react';
import { PlannerItem } from '../../types';
import { LINK_PROMPT_EVENT, hashColor, loadPlannerData, patchPlannerItem, savePlannerData } from '../../plannerStore';
import { BOOKS, useTracker } from '../../trackerStore';
import { TopicPick, TopicPicker } from './TopicPicker';
import './tracker.css';

interface Prompt { dateKey: string; itemId: string; subject: string }

/**
 * Lives once in the app. When a plain planner card (not linked to any topic) is finished anywhere
 * (planner, today view ...), it offers "which topic was this?". Picking topics links the card and the
 * tracker ticks them (or logs one part) right away - the card is already done.
 */
export const LinkPromptHost: React.FC = () => {
  useTracker(); // keeps round names fresh
  const [prompt, setPrompt] = React.useState<Prompt | null>(null);
  const [open, setOpen] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail as Prompt | undefined;
      if (!d) return;
      setPrompt(d);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setPrompt((p) => (open ? p : null)), 12000);
    };
    window.addEventListener(LINK_PROMPT_EVENT, on);
    return () => { window.removeEventListener(LINK_PROMPT_EVENT, on); if (timer.current) clearTimeout(timer.current); };
  }, [open]);

  const findItem = (p: Prompt): PlannerItem | undefined => (loadPlannerData().items[p.dateKey] || []).find((x) => x.id === p.itemId);

  const apply = (p: Prompt, pick: TopicPick) => {
    const it = findItem(p);
    if (!it) return;
    const patch: Partial<PlannerItem> = { trk: { u: pick.us, r: pick.roundId, ...(pick.part ? { m: 'p' as const } : {}) } };
    if (!it.detail) patch.detail = pick.detail;
    if (!it.source && pick.source) {
      patch.source = pick.source;
      const d = loadPlannerData();
      if (!d.sourceColors[pick.source]) d.sourceColors[pick.source] = hashColor(pick.source);
      if (pick.sourceType && !d.sourceTypes[pick.source]) d.sourceTypes[pick.source] = pick.sourceType;
      savePlannerData(d);
    }
    patchPlannerItem(p.dateKey, p.itemId, patch);
  };

  const bookIdx = prompt ? BOOKS.findIndex((b) => b.subject === prompt.subject) : -1;

  return (
    <>
      {prompt && !open && (
        <div className="tk-linkprompt" role="status">
          <span>📚 این پارت «{prompt.subject}» از چه مبحثی بود؟</span>
          <button type="button" className="go" onClick={() => setOpen(true)}>انتخاب مبحث</button>
          <button type="button" aria-label="بستن" onClick={() => setPrompt(null)}>×</button>
        </div>
      )}
      {prompt && open && (
        <TopicPicker
          title="این پارت از چه مبحثی بود؟"
          confirmLabel="ثبت و تیک مبحث"
          initialBook={bookIdx >= 0 ? bookIdx : 0}
          onPick={(pick) => { apply(prompt, pick); setPrompt(null); }}
          onClose={() => { setOpen(false); setPrompt(null); }}
        />
      )}
    </>
  );
};
