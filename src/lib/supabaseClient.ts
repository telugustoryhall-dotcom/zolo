import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;

export function getBrowserSupabaseClient(): SupabaseClient | null {
  if (browserClient) return browserClient;

  // Read from Vite define or runtime window object
  const url =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
    'https://beqkcbugflzopzvzhkua.supabase.co';

  const anonKey =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlcWtjYnVnZmx6b3B6dnpoa3VhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxNzcxMzksImV4cCI6MjEwODc1MzEzOX0.hdKJpsnoYnw2622-Mam8qocJTzSL3vLr0TONLafq7s8';

  if (!url || !anonKey) {
    return null;
  }

  try {
    browserClient = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
    return browserClient;
  } catch (error) {
    console.warn('Failed to initialize browser Supabase client:', error);
    return null;
  }
}
