// Turns a typed sentence like «ریاضی ۴۵ دقیقه فردا یازدهم مشتق» into a planner card (pure, unit-tested).
export const norm = (s: string): string =>
  s.replace(/[يٱ]/g, 'ی').replace(/[ك]/g, 'ک').replace(/[ة]/g, 'ه').replace(/\u200c/g, ' ')
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .toLowerCase().replace(/\s+/g, ' ').trim();

export interface ParsedTask { subject: string; detail: string; minutes?: number; grade?: 'دهم' | 'یازدهم' | 'دوازدهم'; tomorrow: boolean }

export function parseTask(text: string, subjects: string[]): ParsedTask | null {
  let t = ' ' + norm(text) + ' ';
  if (t.trim().length < 2) return null;
  let tomorrow = false;
  if (/ فردا /.test(t)) { tomorrow = true; t = t.replace(/ فردا /, ' '); }
  t = t.replace(/ امروز /, ' ');
  let minutes: number | undefined;
  let m = /(\d+(?:\.\d+)?)\s*ساعت(?:\s*و\s*(\d+)\s*دقیقه)?/.exec(t);
  if (m) { minutes = Math.round(parseFloat(m[1]) * 60 + (m[2] ? parseInt(m[2], 10) : 0)); t = t.replace(m[0], ' '); }
  else if ((m = /(\d{1,3})\s*(?:دقیقه|دقیقه‌ای|min|m|د)(?=\s)/.exec(t))) { minutes = parseInt(m[1], 10); t = t.replace(m[0], ' '); }
  if (minutes !== undefined && (minutes < 1 || minutes > 600)) minutes = undefined;
  let grade: ParsedTask['grade'];
  for (const g of ['یازدهم', 'دوازدهم', 'دهم'] as const) {
    const re = new RegExp(`(?: |^)${g}(?= |$)`);
    if (re.test(t)) { grade = g; t = t.replace(re, ' '); break; }
  }
  t = t.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  // the subject: the longest known subject name found in the text, else the first word
  const known = subjects.map((s) => ({ s, n: norm(s) })).filter((x) => x.n && (' ' + t + ' ').includes(' ' + x.n + ' ')).sort((a, b) => b.n.length - a.n.length)[0];
  let subject: string, detail: string;
  if (known) { subject = known.s; detail = (' ' + t + ' ').replace(' ' + known.n + ' ', ' ').replace(/\s+/g, ' ').trim(); }
  else { const [first, ...rest] = t.split(' '); subject = first; detail = rest.join(' '); }
  return { subject, detail, minutes, grade, tomorrow };
}
