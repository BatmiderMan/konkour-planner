import React from 'react';
import { Bell, BellOff, Music2, Pause, Play, SlidersHorizontal } from 'lucide-react';
import { TickPanel } from './TickPanel';
import { secondsLabel, useTickPrefs } from '../../tickSound';
import { currentTrack, musicToggle, useMusic } from '../../musicStore';
import { Equalizer } from '../music/musicUi';
import { Sheet } from '../ui/Sheet';
import { toPersianDigits } from '../../utils';

interface Props {
  running: boolean; tickIdx: number; nextIn: number; ticksLeft: number | null;
  isBreak: boolean; onOpenMusic: () => void; onOpenLook: () => void; lookOpen: boolean;
}

/** Phone: the tick panel + music card + look button become one row of chips; details open in a sheet. */
export const PhoneTools: React.FC<Props> = ({ running, tickIdx, nextIn, ticksLeft, isBreak, onOpenMusic, onOpenLook, lookOpen }) => {
  const tick = useTickPrefs();
  const music = useMusic();
  const t = currentTrack(music);
  const [sheet, setSheet] = React.useState(false);

  return (
    <>
      <div className="tm-ptools" role="group" aria-label="ابزارهای تایمر">
        {!isBreak && (
          <button type="button" className={'tm-pchip' + (tick.on ? ' on' : '')} onClick={() => setSheet(true)} aria-haspopup="dialog">
            <span className="ic">{tick.on ? <Bell size={18} /> : <BellOff size={18} />}</span>
            <span className="tx"><b>تیک</b><em>{tick.on ? `هر ${toPersianDigits(secondsLabel(tick.seconds))}${running ? ` · ${toPersianDigits(nextIn)}″` : ''}` : 'خاموش'}</em></span>
          </button>
        )}
        <div className={'tm-pchip music' + (music.playing ? ' on' : '')}>
          <button type="button" className="main" onClick={onOpenMusic} aria-label="باز کردن موسیقی">
            <span className="ic">{music.playing ? <Equalizer on /> : <Music2 size={18} />}</span>
            <span className="tx"><b>موسیقی</b><em>{t ? t.title : 'انتخاب کن'}</em></span>
          </button>
          {t && (
            <button type="button" className="go" onClick={musicToggle} aria-label={music.playing ? 'توقف موسیقی' : 'پخش موسیقی'}>
              {music.playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
          )}
        </div>
        <button type="button" className={'tm-pchip' + (lookOpen ? ' on' : '')} onClick={onOpenLook} aria-pressed={lookOpen}>
          <span className="ic"><SlidersHorizontal size={18} /></span>
          <span className="tx"><b>ظاهر</b><em>تم و ساعت</em></span>
        </button>
      </div>

      {sheet && (
        <Sheet onClose={() => setSheet(false)} title="ریتم تیک" z={540} dark>
          <TickPanel running={running} tickIdx={tickIdx} nextIn={nextIn} ticksLeft={ticksLeft} />
        </Sheet>
      )}
    </>
  );
};
