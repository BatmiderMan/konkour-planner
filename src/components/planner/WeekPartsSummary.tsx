import React from 'react';
import { PlannerData, PlannerItem } from '../../types';
import { toPersianDigits } from '../../utils';
import { dateKeyOf } from '../../plannerStore';

interface Props {
  data: PlannerData;
  days: Date[];
}

interface BookRow { name: string; t: number; d: number }
interface LessonRow { name: string; t: number; d: number; books: BookRow[] }

const NO_SOURCE = 'بدون منبع';

export function buildWeekPartsSummary(data: PlannerData, days: Date[]): LessonRow[] {
  const lessons = new Map<string, { t: number; d: number; books: Map<string, BookRow> }>();
  days.forEach((d) => {
    const items: PlannerItem[] = data.items[dateKeyOf(d)] || [];
    items.forEach((it) => {
      const name = (it.subject || '').trim() || 'بدون درس';
      let l = lessons.get(name);
      if (!l) { l = { t: 0, d: 0, books: new Map() }; lessons.set(name, l); }
      l.t++;
      if (it.done) l.d++;
      const bn = (it.source || '').trim() || NO_SOURCE;
      let b = l.books.get(bn);
      if (!b) { b = { name: bn, t: 0, d: 0 }; l.books.set(bn, b); }
      b.t++;
      if (it.done) b.d++;
    });
  });
  return Array.from(lessons.entries())
    .map(([name, l]) => ({ name, t: l.t, d: l.d, books: Array.from(l.books.values()).sort((a, b) => b.t - a.t) }))
    .sort((a, b) => b.t - a.t);
}

export const WeekPartsSummary: React.FC<Props> = ({ data, days }) => {
  const rows = React.useMemo(() => buildWeekPartsSummary(data, days), [data, days]);
  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  const total = rows.reduce((s, r) => s + r.t, 0);
  const done = rows.reduce((s, r) => s + r.d, 0);
  const allOpen = rows.length > 0 && rows.every((r) => open[r.name]);

  if (!rows.length) return null;

  return (
    <section className="pl-wsum" aria-label="خلاصه‌ی پارت‌های هفته">
      <div className="pl-wsum-head">
        <b>📊 پارت‌های این هفته به تفکیک درس</b>
        <span className="pl-wsum-total">{toPersianDigits(done)} از {toPersianDigits(total)}</span>
        <button
          type="button"
          className="pl-wsum-toggle"
          onClick={() => setOpen(allOpen ? {} : Object.fromEntries(rows.map((r) => [r.name, true])))}
        >
          {allOpen ? 'بستن جزئیات' : 'جزئیات منابع'}
        </button>
      </div>
      <ul className="pl-wsum-list">
        {rows.map((r) => {
          const isOpen = !!open[r.name];
          const color = data.sourceColors?.[r.books[0]?.name];
          return (
            <li key={r.name} className={isOpen ? 'open' : ''}>
              <button
                type="button"
                className="pl-wsum-row"
                aria-expanded={isOpen}
                onClick={() => setOpen((o) => ({ ...o, [r.name]: !o[r.name] }))}
              >
                <span className="pl-wsum-caret">{isOpen ? '▾' : '◂'}</span>
                <span className="pl-wsum-name">{r.name}</span>
                <span className="pl-wsum-bar"><i style={{ width: `${(r.d / r.t) * 100}%`, background: color || undefined }} /></span>
                <span className="pl-wsum-num"><b>{toPersianDigits(r.t)}</b> پارت{r.d ? <em> · {toPersianDigits(r.d)} انجام</em> : null}</span>
              </button>
              {isOpen && (
                <ul className="pl-wsum-books">
                  {r.books.map((b) => (
                    <li key={b.name}>
                      <span className="pl-stat-dot" style={{ background: data.sourceColors?.[b.name] || 'var(--line)' }} />
                      <span className="pl-wsum-bname">{b.name}</span>
                      <span className="pl-wsum-num"><b>{toPersianDigits(b.t)}</b>{b.d ? <em> · {toPersianDigits(b.d)} انجام</em> : null}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};
