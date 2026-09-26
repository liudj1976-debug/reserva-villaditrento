import React, { useState } from 'react';
import { Reservation, Space, BlockedDate } from '../types';
import { triggerHaptic } from '../utils/helpers';

interface CalendarProps {
  space: Space;
  reservations: Reservation[];
  blockedDates: BlockedDate[];
  availability: { spaceName: string; date: string }[];
  onSelectDate: (date: string) => void;
  selectedDate: string | null;
}

export const Calendar: React.FC<CalendarProps> = ({ space, reservations, blockedDates, availability, onSelectDate, selectedDate }) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));

  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i + 1));

  const isBooked = (date: Date) => { const value = date.toISOString().split('T')[0]; return availability.some(a => a.spaceName === space.name && a.date === value) || reservations.some(r => r.spaceName === space.name && r.date === value); };
  const isMaintenance = (date: Date) => blockedDates.some(b => b.spaceName === space.name && b.date === date.toISOString().split('T')[0]);

  return (
    <div className="bg-gray-50 dark:bg-neutral-800 p-4 rounded-xl shadow-inner border dark:border-neutral-700">
      <div className="flex justify-between items-center mb-6">
        <button onClick={() => { triggerHaptic(); prevMonth(); }} className="p-3 rounded-full hover:bg-white dark:hover:bg-neutral-700 shadow-sm transition"><i className="fas fa-chevron-left"></i></button>
        <h4 className="font-bold text-gray-800 dark:text-gray-100 capitalize">{currentMonth.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}</h4>
        <button onClick={() => { triggerHaptic(); nextMonth(); }} className="p-3 rounded-full hover:bg-white dark:hover:bg-neutral-700 shadow-sm transition"><i className="fas fa-chevron-right"></i></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-gray-400 mb-4">
        {['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'].map((day, i) => <div key={i} className="uppercase">{day}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`empty-${i}`}></div>)}
        {monthDays.map(day => {
          const dateString = day.toISOString().split('T')[0];
          const booked = isBooked(day);
          const maintenance = isMaintenance(day);
          const isPast = day < today;
          const isSelected = dateString === selectedDate;
          const isDisabled = booked || maintenance || isPast;

          return (
            <button
              key={dateString}
              onClick={() => { triggerHaptic(); onSelectDate(dateString); }}
              disabled={isDisabled}
              className={`
                aspect-square rounded-lg flex items-center justify-center text-sm font-bold transition-all relative
                ${isDisabled ? 'cursor-not-allowed' : 'hover:scale-110 shadow-sm'}
                ${isSelected ? 'bg-green-600 text-white shadow-lg shadow-green-500/20 scale-105 z-10' :
                  maintenance ? 'bg-gray-300 dark:bg-neutral-700 text-gray-500 opacity-100' :
                  booked ? 'bg-red-50 dark:bg-red-900/10 text-red-400 opacity-100' :
                  isPast ? 'text-gray-300 dark:text-gray-600 opacity-50' :
                  'bg-white dark:bg-neutral-700 text-gray-700 dark:text-gray-200 border dark:border-white/5'}
              `}
            >
              {day.getDate()}
              {booked && <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 border-2 border-white dark:border-neutral-800 rounded-full animate-pulse"></div>}
              {maintenance && <div className="absolute -top-1 -right-1 w-3 h-3 bg-gray-500 border-2 border-white dark:border-neutral-800 rounded-full"></div>}
            </button>
          );
        })}
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-4 text-[10px] font-bold uppercase tracking-tighter">
        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-white dark:bg-neutral-700 border rounded"></div> Disponível</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-red-100 dark:bg-red-900/30 rounded"></div> Reservado</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-gray-300 dark:bg-neutral-900 rounded"></div> Manutenção</div>
      </div>
    </div>
  );
};
