"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserCodeReader } from "@zxing/browser";
import { Button } from "@/lib/ui/components";

type Props = {
  disabled?: boolean;
  onDetected: (text: string) => void;
};

/** Форматы для Chromium BarcodeDetector (если доступен). */
const BARCODE_DETECTOR_FORMATS = [
  "code_128",
  "ean_13",
  "ean_8",
  "code_39",
  "itf",
  "qr_code",
  "upc_a",
  "upc_e",
  "codabar",
] as const;

function CameraIcon() {
  return (
    <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

/** Кнопка сканирования штрихкода камерой для ТСД (все режимы с полем скана). */
export function TsdCameraScanButton({ disabled, onDetected }: Props) {
  const [open, setOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const stoppedRef = useRef(false);
  const zxingControlsRef = useRef<{ stop: () => void } | null>(null);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  const stopAll = useCallback(() => {
    stoppedRef.current = true;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    try {
      zxingControlsRef.current?.stop();
    } catch {
      /* ignore */
    }
    zxingControlsRef.current = null;

    streamRef.current?.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    });
    streamRef.current = null;

    const v = videoRef.current;
    if (v?.srcObject instanceof MediaStream) {
      v.srcObject.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          /* ignore */
        }
      });
    }
    if (v) {
      BrowserCodeReader.cleanVideoSource(v);
    }
    BrowserCodeReader.releaseAllStreams();
  }, []);

  const handleClose = useCallback(() => {
    stopAll();
    setCameraError(null);
    setOpen(false);
  }, [stopAll]);

  useEffect(() => {
    if (!open) return;
    stoppedRef.current = false;
    setCameraError(null);

    const videoEl = videoRef.current;
    if (!videoEl) return;

    let cancelled = false;

    async function start(video: HTMLVideoElement) {
      try {
        const BD =
          typeof window !== "undefined" &&
          "BarcodeDetector" in window &&
          typeof (window as unknown as { BarcodeDetector?: new (o?: { formats?: string[] }) => unknown }).BarcodeDetector ===
            "function";

        if (BD) {
          const BarcodeDetectorCtor = (
            window as unknown as {
              BarcodeDetector: new (opts?: { formats?: string[] }) => {
                detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
              };
            }
          ).BarcodeDetector;

          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
            audio: false,
          });
          if (cancelled || stoppedRef.current) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          streamRef.current = stream;
          video.srcObject = stream;
          await video.play();

          const detector = new BarcodeDetectorCtor({
            formats: [...BARCODE_DETECTOR_FORMATS],
          });

          const loop = async () => {
            if (cancelled || stoppedRef.current) return;
            try {
              const codes = await detector.detect(video);
              const raw = codes?.[0]?.rawValue;
              if (raw) {
                stopAll();
                setOpen(false);
                onDetectedRef.current(raw);
                return;
              }
            } catch {
              // покадровые сбои — игнорируем
            }
            rafRef.current = requestAnimationFrame(() => void loop());
          };
          void loop();
          return;
        }

        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (cancelled || stoppedRef.current) return;

        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
          if (cancelled || stoppedRef.current) return;
          const text = result?.getText();
          if (text) {
            try {
              controls.stop();
            } catch {
              /* ignore */
            }
            zxingControlsRef.current = null;
            stopAll();
            setOpen(false);
            onDetectedRef.current(text);
          }
        });
        if (cancelled || stoppedRef.current) {
          try {
            controls.stop();
          } catch {
            /* ignore */
          }
          BrowserCodeReader.cleanVideoSource(video);
          BrowserCodeReader.releaseAllStreams();
          return;
        }
        zxingControlsRef.current = controls;
      } catch {
        if (!cancelled) {
          setCameraError("Не удалось открыть камеру. Нужны HTTPS и разрешение на камеру.");
        }
      }
    }

    void start(videoEl);

    return () => {
      cancelled = true;
      stopAll();
    };
  }, [open, stopAll]);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        disabled={disabled}
        onClick={() => setOpen(true)}
        aria-label="Сканировать штрихкод камерой"
        style={{
          minWidth: 56,
          minHeight: 56,
          padding: 0,
          flexShrink: 0,
          alignSelf: "stretch",
        }}
      >
        <CameraIcon />
      </Button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="tsd-camera-scan-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 400,
            background: "rgba(0,0,0,0.82)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            gap: 16,
          }}
        >
          <h2 id="tsd-camera-scan-title" style={{ margin: 0, color: "#fff", fontSize: 18, fontWeight: 700 }}>
            Наведите камеру на штрихкод
          </h2>
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            style={{
              width: "100%",
              maxWidth: 480,
              maxHeight: "55vh",
              borderRadius: 12,
              background: "#111",
              objectFit: "cover",
            }}
          />
          {cameraError && (
            <p style={{ margin: 0, color: "#fecaca", textAlign: "center", maxWidth: 400, fontSize: 15 }}>
              {cameraError}
            </p>
          )}
          <Button type="button" variant="secondary" size="lg" onClick={handleClose} fullWidth style={{ maxWidth: 480 }}>
            Отмена
          </Button>
        </div>
      )}
    </>
  );
}
