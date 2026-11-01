import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

export interface NormalizedPhoneResult {
  valid: boolean;
  e164?: string;
  countryCallingCode?: string;
  nationalNumber?: string;
  countryIso?: string;
  error?: string;
}

/**
 * Normalizes and validates mobile numbers into canonical E.164 international format
 * (e.g., "+919876543210"). Rejects malformed, too-short, or non-viable inputs.
 */
export function normalizeAndValidatePhone(
  rawInput: string,
  defaultCountryIso: CountryCode = 'IN',
  dialCodePrefix?: string
): NormalizedPhoneResult {
  if (!rawInput || typeof rawInput !== 'string') {
    return { valid: false, error: 'Mobile number is required.' };
  }

  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { valid: false, error: 'Mobile number is required.' };
  }

  // Reject inputs containing letters or unexpected symbols
  if (/[^0-9+\s\-().]/.test(trimmed)) {
    return { valid: false, error: 'Mobile number contains invalid characters.' };
  }

  let candidate = trimmed;
  if (!candidate.startsWith('+') && dialCodePrefix) {
    const cleanDial = dialCodePrefix.startsWith('+') ? dialCodePrefix : `+${dialCodePrefix}`;
    const digitsOnly = candidate.replace(/\D/g, '').replace(/^0+/, '');
    candidate = `${cleanDial}${digitsOnly}`;
  }

  const parsed = candidate.startsWith('+')
    ? parsePhoneNumberFromString(candidate)
    : parsePhoneNumberFromString(candidate, defaultCountryIso);

  if (!parsed || !parsed.isValid()) {
    return {
      valid: false,
      error: 'Please enter a valid mobile number for the selected country code.',
    };
  }

  const nationalDigits = parsed.nationalNumber.toString();
  // Additional strict check for Indian (+91) 10-digit mobile numbers (start with 6, 7, 8, or 9)
  if (parsed.countryCallingCode === '91') {
    if (!/^[6-9]\d{9}$/.test(nationalDigits)) {
      return {
        valid: false,
        error: 'Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.',
      };
    }
  }

  return {
    valid: true,
    e164: parsed.format('E.164'),
    countryCallingCode: `+${parsed.countryCallingCode}`,
    nationalNumber: nationalDigits,
    countryIso: parsed.country || defaultCountryIso,
  };
}

export interface NormalizedUsernameResult {
  valid: boolean;
  username?: string | null;
  error?: string;
}

export function normalizeAndValidateUsername(rawUsername?: string | null): NormalizedUsernameResult {
  if (rawUsername === undefined || rawUsername === null || rawUsername.trim() === '') {
    return { valid: true, username: null };
  }

  const cleaned = rawUsername.trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(cleaned)) {
    return {
      valid: false,
      error: 'Username must be 3–24 characters and contain only lowercase letters, numbers, or underscores.',
    };
  }

  return { valid: true, username: cleaned };
}
