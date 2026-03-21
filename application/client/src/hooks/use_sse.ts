import { useCallback, useEffect, useRef, useState } from "react";

interface SSEOptions<T> {
  onMessage: (data: T, prevContent: string) => string;
  onDone?: (data: T) => boolean;
  onComplete?: (finalContent: string) => void;
}

interface ReturnValues {
  content: string;
  isStreaming: boolean;
  start: (url: string) => void;
  stop: () => void;
  reset: () => void;
}

/** メインスレッドの負荷軽減のため、同一フレーム内の SSE をまとめて setState する */
export function useSSE<T>(options: SSEOptions<T>): ReturnValues {
  const MIN_STREAMING_VISIBLE_MS = 150;
  const [content, setContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const contentRef = useRef("");
  const rafIdRef = useRef<number | null>(null);
  /** EventSource 接続を次フレームにずらし、ストリーミング中 UI が 1 フレーム以上描画されるようにする */
  const connectRafRef = useRef<number | null>(null);
  const streamStartedAtRef = useRef<number | null>(null);
  const stopTimerRef = useRef<number | null>(null);

  const flushContentToState = useCallback(() => {
    rafIdRef.current = null;
    setContent(contentRef.current);
  }, []);

  const scheduleFlush = useCallback(() => {
    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(flushContentToState);
  }, [flushContentToState]);

  const cancelScheduledFlush = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cancelScheduledFlush();
      if (connectRafRef.current !== null) {
        cancelAnimationFrame(connectRafRef.current);
        connectRafRef.current = null;
      }
      if (stopTimerRef.current !== null) {
        window.clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
    };
  }, [cancelScheduledFlush]);

  const stop = useCallback(() => {
    cancelScheduledFlush();
    if (connectRafRef.current !== null) {
      cancelAnimationFrame(connectRafRef.current);
      connectRafRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }

    const startedAt = streamStartedAtRef.current;
    if (startedAt === null) {
      setIsStreaming(false);
      return;
    }

    const elapsed = performance.now() - startedAt;
    if (elapsed >= MIN_STREAMING_VISIBLE_MS) {
      streamStartedAtRef.current = null;
      setIsStreaming(false);
      return;
    }

    stopTimerRef.current = window.setTimeout(() => {
      stopTimerRef.current = null;
      streamStartedAtRef.current = null;
      setIsStreaming(false);
    }, MIN_STREAMING_VISIBLE_MS - elapsed);
  }, [cancelScheduledFlush]);

  const reset = useCallback(() => {
    stop();
    setContent("");
    contentRef.current = "";
  }, [stop]);

  const start = useCallback(
    (url: string) => {
      stop();
      if (stopTimerRef.current !== null) {
        window.clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      contentRef.current = "";
      setContent("");
      streamStartedAtRef.current = performance.now();
      setIsStreaming(true);

      connectRafRef.current = requestAnimationFrame(() => {
        connectRafRef.current = null;

        const eventSource = new EventSource(url);
        eventSourceRef.current = eventSource;

        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data) as T;

          const isDone = options.onDone?.(data) ?? false;
          if (isDone) {
            cancelScheduledFlush();
            setContent(contentRef.current);
            options.onComplete?.(contentRef.current);
            stop();
            return;
          }

          const newContent = options.onMessage(data, contentRef.current);
          contentRef.current = newContent;
          scheduleFlush();
        };

        eventSource.onerror = (error) => {
          cancelScheduledFlush();
          setContent(contentRef.current);
          console.error("SSE Error:", error);
          stop();
        };
      });
    },
    [cancelScheduledFlush, options, scheduleFlush, stop],
  );

  return { content, isStreaming, start, stop, reset };
}
