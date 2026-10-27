import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';

export interface CountryDialOption {
  iso: string;
  name: string;
  dialCode: string;
  placeholder: string;
}

export const COUNTRY_DIAL_OPTIONS: CountryDialOption[] = [
  { iso: 'IN', name: 'India', dialCode: '+91', placeholder: '98765 43210' },
  { iso: 'US', name: 'United States', dialCode: '+1', placeholder: '555 234 5678' },
  { iso: 'GB', name: 'United Kingdom', dialCode: '+44', placeholder: '7911 123456' },
  { iso: 'AE', name: 'United Arab Emirates', dialCode: '+971', placeholder: '50 123 4567' },
  { iso: 'SG', name: 'Singapore', dialCode: '+65', placeholder: '8123 4567' },
  { iso: 'AU', name: 'Australia', dialCode: '+61', placeholder: '412 345 678' },
  { iso: 'CA', name: 'Canada', dialCode: '+1', placeholder: '416 555 0199' },
  { iso: 'DE', name: 'Germany', dialCode: '+49', placeholder: '1512 3456789' },
  { iso: 'FR', name: 'France', dialCode: '+33', placeholder: '6 12 34 56 78' },
  { iso: 'JP', name: 'Japan', dialCode: '+81', placeholder: '90 1234 5678' },
  { iso: 'KR', name: 'South Korea', dialCode: '+82', placeholder: '10 1234 5678' },
  { iso: 'BR', name: 'Brazil', dialCode: '+55', placeholder: '11 91234 5678' },
  { iso: 'MX', name: 'Mexico', dialCode: '+52', placeholder: '55 1234 5678' },
  { iso: 'SA', name: 'Saudi Arabia', dialCode: '+966', placeholder: '50 123 4567' },
  { iso: 'ZA', name: 'South Africa', dialCode: '+27', placeholder: '71 123 4567' },
  { iso: 'NG', name: 'Nigeria', dialCode: '+234', placeholder: '802 123 4567' },
  { iso: 'KE', name: 'Kenya', dialCode: '+254', placeholder: '712 123456' },
  { iso: 'ID', name: 'Indonesia', dialCode: '+62', placeholder: '812 3456 7890' },
  { iso: 'MY', name: 'Malaysia', dialCode: '+60', placeholder: '12 345 6789' },
  { iso: 'PH', name: 'Philippines', dialCode: '+63', placeholder: '917 123 4567' },
  { iso: 'TH', name: 'Thailand', dialCode: '+66', placeholder: '81 234 5678' },
  { iso: 'VN', name: 'Vietnam', dialCode: '+84', placeholder: '91 234 56 78' },
  { iso: 'NP', name: 'Nepal', dialCode: '+977', placeholder: '984 1234567' },
  { iso: 'LK', name: 'Sri Lanka', dialCode: '+94', placeholder: '71 234 5678' },
  { iso: 'BD', name: 'Bangladesh', dialCode: '+880', placeholder: '1712 345678' },
  { iso: 'NZ', name: 'New Zealand', dialCode: '+64', placeholder: '21 123 4567' },
  { iso: 'IT', name: 'Italy', dialCode: '+39', placeholder: '312 345 6789' },
  { iso: 'ES', name: 'Spain', dialCode: '+34', placeholder: '612 34 56 78' },
  { iso: 'NL', name: 'Netherlands', dialCode: '+31', placeholder: '6 12345678' },
  { iso: 'SE', name: 'Sweden', dialCode: '+46', placeholder: '70 123 45 67' },
  { iso: 'CH', name: 'Switzerland', dialCode: '+41', placeholder: '78 123 45 67' },
  { iso: 'IE', name: 'Ireland', dialCode: '+353', placeholder: '85 123 4567' },
];

interface CountryCodeSelectProps {
  selectedIso: string;
  onSelect: (country: CountryDialOption) => void;
  disabled?: boolean;
  isDark?: boolean;
  id?: string;
}

export const CountryCodeSelect: React.FC<CountryCodeSelectProps> = ({
  selectedIso,
  onSelect,
  disabled = false,
  isDark = true,
  id = 'country-code-select',
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const selected =
    COUNTRY_DIAL_OPTIONS.find((c) => c.iso === selectedIso) || COUNTRY_DIAL_OPTIONS[0];

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 20);
    } else {
      setSearch('');
    }
  }, [open]);

  const filtered = COUNTRY_DIAL_OPTIONS.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.dialCode.includes(q) ||
      c.iso.toLowerCase().includes(q)
    );
  });

  return (
    <div ref={wrapperRef} className="relative shrink-0">
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Country code ${selected.name} ${selected.dialCode}`}
        onClick={() => setOpen((o) => !o)}
        className={`h-11 px-3 rounded-xl border flex items-center gap-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a884] disabled:opacity-50 ${
          isDark
            ? 'bg-[#202c33] border-slate-700 text-white hover:border-slate-500'
            : 'bg-slate-50 border-slate-300 text-slate-900 hover:border-slate-400'
        }`}
      >
        <span className="text-xs font-bold tracking-wider px-1.5 py-0.5 rounded bg-[#00a884]/15 text-[#00a884]">
          {selected.iso}
        </span>
        <span className="tabular-nums">{selected.dialCode}</span>
        <ChevronDown className="w-4 h-4 text-slate-400" />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Select country code"
          className={`absolute left-0 top-12 w-72 rounded-xl shadow-2xl border z-50 overflow-hidden ${
            isDark
              ? 'bg-[#202c33] border-slate-700 text-white'
              : 'bg-white border-slate-200 text-slate-900'
          }`}
        >
          <div
            className={`p-2.5 border-b flex items-center gap-2 ${
              isDark ? 'border-slate-700/80 bg-[#182229]' : 'border-slate-200 bg-slate-50'
            }`}
          >
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setOpen(false);
              }}
              placeholder="Search country or +code..."
              aria-label="Search country code"
              className="w-full bg-transparent text-xs outline-none placeholder-slate-400"
            />
          </div>

          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-xs text-slate-400 text-center">
                No matching countries
              </div>
            ) : (
              filtered.map((country) => {
                const isSelected = country.iso === selected.iso;
                return (
                  <button
                    key={country.iso}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onSelect(country);
                      setOpen(false);
                    }}
                    className={`w-full px-3.5 py-2 text-left text-xs flex items-center justify-between transition-colors ${
                      isSelected
                        ? 'bg-[#00a884]/15 text-[#00a884] font-semibold'
                        : isDark
                        ? 'hover:bg-[#2a3942] text-slate-200'
                        : 'hover:bg-slate-100 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-7 text-[11px] font-bold text-slate-400 shrink-0">
                        {country.iso}
                      </span>
                      <span className="truncate">{country.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="tabular-nums font-medium text-slate-400">
                        {country.dialCode}
                      </span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-[#00a884]" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
