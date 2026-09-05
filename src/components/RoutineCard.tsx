import React from 'react';
import { RoutineItem } from '../types';

interface RoutineCardProps {
  routine: RoutineItem[];
  onChange: (items: RoutineItem[]) => void;
}

export const RoutineCard: React.FC<RoutineCardProps> = ({ routine, onChange }) => {
  const handleItemTextChange = (index: number, text: string) => {
    const updated = [...routine];
    updated[index] = { ...updated[index], text };
    onChange(updated);
  };

  const handleItemDoneToggle = (index: number, done: boolean) => {
    const updated = [...routine];
    updated[index] = { ...updated[index], done };
    onChange(updated);
  };

  return (
    <div className="side-card">
      <div className="tab tab-teal" />
      <h2>کار روتین و شبانه</h2>
      <div className="routine-grid">
        {routine.map((item, i) => (
          <div className="routine-item" key={i}>
            <input
              type="checkbox"
              checked={item.done}
              onChange={(e) => handleItemDoneToggle(i, e.target.checked)}
            />
            <input
              type="text"
              className="dot-input"
              value={item.text}
              onChange={(e) => handleItemTextChange(i, e.target.value)}
              placeholder="کار روتین..."
            />
          </div>
        ))}
      </div>
    </div>
  );
};
