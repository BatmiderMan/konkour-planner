// Institute report importers. To support another institute, add a reader that returns an ImportedExam and register it here.
import { Exam, Section, ExamSettings, Part, leaves, mapParts, newPart, newSection } from '../examStore';
import { dateFromKey } from '../plannerStore';
import { extractPdfJpeg, fileToRaster } from './loadReport';
import { extractPdfText } from './pdfText';
import { MONTHS, QLesson, baseOf, lev, norm, parseQalamchi, squash } from './qalamchiReport';
import { MazReport, parseMazReport, sigDistance } from './mazReport';
import { KNOWN_HEADINGS } from './mazKnown';

export interface ImportRow { index: number; label?: string; sectionName: string; partName?: string; n: number; c: number; w: number; level: number | null; countryRank: number | null; recognised: boolean }
export interface ImportedExam {
  institute: string; title: string; date: string; time?: string; rows: ImportRow[];
  level: number | null; countryRank: number | null; regionRank: number | null; participants: number | null; warnings: string[]; extraNotes?: string[];
}
export const INSTITUTES = [{ id: 'maz', label: 'ماز', hint: 'کارنامه‌ی تحلیلی (PDF یا عکس)' }, { id: 'qalamchi', label: 'قلم‌چی', hint: 'کارنامه‌ی PDF از kanoon.ir' }];

const SEEN_KEY = 'konkour_maz_heading_map_v1';
const loadSeen = (): { name: string; sig: string }[] => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch (e) { return []; } };
export function rememberHeading(sig: string, name: string): void {
  const rest = loadSeen().filter((x) => sigDistance(x.sig, sig) > 0.05);
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...rest, { name, sig }].slice(-40))); } catch (e) { /* ignore */ }
}

