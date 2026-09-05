import React from 'react';
import { ChecklistItem } from '../types';

interface ChecklistCardProps {
  checklist: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
}

export const ChecklistCard: React.FC<ChecklistCardProps> = ({ checklist, onChange }) => {
  const handleItemTextChange = (index: number, text: string) => {
    const updated = [...checklist];
    updated[index] = { ...updated[index], text };
    onChange(updated);
  };

  const handleItemDoneToggle = (index: number, done: boolean) => {
    const updated = [...checklist];
    updated[index] = { ...updated[index], done };
    onChange(updated);
  };

  const handleAddLine = () => {
    onChange([...checklist, { text: '', done: false }]);
  };

  return (
    <div className="side-card">
      <div className="tab tab-teal" />
      <h2>چک لیست روزانه</h2>
      {checklist.map((item, i) => (
        <div className="line-row" key={i}>
          <input
            type="checkbox"
            checked={item.done}
            onChange={(e) => handleItemDoneToggle(i, e.target.checked)}
          />
          <input
            type="text"
            className="line-input"
            value={item.text}
            onChange={(e) => handleItemTextChange(i, e.target.value)}
            placeholder="کار روزانه..."
          />
        </div>
      ))}
      <button type="button" className="add-line-btn" onClick={handleAddLine}>
        + افزودن خط
      </button>
    </div>
  );
};
