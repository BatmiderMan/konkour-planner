import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DayData, DayIndexEntry, StudyBlock, ChecklistItem } from './types';
import { createDefaultDayData, createEmptyBlock, calculateTotalStudyTime } from './utils';
import { supabase } from './supabase';
import { Toolbar } from './components/Toolbar';
import { ReportHeader } from './components/ReportHeader';
import { StudyBlockItem } from './components/StudyBlockItem';
import { ChecklistCard } from './components/ChecklistCard';
import { RoutineCard } from './components/RoutineCard';
import { TransferCard } from './components/TransferCard';
import { TotalCard } from './components/TotalCard';
import { P2PSyncModal } from './components/P2PSyncModal';
import { p2pSync } from './p2pSync';

const KEY_INDEX = 'konkour_days_index_v2';
const KEY_CURRENT = 'konkour_current_day_id_v2';
const KEY_SAVED_ROUTINE = 'konkour_saved_routine_v2';
const dayKey = (id: string) => `konkour_day_data_v2:${id}`;

function normalizeDayData(parsed: any): DayData {
  const fresh = createDefaultDayData();
  if (!parsed || typeof parsed !== 'object') return fresh;

  // Blocks migration
  let blocks: StudyBlock[] = [];
  if (Array.isArray(parsed.blocks) && parsed.blocks.length > 0) {
    blocks = parsed.blocks.map((b: any) => ({
      lesson: b.lesson || '',
      subject: b.subject || '',
      start: b.start || '',
      end: b.end || '',
      desc: b.desc || '',
      study: !!b.study,
      cls: !!b.cls,
      review: !!b.review,
      test: !!b.test,
      totalTests: b.totalTests !== undefined
        ? String(b.totalTests)
        : (b.correct !== undefined && b.wrong !== undefined && b.blank !== undefined
            ? String((parseInt(b.correct, 10) || 0) + (parseInt(b.wrong, 10) || 0) + (parseInt(b.blank, 10) || 0) || '')
            : ''),
      wrong: b.wrong !== undefined ? String(b.wrong) : '',
      blank: b.blank !== undefined ? String(b.blank) : ''
    }));
  } else {
    blocks = [createEmptyBlock()];
  }

  // Checklist migration
  let checklist: ChecklistItem[] = [];
  if (Array.isArray(parsed.checklist) && parsed.checklist.length > 0) {
    checklist = parsed.checklist.map((item: any) => ({
      text: item.text || '',
      done: !!item.done
    }));
  } else {
    checklist = Array.from({ length: 5 }, () => ({ text: '', done: false }));
  }

  // Routine migration
  let routine: ChecklistItem[] = [];
  if (Array.isArray(parsed.routine) && parsed.routine.length > 0) {
    routine = parsed.routine.map((item: any) => ({
      text: item.text || '',
      done: !!item.done
    }));
  } else {
    routine = Array.from({ length: 6 }, () => ({ text: '', done: false }));
  }

  // Transfer migration (handles old string format vs new list format)
  let transfer: ChecklistItem[] = [];
  if (Array.isArray(parsed.transfer)) {
    transfer = parsed.transfer.map((item: any) => ({
      text: item.text || '',
      done: !!item.done
    }));
  } else if (typeof parsed.transfer === 'string' && parsed.transfer.trim()) {
    transfer = parsed.transfer
      .split('\n')
      .filter((line: string) => line.trim())
      .map((line: string) => ({ text: line.trim(), done: false }));
    if (transfer.length === 0) {
      transfer = Array.from({ length: 4 }, () => ({ text: '', done: false }));
    }
  } else {
    transfer = Array.from({ length: 4 }, () => ({ text: '', done: false }));
  }

  return {
    day: parsed.day || '',
    date: parsed.date || '',
    favorite: !!parsed.favorite,
    blocks,
    checklist,
    routine,
    transfer
  };
}

