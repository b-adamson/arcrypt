"use client";

import { useEffect, useRef, useState } from "react";

export function useBidFlash(value?: number) {
  const [flash, setFlash] = useState(false);
  const prev = useRef<number | undefined>(value);

  useEffect(() => {
    if (value !== undefined && prev.current !== undefined && value > prev.current) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 700);
      return () => clearTimeout(t);
    }
    prev.current = value;
  }, [value]);

  return flash;
}