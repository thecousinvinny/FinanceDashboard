'use client'
import { useEffect, useRef, useState } from 'react'

const THRESHOLD = 72

export function usePullToRefresh(onRefresh: () => void) {
  const [distance,   setDistance]   = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const startY       = useRef<number | null>(null)
  const distanceRef  = useRef(0)
  const refreshingRef = useRef(false)

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0 && !refreshingRef.current) {
        startY.current = e.touches[0].clientY
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (startY.current === null) return
      const dy = e.touches[0].clientY - startY.current
      if (dy > 0) {
        const d = Math.min(dy * 0.45, THRESHOLD + 20)
        distanceRef.current = d
        setDistance(d)
      } else {
        startY.current = null
        distanceRef.current = 0
        setDistance(0)
      }
    }

    const onTouchEnd = () => {
      if (startY.current === null) return
      const d = distanceRef.current
      startY.current = null
      distanceRef.current = 0
      setDistance(0)
      if (d >= THRESHOLD && !refreshingRef.current) {
        refreshingRef.current = true
        setRefreshing(true)
        onRefresh()
        setTimeout(() => {
          refreshingRef.current = false
          setRefreshing(false)
        }, 800)
      }
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove',  onTouchMove,  { passive: true })
    document.addEventListener('touchend',   onTouchEnd)

    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove',  onTouchMove)
      document.removeEventListener('touchend',   onTouchEnd)
    }
  }, [onRefresh])

  return { distance, refreshing, threshold: THRESHOLD }
}
