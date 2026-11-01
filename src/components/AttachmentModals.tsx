import React, { useState, useEffect, useRef } from 'react';
import {
  X, Send, MapPin, Plus, Trash2, FileText, CheckCircle2,
  Navigation, Clock, Radio, Search, Loader2, Video, Music,
  File, AlertCircle
} from 'lucide-react';
import { LocationData, PollData } from '../types/chat';
import { loadGoogleMapsScript, getGoogleMapsApiKey } from '../utils/googleMapsLoader';

// ============================================================================
// 1. ATTACHMENT UPLOAD PREVIEW MODAL (IMAGES, VIDEOS, AUDIO, DOCUMENTS)
// ============================================================================

interface AttachmentUploadPreviewModalProps {
  file: File;
  theme: 'dark' | 'light';
  onClose: () => void;
  onSend: (file: File, caption: string) => Promise<void>;
}

export const AttachmentUploadPreviewModal: React.FC<AttachmentUploadPreviewModalProps> = ({
  file,
  theme,
  onClose,
  onSend,
}) => {
  const [caption, setCaption] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const isDark = theme === 'dark';

  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  const isAudio = file.type.startsWith('audio/');

  useEffect(() => {
    let url: string | null = null;
    if (isImage || isVideo || isAudio) {
      url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, isImage, isVideo, isAudio]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUploading) return;
    setIsUploading(true);
    setUploadError(null);
    try {
      await onSend(file, caption.trim());
      onClose();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150">
      <div
        className={`relative w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh] border ${
          isDark ? 'bg-[#111b21] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-3.5 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold truncate max-w-[280px]">
              {isImage ? 'Send Photo' : isVideo ? 'Send Video' : isAudio ? 'Send Audio' : 'Send Document'}
            </span>
            <span className="text-xs text-slate-400">({formatFileSize(file.size)})</span>
          </div>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="p-1 rounded-full hover:bg-white/10 disabled:opacity-40"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Preview Container */}
        <div className="flex-1 min-h-[220px] max-h-[380px] bg-black/90 flex items-center justify-center p-4 overflow-hidden relative">
          {isImage && previewUrl && (
            <img
              src={previewUrl}
              alt="Attachment Preview"
              className="max-h-[340px] max-w-full object-contain rounded-lg shadow-lg"
            />
          )}

          {isVideo && previewUrl && (
            <video
              src={previewUrl}
              controls
              className="max-h-[340px] max-w-full rounded-lg shadow-lg"
            />
          )}

          {isAudio && (
            <div className="flex flex-col items-center gap-3 p-6 text-center text-white">
              <div className="w-16 h-16 rounded-full bg-emerald-600/30 text-emerald-400 flex items-center justify-center border border-emerald-500/40">
                <Music className="w-8 h-8" />
              </div>
              <div className="text-sm font-semibold">{file.name}</div>
              <audio src={previewUrl || undefined} controls className="mt-2 w-64" />
            </div>
          )}

          {!isImage && !isVideo && !isAudio && (
            <div className="flex flex-col items-center gap-3 p-8 text-center text-white">
              <div className="w-20 h-20 rounded-2xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
                <File className="w-10 h-10" />
              </div>
              <div className="text-base font-semibold max-w-xs truncate">{file.name}</div>
              <div className="text-xs text-slate-400">{formatFileSize(file.size)} • {file.type || 'Document'}</div>
            </div>
          )}

          {isUploading && (
            <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 text-[#00a884] animate-spin" />
              <span className="text-sm font-medium text-white">Uploading attachment...</span>
            </div>
          )}
        </div>

        {uploadError && (
          <div className="p-2.5 bg-rose-500/15 border-t border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{uploadError}</span>
          </div>
        )}

        {/* Footer Caption & Send */}
        <form
          onSubmit={handleSend}
          className={`p-3.5 flex items-center gap-2 border-t ${
            isDark ? 'border-slate-800 bg-[#202c33]' : 'border-slate-200 bg-[#f0f2f5]'
          }`}
        >
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            disabled={isUploading}
            placeholder="Add a caption... (optional)"
            className={`flex-1 px-4 py-2.5 rounded-full text-sm outline-none border transition-colors ${
              isDark
                ? 'bg-[#111b21] border-slate-700 text-white placeholder-slate-400'
                : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 shadow-sm'
            } focus:border-[#00a884]`}
            autoFocus
          />
          <button
            type="submit"
            disabled={isUploading}
            className="w-11 h-11 rounded-full bg-[#00a884] text-white flex items-center justify-center hover:bg-[#008f72] shadow-md shrink-0 transition-transform active:scale-95 disabled:opacity-50"
            title="Send attachment"
          >
            {isUploading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5 ml-0.5" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

// ============================================================================
// 2. IMAGE PREVIEW MODAL (LIGHTBOX FOR VIEWING IN-CHAT PHOTOS)
// ============================================================================

interface ImagePreviewModalProps {
  imageUrl: string;
  theme: 'dark' | 'light';
  onClose: () => void;
  onSend?: (caption: string) => void;
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  imageUrl,
  theme,
  onClose,
}) => {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-150"
    >
      <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
        <img
          src={imageUrl}
          alt="Media full view"
          className="max-h-[82vh] max-w-full object-contain rounded-xl shadow-2xl"
        />
      </div>
    </div>
  );
};

// ============================================================================
// 3. GOOGLE MAPS & LIVE LOCATION PICKER MODAL
// ============================================================================

interface LocationPickerModalProps {
  theme: 'dark' | 'light';
  onClose: () => void;
  onSendLocation: (loc: LocationData) => void;
}

export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({
  theme,
  onClose,
  onSendLocation,
}) => {
  const isDark = theme === 'dark';
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any | null>(null);
  const markerRef = useRef<any | null>(null);

  // Mode: 'current' (static location) or 'live' (live location sharing)
  const [mode, setMode] = useState<'current' | 'live'>('current');
  const [liveDurationMinutes, setLiveDurationMinutes] = useState<number>(15);

  const [coords, setCoords] = useState<{ lat: number; lng: number }>({
    lat: 17.385044, // Default Hyderabad center / fallback
    lng: 78.486671,
  });

  const [placeName, setPlaceName] = useState('Current GPS Location');
  const [placeAddress, setPlaceAddress] = useState('Locating address...');
  const [isLocating, setIsLocating] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [nearbySuggestions, setNearbySuggestions] = useState<LocationData[]>([]);

  // 1. Get real GPS Coordinates on mount
  useEffect(() => {
    let isMounted = true;
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!isMounted) return;
          const userLat = pos.coords.latitude;
          const userLng = pos.coords.longitude;
          setCoords({ lat: userLat, lng: userLng });
          setIsLocating(false);
          reverseGeocode(userLat, userLng);
        },
        (err) => {
          console.warn('Geolocation lookup failed or denied:', err);
          if (isMounted) {
            setIsLocating(false);
            setPlaceAddress('Precision GPS (Tap map to adjust marker)');
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );
    } else {
      setIsLocating(false);
    }

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Initialize Google Maps JavaScript API
  useEffect(() => {
    let isMounted = true;

    loadGoogleMapsScript().then((googleMaps) => {
      if (!isMounted || !googleMaps || !mapContainerRef.current) return;

      const map = new googleMaps.Map(mapContainerRef.current, {
        center: coords,
        zoom: 16,
        mapTypeId: 'roadmap',
        disableDefaultUI: false,
        zoomControl: true,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
        styles: isDark
          ? [
              { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
              { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
              { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
              {
                featureType: 'administrative.locality',
                elementType: 'labels.text.fill',
                stylers: [{ color: '#d59563' }],
              },
              {
                featureType: 'poi',
                elementType: 'labels.text.fill',
                stylers: [{ color: '#d59563' }],
              },
              {
                featureType: 'road',
                elementType: 'geometry',
                stylers: [{ color: '#38414e' }],
              },
              {
                featureType: 'road',
                elementType: 'geometry.stroke',
                stylers: [{ color: '#212a37' }],
              },
              {
                featureType: 'road',
                elementType: 'labels.text.fill',
                stylers: [{ color: '#9ca5b3' }],
              },
              {
                featureType: 'water',
                elementType: 'geometry',
                stylers: [{ color: '#17263c' }],
              },
            ]
          : [],
      });

      mapInstanceRef.current = map;

      const marker = new googleMaps.Marker({
        position: coords,
        map,
        draggable: true,
        animation: googleMaps.Animation.DROP,
        title: 'Drag to adjust location',
      });

      markerRef.current = marker;

      marker.addListener('dragend', () => {
        const newPos = marker.getPosition();
        if (newPos) {
          const newLat = newPos.lat();
          const newLng = newPos.lng();
          setCoords({ lat: newLat, lng: newLng });
          reverseGeocode(newLat, newLng);
        }
      });

      map.addListener('click', (e: any) => {
        if (e.latLng) {
          marker.setPosition(e.latLng);
          const newLat = e.latLng.lat();
          const newLng = e.latLng.lng();
          setCoords({ lat: newLat, lng: newLng });
          reverseGeocode(newLat, newLng);
        }
      });

      setMapLoaded(true);
    });

    return () => {
      isMounted = false;
    };
  }, [isDark]);

  // Sync map center if coords updated after geolocation completes
  useEffect(() => {
    if (mapInstanceRef.current && markerRef.current) {
      mapInstanceRef.current.setCenter(coords);
      markerRef.current.setPosition(coords);
    }
  }, [coords]);

  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      const apiKey = await getGoogleMapsApiKey();
      if (apiKey) {
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.results && data.results.length > 0) {
            const first = data.results[0];
            setPlaceAddress(first.formatted_address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
            if (first.address_components?.[0]?.long_name) {
              setPlaceName(first.address_components[0].long_name);
            }
            return;
          }
        }
      }
    } catch {}

    setPlaceAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
  };

  const handleSearchPlace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    try {
      const apiKey = await getGoogleMapsApiKey();
      if (apiKey) {
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
            searchQuery.trim()
          )}&key=${apiKey}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.results && data.results.length > 0) {
            const top = data.results[0];
            const loc = top.geometry.location;
            setCoords({ lat: loc.lat, lng: loc.lng });
            setPlaceName(top.formatted_address.split(',')[0]);
            setPlaceAddress(top.formatted_address);
            if (mapInstanceRef.current && markerRef.current) {
              mapInstanceRef.current.setCenter({ lat: loc.lat, lng: loc.lng });
              mapInstanceRef.current.setZoom(16);
              markerRef.current.setPosition({ lat: loc.lat, lng: loc.lng });
            }
            return;
          }
        }
      }
    } catch {}
  };

  const handleSend = () => {
    const isLive = mode === 'live';
    const locationPayload: LocationData = {
      name: placeName,
      address: placeAddress,
      lat: coords.lat,
      lng: coords.lng,
      isLive,
      liveDurationMinutes: isLive ? liveDurationMinutes : undefined,
      liveExpiresAt: isLive ? Date.now() + liveDurationMinutes * 60 * 1000 : undefined,
    };

    onSendLocation(locationPayload);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div
        className={`relative w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[580px] border ${
          isDark ? 'bg-[#111b21] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-[#00a884]" />
            <h3 className="font-semibold text-base">Share Location</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Tab Controls: Current Location vs Live Location */}
        <div className={`flex border-b text-xs font-semibold ${isDark ? 'border-slate-800 bg-[#202c33]' : 'border-slate-200 bg-slate-100'}`}>
          <button
            onClick={() => setMode('current')}
            className={`flex-1 py-2.5 flex items-center justify-center gap-2 border-b-2 transition-colors ${
              mode === 'current'
                ? 'border-[#00a884] text-[#00a884] bg-emerald-500/10'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Navigation className="w-4 h-4" />
            <span>Send Current Location</span>
          </button>

          <button
            onClick={() => setMode('live')}
            className={`flex-1 py-2.5 flex items-center justify-center gap-2 border-b-2 transition-colors ${
              mode === 'live'
                ? 'border-[#00a884] text-[#00a884] bg-emerald-500/10'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Radio className="w-4 h-4 animate-pulse" />
            <span>Share Live Location</span>
          </button>
        </div>

        {/* Search Place Bar */}
        <form onSubmit={handleSearchPlace} className={`p-2.5 flex gap-2 border-b ${isDark ? 'border-slate-800 bg-[#111b21]' : 'border-slate-200 bg-white'}`}>
          <div className="flex-1 relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search address, landmark or city..."
              className={`w-full pl-9 pr-3 py-1.5 rounded-lg text-xs outline-none border transition-colors ${
                isDark ? 'bg-[#202c33] border-slate-700 text-white placeholder-slate-400' : 'bg-slate-50 border-slate-300'
              } focus:border-[#00a884]`}
            />
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg bg-[#00a884] hover:bg-[#008f72] text-white text-xs font-semibold shadow-sm"
          >
            Find
          </button>
        </form>

        {/* Interactive Google Map Container */}
        <div className="flex-1 relative bg-slate-900 overflow-hidden">
          <div ref={mapContainerRef} className="w-full h-full" />

          {!mapLoaded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900 text-slate-300">
              <Loader2 className="w-6 h-6 animate-spin text-[#00a884]" />
              <span className="text-xs">Loading Google Map...</span>
            </div>
          )}

          {/* Quick Recenter GPS Button */}
          <button
            onClick={() => {
              if ('geolocation' in navigator) {
                navigator.geolocation.getCurrentPosition((pos) => {
                  const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                  setCoords(p);
                  if (mapInstanceRef.current && markerRef.current) {
                    mapInstanceRef.current.panTo(p);
                    mapInstanceRef.current.setZoom(16);
                    markerRef.current.setPosition(p);
                  }
                  reverseGeocode(p.lat, p.lng);
                });
              }
            }}
            className="absolute bottom-3 right-3 p-2.5 rounded-full bg-[#00a884] text-white shadow-lg hover:bg-[#008f72] active:scale-95 transition-transform"
            title="Recenter to my GPS"
          >
            <Navigation className="w-4 h-4" />
          </button>
        </div>

        {/* Selected Location Info & Live Duration Options */}
        <div className={`p-4 border-t flex flex-col gap-3 ${isDark ? 'border-slate-800 bg-[#202c33]' : 'border-slate-200 bg-[#f0f2f5]'}`}>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-500/20 text-[#00a884] flex items-center justify-center shrink-0 mt-0.5">
              {mode === 'live' ? <Radio className="w-5 h-5 animate-pulse" /> : <MapPin className="w-5 h-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate flex items-center gap-2">
                <span>{placeName}</span>
                {mode === 'live' && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500 text-white uppercase tracking-wider animate-pulse">
                    LIVE
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400 truncate mt-0.5">{placeAddress}</div>
              <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
              </div>
            </div>
          </div>

          {/* If Live mode: duration selector pills */}
          {mode === 'live' && (
            <div className="flex items-center gap-2 pt-1 border-t border-slate-700/30">
              <span className="text-xs font-semibold text-slate-300">Live Duration:</span>
              {[
                { label: '15 mins', val: 15 },
                { label: '1 hour', val: 60 },
                { label: '8 hours', val: 480 },
              ].map((d) => (
                <button
                  key={d.val}
                  type="button"
                  onClick={() => setLiveDurationMinutes(d.val)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                    liveDurationMinutes === d.val
                      ? 'bg-[#00a884] text-white shadow-sm'
                      : isDark
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}

          {/* Action Button */}
          <button
            type="button"
            onClick={handleSend}
            className="w-full py-2.5 rounded-full bg-[#00a884] hover:bg-[#008f72] text-white font-semibold text-sm shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {mode === 'live' ? (
              <>
                <Radio className="w-4 h-4 animate-pulse" />
                <span>Share Live Location ({liveDurationMinutes < 60 ? `${liveDurationMinutes}m` : `${liveDurationMinutes / 60}h`})</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Send This Location</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 4. CREATE POLL MODAL
// ============================================================================

interface CreatePollModalProps {
  theme: 'dark' | 'light';
  onClose: () => void;
  onSendPoll: (poll: PollData) => void;
}

export const CreatePollModal: React.FC<CreatePollModalProps> = ({
  theme,
  onClose,
  onSendPoll,
}) => {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const isDark = theme === 'dark';

  const handleOptionChange = (idx: number, val: string) => {
    const updated = [...options];
    updated[idx] = val;
    setOptions(updated);
  };

  const addOption = () => {
    if (options.length < 8) {
      setOptions([...options, '']);
    }
  };

  const removeOption = (idx: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== idx));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || validOptions.length < 2) return;

    const poll: PollData = {
      question: question.trim(),
      options: validOptions.map((text, i) => ({
        id: `opt_${Date.now()}_${i}`,
        text,
        votes: 0,
        voterNames: [],
      })),
      allowMultipleAnswers: allowMultiple,
    };

    onSendPoll(poll);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div
        className={`relative w-full max-w-md rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[580px] border ${
          isDark ? 'bg-[#111b21] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div className={`flex items-center justify-between p-4 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
          <h3 className="font-semibold text-base">Create Poll</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
              Question
            </label>
            <input
              type="text"
              required
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question..."
              className={`w-full px-3 py-2 rounded-lg text-sm outline-none border transition-colors ${
                isDark ? 'bg-[#202c33] border-slate-700 text-white' : 'bg-slate-50 border-slate-300'
              } focus:border-[#00a884]`}
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">
              Options
            </label>
            <div className="flex flex-col gap-2.5">
              {options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => handleOptionChange(idx, e.target.value)}
                    placeholder={`Option ${idx + 1}`}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm outline-none border transition-colors ${
                      isDark ? 'bg-[#202c33] border-slate-700 text-white' : 'bg-slate-50 border-slate-300'
                    } focus:border-[#00a884]`}
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOption(idx)}
                      className="p-2 text-slate-400 hover:text-rose-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {options.length < 8 && (
              <button
                type="button"
                onClick={addOption}
                className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-[#00a884] hover:underline"
              >
                <Plus className="w-4 h-4" />
                <span>Add option</span>
              </button>
            )}
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/40 border border-slate-700/40">
            <div>
              <div className="text-sm font-semibold">Allow multiple answers</div>
              <div className="text-xs text-slate-400">Users can vote on more than one option</div>
            </div>
            <button
              type="button"
              onClick={() => setAllowMultiple(!allowMultiple)}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                allowMultiple ? 'bg-[#00a884]' : 'bg-slate-600'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  allowMultiple ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="mt-4 flex items-center justify-end gap-3 pt-3 border-t border-slate-700/40">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!question.trim() || options.filter((o) => o.trim()).length < 2}
              className="px-5 py-2.5 rounded-full bg-[#00a884] hover:bg-[#008f72] text-white font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
            >
              Send Poll
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
