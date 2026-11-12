import React from 'react';
import { alertDialog } from '../dialog';
import { VaultEditor } from './VaultEditor';
import { ReviewSummary, VaultReview, buildReview } from './VaultReview';
import { EditorDraft, BulkDraft, ReviewReq, registerVaultHost } from './launch';
import { VaultBulk } from './VaultBulk';
import { VaultQ, getVault } from './store';

/** mount once near the root: owns the editor sheet and the review player, so they open from any section */
export const VaultHost: React.FC<{ onLogReport: (s: ReviewSummary) => void }> = ({ onLogReport }) => {
  const [draft, setDraft] = React.useState<(EditorDraft & { k: number }) | null>(null);
  const [bulk, setBulk] = React.useState<(BulkDraft & { k: number }) | null>(null);
  const [rev, setRev] = React.useState<{ list: VaultQ[]; title: string; k: number } | null>(null);
  React.useEffect(() => {
    let k = 0;
    registerVaultHost({
      editor: (d) => setDraft({ ...d, k: ++k }),
      bulk: (d) => setBulk({ ...d, k: ++k }),
      review: (r: ReviewReq) => {
        const v = getVault();
        if (!v.ready) { void alertDialog('گنجینه هنوز در حال بارگذاری است؛ چند لحظه بعد دوباره بزنید.'); return; }
        const list = buildReview(v.items, r);
        if (!list.length) { void alertDialog(v.items.length ? 'سؤالی برای مرور با این انتخاب پیدا نشد.' : 'ابتدا چند سؤال در گنجینه ذخیره کنید.'); return; }
        const mode = r.mode || 'smart';
        setRev({ list, k: ++k, title: r.title || (r.ids ? 'مرور انتخابی' : mode === 'all' ? 'مرور همه' : mode === 'weak' ? 'اشتباه‌های باز' : 'مرور هوشمند امروز') });
      }
    });
    return () => registerVaultHost(null);
  }, []);
  return (
    <>
      {draft && <VaultEditor key={draft.k} draft={draft} onClose={() => setDraft(null)} />}
      {bulk && <VaultBulk key={bulk.k} draft={bulk} onClose={() => setBulk(null)} />}
      {rev && <VaultReview key={rev.k} list={rev.list} title={rev.title} onClose={() => setRev(null)} onLogReport={onLogReport} />}
    </>
  );
};
