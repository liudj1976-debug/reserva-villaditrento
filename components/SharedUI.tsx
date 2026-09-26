import React from 'react';

export const InputPadrao = (props: React.InputHTMLAttributes<HTMLInputElement> & { icon?: string; label?: string; error?: string }) => (
  <div className="mb-4">
    {props.label && <label className="block text-sm font-bold text-gray-500 mb-2">{props.label}</label>}
    <div className="relative">
      {props.icon && <i className={`fas ${props.icon} absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 z-10`}></i>}
      <input
        {...props}
        className={`w-full ${props.icon ? 'pl-12' : 'pl-4'} pr-4 py-4 border rounded-xl bg-white dark:bg-neutral-800 dark:border-neutral-700 outline-none transition-all ${props.error ? 'border-red-500 ring-2 ring-red-100 dark:ring-red-900/20' : 'focus:ring-2 focus:ring-green-500'} ${props.className || ''}`}
      />
    </div>
    {props.error && <p className="text-red-500 text-xs mt-1 font-bold">{props.error}</p>}
  </div>
);

export const SelectPadrao = (props: React.SelectHTMLAttributes<HTMLSelectElement> & { icon?: string; label?: string; options: {label: string, value: string}[]; error?: string }) => (
  <div className="mb-4">
    {props.label && <label className="block text-sm font-bold text-gray-500 mb-2">{props.label}</label>}
    <div className="relative">
      {props.icon && <i className={`fas ${props.icon} absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 z-10`}></i>}
      <select
        {...props}
        className={`w-full ${props.icon ? 'pl-12' : 'pl-4'} pr-10 py-4 border rounded-xl bg-white dark:bg-neutral-800 dark:border-neutral-700 outline-none transition-all appearance-none ${props.error ? 'border-red-500 ring-2 ring-red-100 dark:ring-red-900/20' : 'focus:ring-2 focus:ring-green-500'} ${props.className || ''}`}
      >
        <option value="" disabled hidden>Selecione...</option>
        {props.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <i className="fas fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"></i>
    </div>
    {props.error && <p className="text-red-500 text-xs mt-1 font-bold">{props.error}</p>}
  </div>
);

export const BotaoPadrao = ({ variant = 'primary', icon, children, loading, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary'|'secondary'|'danger'|'outline', icon?: string, loading?: boolean }) => {
  const base = "w-full py-4 rounded-xl font-bold text-lg shadow-sm transition disabled:opacity-50 flex justify-center items-center gap-2";
  const variants = {
    primary: "bg-green-600 hover:bg-green-700 text-white",
    secondary: "bg-blue-600 hover:bg-blue-700 text-white",
    danger: "bg-red-500 hover:bg-red-600 text-white",
    outline: "border-2 border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-gray-300 hover:border-gray-300",
  };
  return (
    <button {...props} className={`${base} ${variants[variant]} ${props.className || ''}`} disabled={props.disabled || loading}>
      {loading ? <i className="fas fa-spinner fa-spin"></i> : icon && <i className={`fas ${icon}`}></i>}
      {!loading && children}
    </button>
  );
};

export const CardPadrao = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => (
  <div className={`glassmorphism p-6 md:p-8 rounded-2xl shadow-sm border border-black/5 dark:border-white/5 animate-fade-in ${className}`}>
    {children}
  </div>
);
