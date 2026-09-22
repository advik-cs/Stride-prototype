import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';
import { offlineCacheService } from '../../offline/cacheService';
import {
  Sun,
  Cloud,
  CloudSun,
  CloudRain,
  CloudDrizzle,
  CloudSnow,
  CloudLightning,
  Wind,
  Droplets,
  Thermometer,
  MapPin,
  RefreshCw,
  AlertTriangle,
  Clock,
} from 'lucide-react';

export interface HourlyForecast {
  time: string;
  temp: number;
  precipProb: number;
  weatherCode: number;
}

export interface LiveWeatherData {
  temperature: number;
  apparentTemperature: number;
  windSpeed: number;
  windDirection: number;
  windDirectionCardinal: string;
  precipitation: number;
  relativeHumidity: number;
  weatherCode: number;
  time: string;
  hourly: HourlyForecast[];
}

export function getWindCompass(deg: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const idx = Math.round(deg / 22.5) % 16;
  return directions[idx];
}

export function getFloodRiskAssessment(precip: number, weatherCode: number) {
  if (precip >= 15 || [65, 82, 95, 96, 99].includes(weatherCode)) {
    return {
      level: 'HIGH',
      badge: 'High Inundation Risk — Heavy Rainfall Active',
      color: 'bg-red-50 text-red-700 border-red-200',
      dotColor: 'bg-red-600',
    };
  }
  if (precip >= 5 || [55, 63, 81].includes(weatherCode)) {
    return {
      level: 'MODERATE',
      badge: 'Moderate Flood Advisory — Active Rain',
      color: 'bg-orange-50 text-orange-700 border-orange-200',
      dotColor: 'bg-orange-500',
    };
  }
  return {
    level: 'LOW',
    badge: 'Low Surface Inundation Risk',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotColor: 'bg-emerald-600',
  };
}

export function getWmoDetails(code: number): { label: string; icon: React.ComponentType<{ className?: string }>; color: string } {
  switch (code) {
    case 0:
      return { label: 'Clear Sky', icon: Sun, color: 'text-amber-500' };
    case 1:
      return { label: 'Mainly Clear', icon: Sun, color: 'text-amber-500' };
    case 2:
      return { label: 'Partly Cloudy', icon: CloudSun, color: 'text-sky-500' };
    case 3:
      return { label: 'Overcast', icon: Cloud, color: 'text-slate-500' };
    case 45:
    case 48:
      return { label: 'Fog / Haze', icon: Cloud, color: 'text-slate-400' };
    case 51:
    case 53:
    case 55:
      return { label: 'Light Drizzle', icon: CloudDrizzle, color: 'text-blue-400' };
    case 61:
    case 63:
    case 65:
      return { label: 'Rain', icon: CloudRain, color: 'text-blue-600' };
    case 71:
    case 73:
    case 75:
      return { label: 'Snowfall', icon: CloudSnow, color: 'text-indigo-400' };
    case 80:
    case 81:
    case 82:
      return { label: 'Rain Showers', icon: CloudRain, color: 'text-blue-700' };
    case 95:
    case 96:
    case 99:
      return { label: 'Thunderstorm', icon: CloudLightning, color: 'text-purple-600' };
    default:
      return { label: 'Partly Cloudy', icon: CloudSun, color: 'text-sky-500' };
  }
}

interface LiveWeatherCardProps {
  title?: string;
  className?: string;
}

