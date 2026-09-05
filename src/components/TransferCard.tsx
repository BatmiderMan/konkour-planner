import React from 'react';
import { ChecklistItem } from '../types';

interface TransferCardProps {
  transfer: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
}

export const TransferCard: React.FC<TransferCardProps> = ({ transfer, onChange }) => {
  const handleItemTextChange = (index: number, text: string) => {
    const updated = [...transfer];
    updated[index] = { ...updated[index], text };
    onChange(updated);
  };

  const handleItemDoneToggle = (index: number, done: boolean) => {
    const updated = [...transfer];
    updated[index] = { ...updated[index], done };
    onChange(updated);
  };

  const handleAddLine = () => {
    onChange([...transfer, { text: '', done: false }]);
  };

  return (
    <div className="side-card">
      <div className="tab tab-yellow" />
      <h2>انتقال به فردا (تسک‌ها)</h2>
      {transfer.map((item, i) => (
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
            placeholder="کار برای انتقال به فردا..."
          />
        </div>
      ))}
      <button type="button" className="add-line-btn" onClick={handleAddLine}>
        + افزودن کار برای فردا
      </button>
    </div>
  );
};

