"use client";

import { useState, useEffect } from "react";
import { api } from "./client";

export function useData<T>(path: string | null, version = 0) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setError("");
    setLoading(true);
    if (!path) {
      setData(null);
      setLoading(false);
      return;
    }
    api<T>(path)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) {
          setData(null);
          setError(e.message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, version]);
  return { data, error, loading };
}
