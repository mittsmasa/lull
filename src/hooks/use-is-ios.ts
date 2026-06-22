"use client";

import { useEffect, useState } from "react";

export function useIsIos() {
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    setIsIos(/iPad|iPhone|iPod/.test(navigator.userAgent));
  }, []);

  return isIos;
}