const slash = (d: string) => d.replace(/\//g, '/');
export async function importMaz(file: File, cfg: ExamSettings): Promise<{ exam: ImportedExam; sigs: string[] }> {
  const rep: MazReport = parseMazReport(await fileToRaster(file));
  const known = [...loadSeen(), ...KNOWN_HEADINGS];
  const used = new Set<string>();
  const rows: ImportRow[] = rep.sections.map((s) => {
    let hit: { name: string; d: number } | null = null;
    for (const k of known) { const d = sigDistance(s.sig, k.sig); if (d < 0.22 && (!hit || d < hit.d) && !used.has(k.name)) hit = { name: k.name, d }; }
    if (hit) used.add(hit.name);
    const c = s.correct ?? 0, w = s.wrong ?? 0, b = s.blank ?? 0;
    return { index: s.index, sectionName: hit?.name || '', n: c + w + b, c, w, level: s.level, countryRank: s.countryRank, recognised: !!hit };
  });
  // unrecognised headings: take the user's configured sections in order that aren't used yet
  const free = cfg.sections.map((s) => s.name).filter((n) => !used.has(n));
  rows.forEach((r) => { if (!r.sectionName) r.sectionName = free.shift() || `درس ${r.index + 1}`; });
  const warnings = [...rep.warnings];
  if (rep.date === null) warnings.push('تاریخ را خودت انتخاب کن.');
  return {
    sigs: rep.sections.map((s) => s.sig),
    exam: {
      institute: 'ماز', title: `آزمون ماز${rep.stage ? ' مرحله ' + rep.stage : ''}`, date: rep.date || '', time: rep.time || undefined, rows,
      level: rep.level, countryRank: rep.countryRank, regionRank: rep.regionRank, participants: rep.participants, warnings
    }
  };
}


// ---------------------------------------------------------------- Qalamchi (Kanoon)
const BASES = ['حسابان', 'هندسه', 'آمار و احتمال', 'گسسته', 'ریاضی', 'فیزیک', 'شیمی', 'زیست‌شناسی', 'زیست', 'ادبیات', 'عربی', 'دین و زندگی', 'زبان انگلیسی', 'اقتصاد', 'تاریخ', 'جغرافیا', 'منطق', 'فلسفه', 'علوم و اجتماعی', 'روانشناسی'].map(squash);
const bareName = (s: string) => squash(s).replace(/\d+$/, '');
const matchBase = (base: string, cands: string[]): string | null => {
  let best: { c: string; d: number } | null = null;
  for (const c of cands) { const d = lev(base, c); if (d <= Math.max(1, Math.floor(c.length / 4)) && (!best || d < best.d)) best = { c, d }; }
  return best ? best.c : null;
};
// grade → number in the planner's part names (حسابان ۱ = یازدهم, هندسه ۱ = دهم ...)
const gradeIndex = (base: string, g: number | null): number | null => g === null ? null : base === 'حسابان' ? (g === 11 ? 1 : g === 12 ? 2 : null) : g - 9;

/** where in the user's exam settings does a Qalamchi lesson belong? */
export function placeLesson(ls: QLesson, cfg: ExamSettings): { sectionName: string; partName: string; recognised: boolean } {
  const cand = [...BASES, ...cfg.sections.map((s) => bareName(s.name))];
  const base = matchBase(ls.base, cand) || ls.base;
  const idx = gradeIndex(base, ls.grade);
  const gradeWord = ls.grade === 12 ? 'دوازدهم' : ls.grade === 11 ? 'یازدهم' : ls.grade === 10 ? 'دهم' : '';
  const withGrade = (n: string) => `${n} ${gradeWord}`.trim();
  const lastNum = (n: string) => { const m = /(\d+)\s*$/.exec(norm(n)); return m ? +m[1] : null; };
  // (a) a part/group named like the lesson (حسابان, هندسه, گسسته, آمار و احتمال)
  for (const s of cfg.sections) for (const p of s.parts) {
    if (bareName(p.name) !== base) continue;
    if (p.children?.length) { const k = p.children.find((c) => lastNum(c.name) === idx); return { sectionName: s.name, partName: k ? k.name : withGrade(p.name), recognised: true }; }
    if (lastNum(p.name) === null) return { sectionName: s.name, partName: p.name, recognised: true };
  }
  // (b) a section named like the lesson, with parts «فیزیک ۱ / ۲ / ۳»
  for (const s of cfg.sections) {
    if (bareName(s.name) !== base) continue;
    const k = s.parts.find((p) => bareName(p.name) === base && lastNum(p.name) === idx);
    return { sectionName: s.name, partName: k ? k.name : s.parts.length || idx === null ? withGrade(s.name) : '', recognised: true };
  }
  // (c) any section that holds a part with this base number-suffixed (e.g. زیست ۱۰ …) or nothing known
  for (const s of cfg.sections) if (s.parts.some((p) => bareName(p.name) === base)) return { sectionName: s.name, partName: withGrade(s.name), recognised: true };
  return { sectionName: '', partName: ls.label, recognised: false };
}

export function importQalamchi(rep: ReturnType<typeof parseQalamchi>, cfg: ExamSettings): ImportedExam {
  const used = new Set<string>();
  const rows: ImportRow[] = rep.lessons.map((ls, i) => {
    const pl = placeLesson(ls, cfg);
    if (pl.sectionName) used.add(pl.sectionName);
    return { index: i, label: ls.label, sectionName: pl.sectionName, partName: pl.partName, n: ls.correct + ls.wrong + ls.blank, c: ls.correct, w: ls.wrong, level: ls.level, countryRank: null, recognised: pl.recognised };
  });
  const free = cfg.sections.map((s) => s.name).filter((n) => !used.has(n));
  rows.forEach((r) => { if (!r.sectionName) r.sectionName = r.label?.split(' ')[0] || free.shift() || `درس ${r.index + 1}`; });
  const dateLabel = rep.day && rep.month ? `${rep.day} ${MONTHS[rep.month - 1]}` : '';
  const extra = [
    rep.population ? `رتبه کشوری ${rep.countryRank} از ${rep.population} نفر` : '', rep.cityRank ? `رتبه شهر ${rep.cityRank}` : '',
    ...rep.notebookLevels.map((n) => `تراز دفترچه ${n.grade === 11 ? 'یازدهم' : n.grade === 10 ? 'دهم' : n.grade === 12 ? 'دوازدهم' : ''}: ${n.level}`)
  ].filter(Boolean);
  return {
    institute: 'قلم‌چی', title: `آزمون قلم‌چی${dateLabel ? ' ' + dateLabel : ''}`, date: rep.date || '', rows,
    level: rep.level, countryRank: rep.countryRank, regionRank: rep.regionRank, participants: null, warnings: [...rep.warnings], extraNotes: extra
  };
}

/** one entry point for the import button: picks the reader from the file itself */
export async function importReport(file: File, cfg: ExamSettings): Promise<{ exam: ImportedExam; sigs: string[] }> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (isPdf) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const items = await extractPdfText(bytes).catch(() => []);
    if (items.length > 40) return { exam: importQalamchi(parseQalamchi(items), cfg), sigs: [] };
    if (!extractPdfJpeg(bytes)) throw new Error('pdf');
  }
  return importMaz(file, cfg);
}

