/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className = '', id, value, defaultValue, ...props }, ref) => {
    const inputId = id || `input-${label.replace(/\s+/g, '-').toLowerCase()}`;

    // Guarantee that controlled inputs never receive undefined or null, which causes React's
    // "changing a controlled input to be uncontrolled" or "uncontrolled to controlled" warning.
    const isUncontrolled = defaultValue !== undefined && value === undefined;
    const safeValue = isUncontrolled ? undefined : (value !== undefined && value !== null ? value : '');

    return (
      <div className="w-full text-right">
        <label htmlFor={inputId} className="block text-xs font-medium text-slate-300 mb-1.5">
          {label} {props.required && <span className="text-rose-400">*</span>}
        </label>
        <input
          ref={ref}
          id={inputId}
          {...(isUncontrolled ? { defaultValue } : { value: safeValue })}
          className={`w-full px-3.5 py-2 text-sm bg-slate-950 border rounded-lg text-slate-100 placeholder:text-slate-500 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 ${
            error ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/40' : 'border-slate-800'
          } ${className}`}
          {...props}
        />
        {error ? (
          <p className="text-xs text-rose-400 mt-1">{error}</p>
        ) : helperText ? (
          <p className="text-xs text-slate-500 mt-1">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: { value: string; label: string }[];
  error?: string;
  helperText?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, error, helperText, className = '', id, value, defaultValue, ...props }, ref) => {
    const selectId = id || `select-${label.replace(/\s+/g, '-').toLowerCase()}`;
    const isUncontrolled = defaultValue !== undefined && value === undefined;
    const safeValue = isUncontrolled ? undefined : (value !== undefined && value !== null ? value : '');

    return (
      <div className="w-full text-right">
        <label htmlFor={selectId} className="block text-xs font-medium text-slate-300 mb-1.5">
          {label} {props.required && <span className="text-rose-400">*</span>}
        </label>
        <select
          ref={ref}
          id={selectId}
          {...(isUncontrolled ? { defaultValue } : { value: safeValue })}
          className={`w-full px-3.5 py-2 text-sm bg-slate-950 border rounded-lg text-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 ${
            error ? 'border-rose-500' : 'border-slate-800'
          } ${className}`}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-100">
              {opt.label}
            </option>
          ))}
        </select>
        {error ? (
          <p className="text-xs text-rose-400 mt-1">{error}</p>
        ) : helperText ? (
          <p className="text-xs text-slate-500 mt-1">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Select.displayName = 'Select';
