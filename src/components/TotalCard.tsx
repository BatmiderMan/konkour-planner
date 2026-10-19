import React from 'react';

interface TotalCardProps {
  totalHours: string;
  favorite: boolean;
  onFavoriteChange: (fav: boolean) => void;
}

export const TotalCard: React.FC<TotalCardProps> = ({
  totalHours,
  favorite,
  onFavoriteChange
}) => {
  return (
    <div className="total-card">
      <span>
        جمع ساعت مطالعه: <b id="totalHoursVal">{totalHours}</b>
      </span>
      <span>
        <input
          type="checkbox"
          id="favHeart"
          className="heart-checkbox"
          checked={favorite}
          onChange={(e) => onFavoriteChange(e.target.checked)}
        />
        <label htmlFor="favHeart" className="heart-label" title="علامت‌گذاری به عنوان روز ویژه">
          ♥
        </label>
      </span>
    </div>
  );
};
