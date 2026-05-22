import { useEffect, useRef } from "react";
import { tokenStorage } from "../lib/storage";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export function useSSE(onEvent: (data: Record<string, unknown>) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    let active = true;
    let controller = new AbortController();

    async function connect() {
      const tokens = tokenStorage.get();
      if (!tokens?.access_token) return;

      try {
        const response = await fetch(`${API_BASE_URL}/sse/stream`, {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
          signal: controller.signal,
        });

        if (!response.ok || !response.body) return;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (active) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                onEventRef.current(data);
              } catch {
                // ignore
              }
            }
          }
        }
      } catch {
        // ignore abort errors
      }

      if (active) {
        setTimeout(connect, 3000);
      }
    }

    connect();

    return () => {
      active = false;
      controller.abort();
    };
  }, []);
}