/** build a saved-format Exam from the (possibly user-corrected) import preview */
export function buildExam(x: ImportedExam, cfg: ExamSettings): Exam {
  const secs = new Map<string, Section>(); const results: NonNullable<Exam['results']> = {}; const detail: string[] = [];
  const secFor = (name: string): Section => {
    let s = secs.get(name);
    if (!s) { const base = cfg.sections.find((c) => c.name === name); s = base ? JSON.parse(JSON.stringify(base)) as Section : newSection(name); s.n = 0; secs.set(name, s); }
    return s;
  };
  const resetLeaves = (parts: Part[]): Part[] => parts.map((p) => (p.children?.length ? { ...p, children: resetLeaves(p.children) } : { ...p, n: 0 }));
  x.rows.forEach((r) => {
    let s = secFor(r.sectionName);
    if (r.partName && !detail.includes(s.id)) { detail.push(s.id); s = { ...s, parts: resetLeaves(s.parts) }; secs.set(r.sectionName, s); }
    const pn = r.partName || (detail.includes(s.id) ? r.label || r.sectionName : '');
    if (pn) {
      let leaf = s.parts.flatMap(leaves).find((l) => l.name === pn);
      if (!leaf) { leaf = newPart(pn); s = { ...s, parts: [...s.parts, leaf] }; secs.set(r.sectionName, s); }
      const id = leaf.id;
      s = { ...s, parts: mapParts(s.parts, id, (p) => ({ ...p, n: p.n + r.n })) }; secs.set(r.sectionName, s);
      const prev = results[id] || { n: 0, c: 0, w: 0 };
      results[id] = { n: prev.n + r.n, c: prev.c + r.c, w: prev.w + r.w };
    } else {
      s.n += r.n; const prev = results[s.id] || { n: 0, c: 0, w: 0 };
      results[s.id] = { n: prev.n + r.n, c: prev.c + r.c, w: prev.w + r.w };
    }
  });
  const sections = [...secs.values()];
  const bits = [
    x.participants ? `شرکت‌کننده: ${x.participants}` : '', x.regionRank ? `رتبه منطقه: ${x.regionRank}` : '',
    ...(x.extraNotes || []),
    ...(x.extraNotes ? [] : x.rows.filter((r) => r.level !== null).map((r) => `تراز ${r.sectionName}: ${r.level}${r.countryRank ? ` (رتبه کشوری ${r.countryRank})` : ''}`))
  ].filter(Boolean);
  const lvls = x.extraNotes ? x.rows.filter((r) => r.level !== null).map((r) => `${r.label || r.sectionName}: ${r.level}`).join('، ') : '';
  return {
    id: 'ex_' + Date.now().toString(36), title: x.title, kind: 'real', preset: x.institute, date: slash(x.date), time: x.time,
    sections, detail, negative: true, results,
    ...(x.countryRank ? { rank: String(x.countryRank) } : {}), ...(x.level ? { level: String(x.level) } : {}),
    notes: 'وارد‌شده از کارنامه — ' + [...bits, lvls && `تراز درس‌ها → ${lvls}`].filter(Boolean).join(' · ')
  };
}
export const validDate = (d: string) => !!d && !!dateFromKey(d);
