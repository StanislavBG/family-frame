import { useState, useEffect } from "react";

type TimeFormat = "12h" | "24h";

export function useClock(timeFormat: TimeFormat = "24h") {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    if (timeFormat === "24h") {
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      });
    }
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    }).replace(/\s?(AM|PM)/, '');
  };

  const formatPeriod = (date: Date) => {
    if (timeFormat === "24h") {
      return "";
    }
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    }).includes('AM') ? 'AM' : 'PM';
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatYear = (date: Date) => {
    return date.getFullYear().toString();
  };

  return {
    currentTime,
    time: formatTime(currentTime),
    period: formatPeriod(currentTime),
    date: formatDate(currentTime),
    year: formatYear(currentTime),
  };
}