export const LiveWeatherCard: React.FC<LiveWeatherCardProps> = ({
  title,
  className = '',
}) => {
  const { t } = useLanguage();
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<'detecting' | 'detected' | 'denied' | 'unavailable'>('detecting');
  const [isFallbackCoords, setIsFallbackCoords] = useState(false);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [weatherData, setWeatherData] = useState<LiveWeatherData | null>(null);
  const [isOfflineData, setIsOfflineData] = useState(false);
  const [isDataStale, setIsDataStale] = useState(false);
  const [cachedTimestamp, setCachedTimestamp] = useState<string | null>(null);

  useEffect(() => {
    detectLocationAndFetchWeather();
  }, []);

  const detectLocationAndFetchWeather = () => {
    setLocationStatus('detecting');
    setWeatherLoading(true);
    setWeatherError(null);

    if (!navigator.geolocation) {
      useFallbackLocation('unavailable');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const detectedLat = Number(position.coords.latitude.toFixed(4));
        const detectedLon = Number(position.coords.longitude.toFixed(4));
        setCoords({ lat: detectedLat, lon: detectedLon });
        setIsFallbackCoords(false);
        setLocationStatus('detected');
        fetchLiveWeather(detectedLat, detectedLon);
      },
      (error) => {
        const reason = error.code === 1 ? 'denied' : 'unavailable';
        useFallbackLocation(reason);
      },
      { timeout: 9000, maximumAge: 300000, enableHighAccuracy: false }
    );
  };

  const useFallbackLocation = (status: 'denied' | 'unavailable') => {
    const fallbackLat = 12.9716;
    const fallbackLon = 77.5946;
    setCoords({ lat: fallbackLat, lon: fallbackLon });
    setIsFallbackCoords(true);
    setLocationStatus(status);
    fetchLiveWeather(fallbackLat, fallbackLon);
  };

  const fetchLiveWeather = async (lat: number, lon: number) => {
    setWeatherLoading(true);
    setWeatherError(null);
    try {
      const res = await offlineCacheService.getHazardSnapshotWithFallback(lat, lon);
      if (res.ok && res.data.data) {
        setWeatherData(res.data.data);
        setIsOfflineData(res.data.source === 'cache');
        setIsDataStale(res.data.isStale ?? false);
        setCachedTimestamp(res.data.lastSyncedAt || null);
        return;
      }
      throw new Error('Unable to retrieve meteorological data.');
    } catch (err: any) {
      console.error('Failed to load weather data:', err);
      setWeatherError(err.message || 'Unable to retrieve live meteorological data.');
    } finally {
      setWeatherLoading(false);
    }
  };

  const currentWeatherDetails = weatherData ? getWmoDetails(weatherData.weatherCode) : null;
  const WeatherIconComponent = currentWeatherDetails ? currentWeatherDetails.icon : Sun;

  return (
    <div className={`rounded-3xl bg-white border border-[#C8D9E6]/80 shadow-sm overflow-hidden transition duration-200 ${className}`}>
      {/* Header */}
      <div className="p-5 sm:p-6 border-b border-[#F5EFEB] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#F5EFEB] text-[#2F4156] flex items-center justify-center flex-shrink-0">
            <Sun className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156]">
              {title || t('essentials.weatherTitle') || 'Live Meteorological Telemetry'}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <MapPin className="w-3.5 h-3.5 text-[#567C8D]" />
              <div className="flex flex-wrap items-center gap-2">
                {locationStatus === 'detecting' && (
                  <span className="text-xs font-medium text-[#567C8D]">
                    {t('essentials.fetchingLocation') || 'Detecting your device coordinates...'}
                  </span>
                )}
                {locationStatus === 'detected' && coords && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block animate-pulse" />
                    Detected Location: {coords.lat.toFixed(4)}° N, {coords.lon.toFixed(4)}° E
                  </span>
                )}
                {(locationStatus === 'denied' || locationStatus === 'unavailable') && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-600 inline-block" />
                    Bengaluru (Default): 12.9716° N, 77.5946° E
                  </span>
                )}
                {isOfflineData && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-300 flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-amber-600" />
                    {isDataStale ? 'Offline Snapshot (Stale)' : 'Offline Snapshot (Cached)'}
                    {cachedTimestamp ? ` • ${new Date(cachedTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={detectLocationAndFetchWeather}
          disabled={weatherLoading}
          className="self-start sm:self-auto px-3.5 py-1.5 rounded-xl border border-[#C8D9E6] text-xs font-bold text-[#2F4156] hover:bg-[#F5EFEB] transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${weatherLoading ? 'animate-spin' : ''}`} />
          <span>{t('weather.redetect') || 'Redetect Location & Refresh'}</span>
        </button>
      </div>

      {/* Location Notice Banner if fallback used */}
      {isFallbackCoords && (
        <div className="px-6 py-2.5 bg-amber-50 border-b border-amber-100 flex items-center gap-2.5 text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span>
            {locationStatus === 'denied'
              ? 'Location permission was denied in your browser. Weather data is currently displayed for Bengaluru fallback coordinates. Click "Redetect Location & Refresh" to grant permission.'
              : 'Geolocation service was unavailable on your device. Fallback coordinates for Bengaluru are active.'}
          </span>
        </div>
      )}

      {/* Weather Body */}
      <div className="p-6 sm:p-8">
        {weatherLoading ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-3 text-center">
            <RefreshCw className="w-8 h-8 animate-spin text-[#567C8D]" />
            <p className="text-sm font-semibold text-[#2F4156]">
              Fetching live atmospheric telemetry from Open-Meteo...
            </p>
            <p className="text-xs text-[#567C8D]">
              Connecting to public global meteorological station network
            </p>
          </div>
        ) : weatherError ? (
          <div className="p-6 rounded-2xl bg-red-50 border border-red-200 text-center space-y-3">
            <AlertTriangle className="w-8 h-8 text-red-600 mx-auto" />
            <h3 className="text-sm font-bold text-red-900">Weather Telemetry Unavailable</h3>
            <p className="text-xs text-red-700 max-w-md mx-auto">{weatherError}</p>
            <button
              type="button"
              onClick={() => coords && fetchLiveWeather(coords.lat, coords.lon)}
              className="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition cursor-pointer"
            >
              Retry Weather Fetch
            </button>
          </div>
        ) : weatherData ? (
          <div className="space-y-6">
            {/* FLOOD RISK ASSESSMENT BADGE */}
            {(() => {
              const floodRisk = getFloodRiskAssessment(weatherData.precipitation, weatherData.weatherCode);
              return (
                <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs ${floodRisk.color}`}>
                  <div className="flex items-center gap-2.5">
                    <span className={`w-3 h-3 rounded-full ${floodRisk.dotColor} animate-pulse flex-shrink-0`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold uppercase tracking-wider">
                          Flood Risk Assessment
                        </span>
                        <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-white/80 border border-current">
                          {floodRisk.level} RISK
                        </span>
                      </div>
                      <p className="text-xs font-semibold mt-0.5">
                        {floodRisk.badge}
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-medium text-slate-600 sm:text-right">
                    Current Rainfall: <strong>{weatherData.precipitation} mm</strong>
                  </span>
                </div>
              );
            })()}

            {/* CURRENT CONDITIONS HERO */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
              {/* Temperature and Icon */}
              <div className="flex items-center gap-5 lg:border-r border-[#F5EFEB] lg:pr-6">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-sky-50 to-blue-50 border border-sky-100 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <WeatherIconComponent className={`w-11 h-11 ${currentWeatherDetails?.color || 'text-sky-500'}`} />
                </div>
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl sm:text-5xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156] tracking-tight">
                      {Math.round(weatherData.temperature)}°C
                    </span>
                  </div>
                  <p className="text-base font-bold text-[#2F4156] mt-0.5">
                    {currentWeatherDetails?.label || 'Clear'}
                  </p>
                  <span className="text-xs font-medium text-[#567C8D]">
                    {t('weather.apparent') || 'Feels like'} {Math.round(weatherData.apparentTemperature)}°C
                  </span>
                </div>
              </div>

              {/* 3 Metric Pills */}
              <div className="grid grid-cols-3 gap-3 lg:col-span-2">
                <div className="p-4 rounded-2xl bg-[#F5EFEB]/70 border border-[#C8D9E6]/50 flex flex-col justify-center">
                  <div className="flex items-center gap-1.5 text-xs text-[#567C8D] font-semibold">
                    <Wind className="w-3.5 h-3.5 text-blue-600" />
                    <span>{t('weather.windSpeed') || 'Wind'}</span>
                  </div>
                  <span className="text-lg sm:text-xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156] mt-1">
                    {weatherData.windSpeed} <span className="text-xs font-medium text-[#567C8D]">km/h</span>
                  </span>
                  <span className="text-[11px] font-bold text-blue-700 mt-0.5">
                    {weatherData.windDirectionCardinal} ({weatherData.windDirection}°)
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-[#F5EFEB]/70 border border-[#C8D9E6]/50 flex flex-col justify-center">
                  <div className="flex items-center gap-1.5 text-xs text-[#567C8D] font-semibold">
                    <Droplets className="w-3.5 h-3.5 text-sky-600" />
                    <span>{t('weather.precipitation') || 'Precipitation'}</span>
                  </div>
                  <span className="text-lg sm:text-xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156] mt-1">
                    {weatherData.precipitation} <span className="text-xs font-medium text-[#567C8D]">mm</span>
                  </span>
                  <span className="text-[11px] font-semibold text-sky-700 mt-0.5">
                    {weatherData.hourly[0]?.precipProb ?? 0}% rain prob
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-[#F5EFEB]/70 border border-[#C8D9E6]/50 flex flex-col justify-center">
                  <div className="flex items-center gap-1.5 text-xs text-[#567C8D] font-semibold">
                    <Thermometer className="w-3.5 h-3.5 text-indigo-600" />
                    <span>{t('weather.humidity') || 'Humidity'}</span>
                  </div>
                  <span className="text-lg sm:text-xl font-bold font-['Space_Grotesk',sans-serif] text-[#2F4156] mt-1">
                    {weatherData.relativeHumidity} <span className="text-xs font-medium text-[#567C8D]">%</span>
                  </span>
                  <span className="text-[11px] font-medium text-[#567C8D] mt-0.5">
                    Relative atmospheric
                  </span>
                </div>
              </div>
            </div>

            {/* 6-HOUR FORECAST TIMELINE */}
            {weatherData.hourly && weatherData.hourly.length > 0 && (
              <div className="pt-5 border-t border-[#F5EFEB]">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-[#567C8D]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#567C8D]">
                    {t('weather.forecast6h') || 'Next 6-Hour Forecast'}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                  {weatherData.hourly.map((hour, idx) => {
                    const hDetails = getWmoDetails(hour.weatherCode);
                    const HIcon = hDetails.icon;
                    let displayTime = hour.time;
                    try {
                      displayTime = new Date(hour.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    } catch {
                      // Fallback to raw string
                    }
                    return (
                      <div
                        key={idx}
                        className="p-3 rounded-2xl bg-[#F5EFEB]/50 border border-[#C8D9E6]/40 flex flex-col items-center text-center space-y-1.5"
                      >
                        <span className="text-[11px] font-semibold text-[#567C8D]">
                          {displayTime}
                        </span>
                        <HIcon className={`w-5 h-5 ${hDetails.color}`} />
                        <span className="text-sm font-bold text-[#2F4156]">
                          {Math.round(hour.temp)}°C
                        </span>
                        <span className="text-[10px] font-semibold text-blue-600">
                          {hour.precipProb}% rain
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};
