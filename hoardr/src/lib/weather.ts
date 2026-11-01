'use client'

import type { LucideIcon } from 'lucide-react'
import { Sun, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain, CloudSnow, CloudLightning } from 'lucide-react'

/** Open-Meteo WMO weather code → icon + words (calendar days, daily brief). */
export function getWeatherInfo(code: number): { Icon: LucideIcon; desc: string } {
  if (code === 0)  return { Icon: Sun,            desc: 'Clear' }
  if (code <= 2)   return { Icon: CloudSun,       desc: 'Partly cloudy' }
  if (code === 3)  return { Icon: Cloud,          desc: 'Overcast' }
  if (code <= 48)  return { Icon: CloudFog,       desc: 'Foggy' }
  if (code <= 55)  return { Icon: CloudDrizzle,   desc: 'Drizzle' }
  if (code <= 65)  return { Icon: CloudRain,      desc: 'Rain' }
  if (code <= 77)  return { Icon: CloudSnow,      desc: 'Snow' }
  if (code <= 82)  return { Icon: CloudRain,      desc: 'Showers' }
  return           { Icon: CloudLightning, desc: 'Thunderstorm' }
}

/** Where the calendar caches your position (it refreshes it once a day). */
export const WEATHER_LOC_KEY = 'cal-weather-loc'

export interface NowWeather { temp: number; high: number; low: number; code: number }

const NOW_KEY = 'hoardr-weather-now'
const NOW_TTL = 20 * 60_000

async function position(): Promise<{ lat: number; lon: number } | null> {
  try {
    const raw = localStorage.getItem(WEATHER_LOC_KEY)
    if (raw) { const { lat, lon } = JSON.parse(raw) as { lat: number; lon: number }; return { lat, lon } }
  } catch {}
  // Never prompt from here: only use location if it was already allowed
  try {
    const p = await navigator.permissions?.query({ name: 'geolocation' as PermissionName })
    if (p?.state !== 'granted') return null
  } catch { return null }
  return new Promise(res => navigator.geolocation.getCurrentPosition(
    pos => {
      const v = { lat: pos.coords.latitude, lon: pos.coords.longitude }
      try { localStorage.setItem(WEATHER_LOC_KEY, JSON.stringify({ ...v, ts: Date.now() })) } catch {}
      res(v)
    },
    () => res(null),
    { timeout: 2000, maximumAge: 24 * 3600_000 },
  ))
}

/**
 * Right now + today's high/low (°F) for the daily brief. Cached for 20 min,
 * null when there's no location or the request fails — never throws.
 */
export async function loadNowWeather(): Promise<NowWeather | null> {
  try {
    const hit = JSON.parse(sessionStorage.getItem(NOW_KEY) ?? 'null') as { at: number; w: NowWeather } | null
    if (hit && Date.now() - hit.at < NOW_TTL) return hit.w
  } catch {}
  const pos = await position()
  if (!pos) return null
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${pos.lat}&longitude=${pos.lon}&current=temperature_2m,weathercode&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=auto&forecast_days=1`)
    if (!r.ok) return null
    const d = await r.json() as {
      current: { temperature_2m: number; weathercode: number }
      daily:   { temperature_2m_max: number[]; temperature_2m_min: number[] }
    }
    const w: NowWeather = {
      temp: Math.round(d.current.temperature_2m),
      code: d.current.weathercode,
      high: Math.round(d.daily.temperature_2m_max[0]),
      low:  Math.round(d.daily.temperature_2m_min[0]),
    }
    try { sessionStorage.setItem(NOW_KEY, JSON.stringify({ at: Date.now(), w })) } catch {}
    return w
  } catch { return null }
}