export const App: React.FC = () => {
  const [daysIndex, setDaysIndex] = useState<DayIndexEntry[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [state, setState] = useState<DayData | null>(null);
  const [saveStatus, setSaveStatus] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'blocks' | 'sidebar'>('blocks');
  const [isP2POpen, setIsP2POpen] = useState<boolean>(false);
  const [isP2PConnected, setIsP2PConnected] = useState<boolean>(false);

  const saveTimer = useRef<any>(null);
  const statusTimer = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // WebRTC P2P Sync listener
  useEffect(() => {
    const unsubStatus = p2pSync.onStatusChange((status) => {
      setIsP2PConnected(status === 'connected');
    });

    const unsubData = p2pSync.onDataReceived((msg) => {
      if (msg.type === 'FULL_SYNC' && msg.payload) {
        handleReceiveFullSync(msg.payload);
      } else if (msg.type === 'FULL_SYNC' && !msg.payload) {
        // Peer requested full data from us
        broadcastFullSync();
      } else if (msg.type === 'DAY_UPDATE' && msg.payload) {
        handleReceiveDayUpdate(msg.payload);
      } else if (msg.type === 'DELETE_DAY' && msg.payload) {
        handleReceiveDayDelete(msg.payload);
      }
    });

    return () => {
      unsubStatus();
      unsubData();
    };
  }, [daysIndex, state, currentId]);

  const isApplyingRemoteUpdate = useRef<boolean>(false);
  const lastSavedJson = useRef<string>('');

  const broadcastFullSync = () => {
    const allDaysData: Record<string, any> = {};
    daysIndex.forEach((entry) => {
      const raw = localStorage.getItem(dayKey(entry.id));
      if (raw) allDaysData[entry.id] = JSON.parse(raw);
    });

    p2pSync.broadcast({
      type: 'FULL_SYNC',
      payload: {
        daysIndex,
        currentId,
        days: allDaysData
      },
      timestamp: Date.now()
    });
  };

  const handleReceiveFullSync = (payload: any) => {
    if (!payload?.daysIndex || !payload?.days) return;
    try {
      isApplyingRemoteUpdate.current = true;
      localStorage.setItem(KEY_INDEX, JSON.stringify(payload.daysIndex));
      for (const [id, dayData] of Object.entries(payload.days)) {
        localStorage.setItem(dayKey(id), JSON.stringify(dayData));
      }
      setDaysIndex(payload.daysIndex);
      if (payload.currentId && payload.days[payload.currentId]) {
        setCurrentId(payload.currentId);
        const norm = normalizeDayData(payload.days[payload.currentId]);
        lastSavedJson.current = JSON.stringify(norm);
        setState(norm);
        localStorage.setItem(KEY_CURRENT, payload.currentId);
      }
      showStatus('همگام‌سازی انجام شد ✓');
      setTimeout(() => {
        isApplyingRemoteUpdate.current = false;
      }, 500);
    } catch (e) {
      console.error('Failed to apply P2P sync payload:', e);
      isApplyingRemoteUpdate.current = false;
    }
  };

  const handleReceiveDayUpdate = (payload: { id: string; data: DayData }) => {
    if (!payload?.id || !payload?.data) return;
    try {
      const norm = normalizeDayData(payload.data);
      const incomingJson = JSON.stringify(norm);
      const currentLocal = localStorage.getItem(dayKey(payload.id));

      // If identical, do nothing (prevents infinite sync ping-pong loop)
      if (currentLocal === incomingJson) return;

      isApplyingRemoteUpdate.current = true;
      localStorage.setItem(dayKey(payload.id), incomingJson);

      if (payload.id === currentId) {
        lastSavedJson.current = incomingJson;
        setState(norm);
      }
      showStatus('همگام شد ✓');
      setTimeout(() => {
        isApplyingRemoteUpdate.current = false;
      }, 500);
    } catch (e) {
      isApplyingRemoteUpdate.current = false;
    }
  };

  const handleReceiveDayDelete = (payload: { id: string }) => {
    if (!payload?.id) return;
    localStorage.removeItem(dayKey(payload.id));
    setDaysIndex((prev) => prev.filter((x) => x.id !== payload.id));
  };

  // Auth Listener
  useEffect(() => {
    const unsub = supabase.onAuthStateChange((session) => {
      setUserEmail(session?.user?.email || null);
      if (session?.user?.id) {
        syncFromCloud();
      }
    });
    return () => unsub();
  }, []);

  const syncFromCloud = async () => {
    try {
      showStatus('همگام‌سازی ابری...');
      const res = await supabase.fetchAllUserPlans();

      // If user has local data but cloud is empty, upload local data to cloud
      if (res.data && res.data.length === 0 && daysIndex.length > 0) {
        showStatus('آپلود اطلاعات به ابر...');
        for (const entry of daysIndex) {
          const raw = localStorage.getItem(dayKey(entry.id));
          if (raw) {
            const parsed = JSON.parse(raw);
            await supabase.upsertUserPlan({
              id: entry.id,
              day: parsed.day || '',
              date: parsed.date || '',
              favorite: !!parsed.favorite,
              blocks: parsed.blocks || [],
              checklist: parsed.checklist || [],
              routine: parsed.routine || [],
              transfer: parsed.transfer || [],
              updated_at: entry.updatedAt || Date.now()
            });
          }
        }
        showStatus('اطلاعات به ابر ارسال شد ✓');
        return;
      }

      if (res.data && res.data.length > 0) {
        const cloudIndex: DayIndexEntry[] = [];
        res.data.forEach((p: any) => {
          const id = p.id;
          const planData: DayData = {
            day: p.day || '',
            date: p.date || '',
            favorite: !!p.favorite,
            blocks: p.blocks || [],
            checklist: p.checklist || [],
            routine: p.routine || [],
            transfer: p.transfer || []
          };
          localStorage.setItem(dayKey(id), JSON.stringify(planData));
          cloudIndex.push({
            id,
            day: p.day || '',
            date: p.date || '',
            updatedAt: p.updated_at || Date.now()
          });
        });

        cloudIndex.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        localStorage.setItem(KEY_INDEX, JSON.stringify(cloudIndex));
        setDaysIndex(cloudIndex);

        if (cloudIndex.length > 0) {
          const firstId = cloudIndex[0].id;
          const raw = localStorage.getItem(dayKey(firstId));
          if (raw) {
            setCurrentId(firstId);
            setState(normalizeDayData(JSON.parse(raw)));
            localStorage.setItem(KEY_CURRENT, firstId);
          }
        }
        showStatus('همگام با ابر ✓');
      }
    } catch (e) {
      console.error('Sync failed:', e);
      showStatus('خطا در همگام‌سازی');
    }
  };

  const handleSignOut = async () => {
    await supabase.signOut();
    setUserEmail(null);
    showStatus('از حساب خارج شدید');
  };

  // Capture PWA install prompt
  useEffect(() => {
    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallApp = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };

  const showStatus = (msg: string) => {
    setSaveStatus(msg);
    clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => {
      setSaveStatus('');
    }, 1800);
  };

  // Persist current day to localStorage and cloud
  const saveCurrentData = useCallback((data: DayData, id: string) => {
    try {
      const serialized = JSON.stringify(data);
      if (lastSavedJson.current === serialized) {
        return; // Nothing changed, skip saving and flashing status
      }
      lastSavedJson.current = serialized;

      localStorage.setItem(dayKey(id), serialized);

      // Also persist the routine template so any future day gets the latest routine text
      if (Array.isArray(data.routine)) {
        const routineTexts = data.routine.map((r) => r.text || '');
        localStorage.setItem(KEY_SAVED_ROUTINE, JSON.stringify(routineTexts));
      }

      setDaysIndex((prev) => {
        const next = [...prev];
        const idx = next.findIndex((x) => x.id === id);
        const entry: DayIndexEntry = {
          id,
          day: data.day,
          date: data.date,
          updatedAt: Date.now()
        };
        if (idx >= 0) {
          next[idx] = entry;
        } else {
          next.unshift(entry);
        }
        localStorage.setItem(KEY_INDEX, JSON.stringify(next));
        return next;
      });
      localStorage.setItem(KEY_CURRENT, id);
      showStatus('ذخیره شد ✓');

      // Broadcast real-time change to connected peers only if not receiving
      if (!isApplyingRemoteUpdate.current) {
        p2pSync.broadcast({
          type: 'DAY_UPDATE',
          payload: { id, data },
          timestamp: Date.now()
        });
      }
    } catch (e) {
      console.error('Failed to save data to localStorage:', e);
      showStatus('خطا در ذخیره!');
    }
  }, []);

  // Debounced auto-save whenever state changes
  useEffect(() => {
    if (!state || !currentId || loading || isApplyingRemoteUpdate.current) return;

    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveCurrentData(state, currentId);
    }, 500);

    return () => clearTimeout(saveTimer.current);
  }, [state, currentId, loading, saveCurrentData]);

  // Initial Load
  useEffect(() => {
    try {
      // 1. Check v2 index first
      let rawIndex = localStorage.getItem(KEY_INDEX);
      let parsedIndex: DayIndexEntry[] = rawIndex ? JSON.parse(rawIndex) : [];

      // 2. If v2 empty, check if there was old v1 data and clean it up or migrate
      if (parsedIndex.length === 0) {
        // Clean start with new schema (1 block, 5 tasks)
        const newId = 'day_' + Date.now();
        const freshData = createDefaultDayData();
        const entry: DayIndexEntry = {
          id: newId,
          day: '',
          date: '',
          updatedAt: Date.now()
        };
        localStorage.setItem(KEY_INDEX, JSON.stringify([entry]));
        localStorage.setItem(KEY_CURRENT, newId);
        localStorage.setItem(dayKey(newId), JSON.stringify(freshData));
        setDaysIndex([entry]);
        setCurrentId(newId);
        setState(freshData);
        setLoading(false);
        return;
      }

      setDaysIndex(parsedIndex);
      const savedCid = localStorage.getItem(KEY_CURRENT);
      let targetId = savedCid;

      if (!targetId && parsedIndex.length > 0) {
        parsedIndex.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        targetId = parsedIndex[0].id;
      }

      if (targetId) {
        const rawData = localStorage.getItem(dayKey(targetId));
        if (rawData) {
          try {
            const parsed = JSON.parse(rawData);
            const completeData = normalizeDayData(parsed);
            setCurrentId(targetId);
            setState(completeData);
            setLoading(false);
            return;
          } catch (err) {
            console.error('Error parsing stored day:', err);
          }
        }
      }

      // Fallback fresh day
      const newId = 'day_' + Date.now();
      const freshData = createDefaultDayData();
      const entry: DayIndexEntry = {
        id: newId,
        day: '',
        date: '',
        updatedAt: Date.now()
      };
      localStorage.setItem(KEY_INDEX, JSON.stringify([entry]));
      localStorage.setItem(KEY_CURRENT, newId);
      localStorage.setItem(dayKey(newId), JSON.stringify(freshData));
      setDaysIndex([entry]);
      setCurrentId(newId);
      setState(freshData);
    } catch (e) {
      console.error('Initialization error:', e);
      const fresh = createDefaultDayData();
      setState(fresh);
      setCurrentId('day_default');
    } finally {
      setLoading(false);
    }
  }, []);

  // Actions
  const handleNewDay = () => {
    if (
      window.confirm(
        'برای شروع یک برگه جدید (مثلاً برای فردا)، برگه فعلی ذخیره و برگه‌ای تازه باز می‌شود. آیا کارهای "انتقال به فردا" به چک‌لیست روز جدید منتقل شوند؟'
      )
    ) {
      const newId = 'day_' + Date.now();
      const fresh = createDefaultDayData();

      // Copy latest routine titles into the new day (unchecked)
      if (state && Array.isArray(state.routine)) {
        fresh.routine = state.routine.map((r) => ({ text: r.text || '', done: false }));
      } else {
        const savedRoutine = localStorage.getItem(KEY_SAVED_ROUTINE);
        if (savedRoutine) {
          try {
            const texts: string[] = JSON.parse(savedRoutine);
            fresh.routine = texts.map((t) => ({ text: t || '', done: false }));
          } catch (e) {}
        }
      }

      // Carry over non-empty uncompleted or all transfer tasks to tomorrow's checklist
      if (state && Array.isArray(state.transfer)) {
        const transferTasks = state.transfer
          .filter((t) => t.text.trim().length > 0)
          .map((t) => ({ text: t.text, done: false }));

        if (transferTasks.length > 0) {
          // Put carried over tasks first, then fill up with empty slots if < 5
          const remainingSlots = Math.max(0, 5 - transferTasks.length);
          fresh.checklist = [
            ...transferTasks,
            ...Array.from({ length: remainingSlots }, () => ({ text: '', done: false }))
          ];
        }
      }

      const newEntry: DayIndexEntry = {
        id: newId,
        day: '',
        date: '',
        updatedAt: Date.now()
      };
      const updatedIndex = [newEntry, ...daysIndex];
      setDaysIndex(updatedIndex);
      setCurrentId(newId);
      setState(fresh);
      localStorage.setItem(KEY_INDEX, JSON.stringify(updatedIndex));
      localStorage.setItem(KEY_CURRENT, newId);
      localStorage.setItem(dayKey(newId), JSON.stringify(fresh));
      showStatus('برگه جدید با روتین‌ها و تسک‌های منتقل‌شده آماده شد ✓');
    }
  };

  const handleDeleteDay = () => {
    if (!currentId) return;
    if (window.confirm('این برگه برای همیشه حذف شود؟ این کار قابل بازگشت نیست.')) {
      localStorage.removeItem(dayKey(currentId));
      const remaining = daysIndex.filter((x) => x.id !== currentId);
      setDaysIndex(remaining);
      localStorage.setItem(KEY_INDEX, JSON.stringify(remaining));

      if (remaining.length > 0) {
        remaining.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        const nextId = remaining[0].id;
        const raw = localStorage.getItem(dayKey(nextId));
        const data = raw ? JSON.parse(raw) : createDefaultDayData();
        setCurrentId(nextId);
        setState(data);
        localStorage.setItem(KEY_CURRENT, nextId);
      } else {
        const newId = 'day_' + Date.now();
        const fresh = createDefaultDayData();
        const entry = { id: newId, day: '', date: '', updatedAt: Date.now() };
        setDaysIndex([entry]);
        setCurrentId(newId);
        setState(fresh);
        localStorage.setItem(KEY_INDEX, JSON.stringify([entry]));
        localStorage.setItem(KEY_CURRENT, newId);
        localStorage.setItem(dayKey(newId), JSON.stringify(fresh));
      }
      showStatus('حذف شد');
    }
  };

  const handleSelectDay = (id: string) => {
    if (id === currentId) return;
    const raw = localStorage.getItem(dayKey(id));
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const completeData = normalizeDayData(parsed);
        setCurrentId(id);
        setState(completeData);
        localStorage.setItem(KEY_CURRENT, id);
      } catch (e) {
        console.error('Failed to load day', id, e);
      }
    }
  };

  const handleExportBackup = () => {
    try {
      const allData: Record<string, any> = {
        daysIndex,
        days: {}
      };
      for (const entry of daysIndex) {
        const d = localStorage.getItem(dayKey(entry.id));
        if (d) allData.days[entry.id] = JSON.parse(d);
      }
      const blob = new Blob([JSON.stringify(allData, null, 2)], {
        type: 'application/json;charset=utf-8'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `konkour-planner-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showStatus('پشتیبان دانلود شد ✓');
    } catch (e) {
      console.error(e);
      alert('خطا در ایجاد فایل پشتیبان');
    }
  };

  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        if (parsed.daysIndex && parsed.days) {
          localStorage.setItem(KEY_INDEX, JSON.stringify(parsed.daysIndex));
          for (const [k, v] of Object.entries(parsed.days)) {
            localStorage.setItem(dayKey(k), JSON.stringify(v));
          }
          setDaysIndex(parsed.daysIndex);
          if (parsed.daysIndex.length > 0) {
            const firstId = parsed.daysIndex[0].id;
            setCurrentId(firstId);
            setState(parsed.days[firstId]);
            localStorage.setItem(KEY_CURRENT, firstId);
          }
          showStatus('بازیابی انجام شد ✓');
        } else {
          alert('فایل پشتیبان معتبر نیست!');
        }
      } catch (err) {
        console.error(err);
        alert('خطا در خواندن فایل!');
      }
    };
    reader.readAsText(file);
  };

  // State update handlers
  const updateBlock = (index: number, updated: Partial<StudyBlock>) => {
    if (!state) return;
    const blocks = [...state.blocks];
    blocks[index] = { ...blocks[index], ...updated };
    setState({ ...state, blocks });
  };

  const handleAddBlock = () => {
    if (!state) return;
    setState({
      ...state,
      blocks: [...state.blocks, createEmptyBlock()]
    });
  };

  const handleDeleteBlock = (index: number) => {
    if (!state || state.blocks.length <= 1) return;
    const blocks = state.blocks.filter((_, i) => i !== index);
    setState({ ...state, blocks });
  };

  if (loading || !state) {
    return <div className="loading">در حال بارگذاری...</div>;
  }

  const totalStudyTime = calculateTotalStudyTime(state.blocks);

  return (
    <div>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImportFile}
        accept=".json"
        style={{ display: 'none' }}
      />
      <P2PSyncModal
        isOpen={isP2POpen}
        onClose={() => setIsP2POpen(false)}
        onPerformFullSync={broadcastFullSync}
      />
      <Toolbar
        days={daysIndex}
        currentId={currentId}
        saveStatus={saveStatus}
        installPrompt={installPrompt}
        isP2PConnected={isP2PConnected}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onSelectDay={handleSelectDay}
        onNewDay={handleNewDay}
        onDeleteDay={handleDeleteDay}
        onExport={handleExportBackup}
        onImport={handleImportClick}
        onInstall={handleInstallApp}
        onOpenP2PModal={() => setIsP2POpen(true)}
      />

      <div className="sheet-wrap">
        <div className="sheet">
          <ReportHeader
            day={state.day}
            date={state.date}
            onDayChange={(day) => setState({ ...state, day })}
            onDateChange={(date) => setState({ ...state, date })}
          />

          <div className={`main-grid show-${activeTab}`}>
            <div className="blocks-col">
              {state.blocks.map((block, i) => (
                <StudyBlockItem
                  key={i}
                  index={i}
                  block={block}
                  canDelete={state.blocks.length > 1}
                  onChange={(upd) => updateBlock(i, upd)}
                  onDelete={() => handleDeleteBlock(i)}
                />
              ))}

              <button
                type="button"
                className="btn-add-block"
                onClick={handleAddBlock}
              >
                + افزودن بازه مطالعاتی جدید
              </button>
            </div>

            <div className="side-col">
              <ChecklistCard
                checklist={state.checklist}
                onChange={(checklist) => setState({ ...state, checklist })}
              />

              <RoutineCard
                routine={state.routine}
                onChange={(routine) => setState({ ...state, routine })}
              />

              <TransferCard
                transfer={state.transfer}
                onChange={(transfer) => setState({ ...state, transfer })}
              />

              <TotalCard
                totalHours={totalStudyTime}
                favorite={state.favorite}
                onFavoriteChange={(favorite) => setState({ ...state, favorite })}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
