import React from 'react';
import { Sheet } from '../ui/Sheet';
import { BookType, PlannerData, PlannerGrade } from '../../types';
import { toPersianDigits } from '../../utils';
import {
  BOOKS, BY_UNIT, TrackerState, appliesUnit, focusRound, roundsOfBook, scopedUnits, sourcesFor, unitsOfBook, unitsOfChapter, unitsOfSection, useTracker
} from '../../trackerStore';
import { labelForUnits, plannedUnits } from '../../trackerPlan';
import './tracker.css';

export interface TopicPick {
  us: string[];
  roundId: string;
  label: string; // the topic part only
  detail: string; // label + round name, ready to be the card's detail
  subject: string;
  grade: PlannerGrade;
  source?: string;
  sourceType?: BookType;
  /** true = this card is only one part of the picked topics (they stay open) */
  part: boolean;
}

const LESSONS = ['ریاضی', 'فیزیک', 'شیمی'];
const LESSON_COLOR: Record<string, string> = { 'ریاضی': '#4d7cf0', 'فیزیک': '#8a6cf0', 'شیمی': '#1fa88a' };
type CssVars = React.CSSProperties & Record<string, string | number>;
const fa = (n: number) => toPersianDigits(n);

interface Props {
  title?: string;
  confirmLabel?: string;
  initialRound?: string;
  initialUnits?: string[];
  initialPart?: boolean;
  initialBook?: number;
  plannerData?: PlannerData;
  onPick: (p: TopicPick) => void;
  onClose: () => void;
}

/** a small read-only strip of the rounds a unit already has */
const Dots: React.FC<{ u: string; s: TrackerState }> = ({ u, s }) => (
  <span className="tp-dots">
    {s.rounds.filter((r) => appliesUnit(r, u)).map((r) => (<i key={r.id} className={s.done[u] && s.done[u][r.id] ? 'on' : s.parts[u] && s.parts[u][r.id] ? 'half' : ''} style={{ '--c': r.color } as CssVars} title={r.name} />))}
  </span>
);

