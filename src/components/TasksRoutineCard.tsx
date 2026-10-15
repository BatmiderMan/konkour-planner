import React from 'react';
import { ChecklistItem, RoutineItem } from '../types';

interface TasksRoutineCardProps {
  checklist: ChecklistItem[];
  routine: RoutineItem[];
  transfer: ChecklistItem[];
  onChangeChecklist: (items: ChecklistItem[]) => void;
  onChangeRoutine: (items: RoutineItem[]) => void;
  onChangeTransfer: (items: ChecklistItem[]) => void;
}

type TaskType = 'checklist' | 'routine' | 'transfer';

const TYPE_META: Record<TaskType, { label: string; icon: string; placeholder: string; addLabel: string; emptyLabel: string }> = {
  checklist: {
    label: 'چک‌لیست روزانه',
    icon: '📋',
    placeholder: 'کار روزانه...',
    addLabel: '+ افزودن کار',
    emptyLabel: 'هنوز کاری اضافه نشده'
  },
  routine: {
    label: 'روتین و شبانه',
    icon: '🔁',
    placeholder: 'کار روتین...',
    addLabel: '+ افزودن روتین',
    emptyLabel: 'هنوز روتینی اضافه نشده'
  },
  transfer: {
    label: 'انتقال به فردا',
    icon: '⏭',
    placeholder: 'کار برای فردا...',
    addLabel: '+ افزودن به فردا',
    emptyLabel: 'چیزی برای فردا نمانده'
  }
};

export const TasksRoutineCard: React.FC<TasksRoutineCardProps> = ({
  checklist,
  routine,
  transfer,
  onChangeChecklist,
  onChangeRoutine,
  onChangeTransfer
}) => {
  const lists: Record<TaskType, ChecklistItem[] | RoutineItem[]> = { checklist, routine, transfer };
  const setters: Record<TaskType, (items: any[]) => void> = {
    checklist: onChangeChecklist,
    routine: onChangeRoutine,
    transfer: onChangeTransfer
  };

  const firstNonEmpty = (Object.keys(lists) as TaskType[]).find((t) => lists[t].length > 0);
  const [activeType, setActiveType] = React.useState<TaskType>(firstNonEmpty || 'checklist');

  const activeList = lists[activeType];
  const setActiveList = setters[activeType];
  const meta = TYPE_META[activeType];

  const handleTextChange = (index: number, text: string) => {
    const updated = [...activeList];
    updated[index] = { ...updated[index], text };
    setActiveList(updated);
  };

  const handleDoneToggle = (index: number, done: boolean) => {
    const updated = [...activeList];
    updated[index] = { ...updated[index], done };
    setActiveList(updated);
  };

  const handleDelete = (index: number) => {
    setActiveList(activeList.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    setActiveList([...activeList, { text: '', done: false }]);
  };

  return (
    <div className="side-card tasks-routine-card">
      <div className="tab tab-teal" />
      <div className="trc-type-switch">
        {(Object.keys(TYPE_META) as TaskType[]).map((t) => (
          <button
            key={t}
            type="button"
            className={'trc-type-btn' + (activeType === t ? ' active' : '')}
            onClick={() => setActiveType(t)}
          >
            <span className="trc-type-icon">{TYPE_META[t].icon}</span>
            <span className="trc-type-label">{TYPE_META[t].label}</span>
            {lists[t].length > 0 && <span className="trc-type-count">{lists[t].length}</span>}
          </button>
        ))}
      </div>

      <div className="trc-list">
        {activeList.length === 0 && <div className="trc-empty">{meta.emptyLabel}</div>}
        {activeList.map((item, i) => (
          <div className="trc-line-row" key={i}>
            <input
              type="checkbox"
              checked={item.done}
              onChange={(e) => handleDoneToggle(i, e.target.checked)}
            />
            <input
              type="text"
              className="line-input"
              value={item.text}
              onChange={(e) => handleTextChange(i, e.target.value)}
              placeholder={meta.placeholder}
            />
            <button type="button" className="trc-del-btn" title="حذف" onClick={() => handleDelete(i)}>
              ×
            </button>
          </div>
        ))}
      </div>

      <button type="button" className="add-line-btn" onClick={handleAdd}>
        {meta.addLabel}
      </button>
    </div>
  );
};
