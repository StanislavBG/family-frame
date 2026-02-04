import { useState, useEffect, useCallback, useRef } from "react";

export interface SleepTimerState {
  isActive: boolean;
  remainingSeconds: number;
  selectedMinutes: number | null;
}

export interface UseSleepTimerOptions {
  onTimerEnd?: () => void;
}

export function useSleepTimer(options: UseSleepTimerOptions = {}) {
  const [state, setState] = useState<SleepTimerState>({
    isActive: false,
    remainingSeconds: 0,
    selectedMinutes: null,
  });
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startTimer = useCallback((minutes: number) => {
    clearTimer();
    const seconds = minutes * 60;
    setState({
      isActive: true,
      remainingSeconds: seconds,
      selectedMinutes: minutes,
    });

    intervalRef.current = setInterval(() => {
      setState((prev) => {
        const newRemaining = prev.remainingSeconds - 1;
        if (newRemaining <= 0) {
          clearTimer();
          options.onTimerEnd?.();
          return {
            isActive: false,
            remainingSeconds: 0,
            selectedMinutes: null,
          };
        }
        return { ...prev, remainingSeconds: newRemaining };
      });
    }, 1000);
  }, [clearTimer, options.onTimerEnd]);

  const stopTimer = useCallback(() => {
    clearTimer();
    setState({
      isActive: false,
      remainingSeconds: 0,
      selectedMinutes: null,
    });
  }, [clearTimer]);

  const addTime = useCallback((minutes: number) => {
    setState((prev) => ({
      ...prev,
      remainingSeconds: prev.remainingSeconds + minutes * 60,
    }));
  }, []);

  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, []);

  return {
    ...state,
    startTimer,
    stopTimer,
    addTime,
    formatTime,
  };
}