export const TopicPicker: React.FC<Props> = ({ title, confirmLabel, initialRound, initialUnits, initialPart, initialBook, plannerData, onPick, onClose }) => {
  const s = useTracker();
  const firstBook = initialUnits && initialUnits.length && BY_UNIT[initialUnits[0]] ? BY_UNIT[initialUnits[0]].bi : initialBook !== undefined && BOOKS[initialBook] ? initialBook : 0;
  const [bi, setBi] = React.useState(firstBook);
  const [rid, setRid] = React.useState(initialRound && s.rounds.some((r) => r.id === initialRound) ? initialRound : focusRound(s).id);
  const [part, setPart] = React.useState(!!initialPart);
  const [srcPick, setSrcPick] = React.useState('');
  const [sel, setSel] = React.useState<Set<string>>(() => new Set(initialUnits || []));
  const planned = React.useMemo(() => plannedUnits(plannerData), [plannerData]);
  const book = BOOKS[bi];
  const usable = roundsOfBook(s, bi);
  const round = usable.find((r) => r.id === rid) || usable[0] || s.rounds[0];
  const srcs = sourcesFor(round, bi);
  const src = srcs.find((x) => x.s === srcPick) || srcs[0] || null;

  const changeBook = (i: number) => { setBi(i); setSel(new Set()); setSrcPick(''); };
  const toggle = (us: string[]) => setSel((p) => {
    const n = new Set(p);
    const all = us.every((u) => n.has(u));
    us.forEach((u) => { if (all) n.delete(u); else n.add(u); });
    return n;
  });
  const state = (us: string[]) => { const k = us.filter((u) => sel.has(u)).length; return k === 0 ? '' : k === us.length ? ' on' : ' part'; };

  const chosen = unitsOfBook(bi).filter((u) => sel.has(u));
  const confirm = () => {
    if (!chosen.length) return;
    const us = scopedUnits(round, chosen);
    if (!us.length) return;
    const label = labelForUnits(us);
    onPick({
      part,
      us,
      roundId: round.id,
      label,
      detail: `${label} — ${round.name}`,
      subject: book.subject,
      grade: book.grade,
      ...(src ? { source: src.s, sourceType: src.t } : {})
    });
    onClose();
  };

  return (
    <Sheet onClose={onClose} title={title || "انتخاب از مباحث درسی"} z={650}>
      <div className="tk-sheet tp">
        <div className="tk-lab" style={{ marginTop: 0 }}>برای کدام دور؟</div>
        <div className="tk-pills">
          {usable.map((r) => (
            <button key={r.id} type="button" className={'tk-pill' + (r.id === round.id ? ' on' : '')} style={{ '--c': r.color } as CssVars} onClick={() => { setRid(r.id); setSrcPick(''); }}>{r.name}</button>
          ))}
        </div>
        {srcs.length > 1 ? (
          <>
            <div className="tk-lab">📖 منبع «{book.book}» در این دور</div>
            <div className="tk-pills">
              {srcs.map((x) => (<button key={x.s} type="button" className={'tk-pill sm' + (src && src.s === x.s ? ' on' : '')} onClick={() => setSrcPick(x.s)}>{x.s}{x.t ? (x.t === 'test' ? ' ✏️' : ' 📖') : ''}</button>))}
            </div>
          </>
        ) : (
          <div className="tk-note" style={{ marginTop: 6 }}>
            {src ? <>منبع این دور برای «{book.book}»: <b>{src.s}</b>{src.t ? (src.t === 'test' ? ' · تستی' : ' · تشریحی') : ''}</> : 'برای این دور هنوز منبعی تعیین نشده (در «پیگیری مباحث › دورها» می‌توانی تعیین کنی).'}
          </div>
        )}
        <div className="tk-lab">این پارت…</div>
        <div className="tk-pills">
          <button type="button" className={'tk-pill sm' + (!part ? ' on' : '')} onClick={() => setPart(false)}>✓ مبحث را تمام می‌کند</button>
          <button type="button" className={'tk-pill sm' + (part ? ' on' : '')} onClick={() => setPart(true)}>◐ فقط یک پارت از مبحث است</button>
        </div>

        <div className="tk-lab">کتاب</div>
        <div className="tp-books">
          {LESSONS.map((l) => (
            <div key={l} className="grp" style={{ '--lc': LESSON_COLOR[l] } as CssVars}>
              <span className="gl">{l}</span>
              {BOOKS.map((x, i) => x.lesson === l && (
                <button key={x.id} type="button" className={'tk-bp' + (i === bi ? ' on' : '')} onClick={() => changeBook(i)}>{x.book}</button>
              ))}
            </div>
          ))}
        </div>

        <div className="tp-tree">
          {book.chapters.map((c, ci) => {
            const chUs = unitsOfChapter(bi, ci);
            return (
              <div key={ci} className="tp-ch">
                <button type="button" className={'tp-row head' + state(chUs)} onClick={() => toggle(chUs)}>
                  <b className="cb" /><span className="t">{c.t}</span><span className="tk-mut">{fa(chUs.filter((u) => sel.has(u)).length)}/{fa(chUs.length)}</span>
                </button>
                {c.s.map((sec, si) => {
                  const us = unitsOfSection(bi, ci, si);
                  if (us.length === 1 && BY_UNIT[us[0]].self) {
                    const u = us[0];
                    return (
                      <button key={si} type="button" className={'tp-row' + state(us)} onClick={() => toggle(us)}>
                        <b className="cb" /><span className="t">{sec.t}</span>
                        {planned[u] && <em title="در برنامه‌ریز">📅</em>}
                        <Dots u={u} s={s} />
                      </button>
                    );
                  }
                  return (
                    <div key={si} className="tp-sec">
                      <button type="button" className={'tp-row sec' + state(us)} onClick={() => toggle(us)}>
                        <b className="cb" /><span className="t">{sec.t}</span><span className="tk-mut">{fa(us.filter((u) => sel.has(u)).length)}/{fa(us.length)}</span>
                      </button>
                      {us.map((u) => (
                        <button key={u} type="button" className={'tp-row item' + state([u])} onClick={() => toggle([u])}>
                          <b className="cb" /><span className="t">{BY_UNIT[u].t}</span>
                          {planned[u] && <em title="در برنامه‌ریز">📅</em>}
                          <Dots u={u} s={s} />
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="tk-actions tp-foot">
          <span className="tk-mut">{chosen.length ? `${fa(chosen.length)} بند انتخاب شد` : 'مباحث را تیک بزن'}</span>
          <button type="button" className="tk-btn pri" disabled={!chosen.length} onClick={confirm}>{confirmLabel || 'تأیید و پر کردن کارت'}</button>
        </div>
      </div>
    </Sheet>
  );
};
