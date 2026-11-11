import React from 'react';
import { MoreHorizontal } from 'lucide-react';
import { OPEN_MORE_EVENT, Section, spaceOf } from '../../nav';
import { hapticTap } from '../../focusBus';
import './subnav.css';

/**
 * The second level of navigation: the sections inside the space you are in.
 * Desktop: a quiet pill row under the top bar. Phone: a bar at the top of the screen with the ⋯ menu (settings, theme, music, search).
 */
export const SubNav: React.FC<{ section: string; onGo: (s: Section) => void; phone: boolean }> = ({ section, onGo, phone }) => {
  const sp = spaceOf(section);
  const multi = sp.sections.length > 1;
  if (!phone && !multi) return null;
  const cur = sp.sections.find((x) => x.id === section) || sp.sections[0];
  return (
    <div className={'sn no-print' + (phone ? ' phone' : '')} role="navigation" aria-label={`بخش‌های ${sp.label}`}>
      {multi ? (
        <div className="sn-pills" role="tablist">
          {sp.sections.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={x.id === section} className={'sn-pill' + (x.id === section ? ' on' : '')} title={x.hint} onClick={() => { hapticTap(); onGo(x.id); }}>{x.label}</button>
          ))}
        </div>
      ) : (
        <div className="sn-title"><b>{cur.label}</b><span>{cur.hint}</span></div>
      )}
      {phone && (
        <button type="button" className="sn-more" aria-label="منو و تنظیمات" onClick={() => { hapticTap(); window.dispatchEvent(new CustomEvent(OPEN_MORE_EVENT)); }}><MoreHorizontal size={20} /></button>
      )}
    </div>
  );
};
