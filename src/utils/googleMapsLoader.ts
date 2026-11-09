// Google Maps JavaScript API dynamic loader
declare const google: any;

let mapsPromise: Promise<any | null> | null = null;
let cachedApiKey: string | null = null;

export async function getGoogleMapsApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey;

  // 1. Check Vite client environment
  const envKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY;
  if (envKey && typeof envKey === 'string' && envKey.trim().length > 10) {
    cachedApiKey = envKey.trim();
    return cachedApiKey;
  }

  // 2. Query /api/config from server
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const data = await res.json();
      if (data.googleMapsApiKey && typeof data.googleMapsApiKey === 'string') {
        const key = data.googleMapsApiKey.trim();
        cachedApiKey = key;
        return key;
      }
    }
  } catch (err) {
    console.warn('Could not fetch Google Maps API key from /api/config:', err);
  }

  return '';
}

export function loadGoogleMapsScript(): Promise<any | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);

  if ((window as any).google?.maps) {
    return Promise.resolve((window as any).google.maps);
  }

  if (mapsPromise) return mapsPromise;

  mapsPromise = (async () => {
    try {
      const apiKey = await getGoogleMapsApiKey();
      if (!apiKey) {
        console.warn('Google Maps API key is not configured.');
        return null;
      }

      return new Promise<any | null>((resolve) => {
        // Check if script tag already exists
        const existingScript = document.querySelector('script[data-google-maps-loader]');
        if (existingScript) {
          const checkInterval = setInterval(() => {
            if ((window as any).google?.maps) {
              clearInterval(checkInterval);
              resolve((window as any).google.maps);
            }
          }, 100);
          setTimeout(() => {
            clearInterval(checkInterval);
            resolve((window as any).google?.maps || null);
          }, 6000);
          return;
        }

        const script = document.createElement('script');
        script.setAttribute('data-google-maps-loader', 'true');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
          apiKey
        )}&libraries=places,geometry`;
        script.async = true;
        script.defer = true;

        script.onload = () => {
          if ((window as any).google?.maps) {
            resolve((window as any).google.maps);
          } else {
            resolve(null);
          }
        };

        script.onerror = (err) => {
          console.error('Failed to load Google Maps JavaScript API script:', err);
          resolve(null);
        };

        document.head.appendChild(script);
      });
    } catch (err) {
      console.error('Error initializing Google Maps script:', err);
      return null;
    }
  })();

  return mapsPromise;
}
