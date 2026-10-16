"use client";

import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { useEffect, useRef, useState } from "react";
import { Alert, Button } from "@/components/ui";
import { unlockAudio } from "@/lib/feedback";

/** Our labels are Code 128; suppliers' are usually EAN/UPC. Fewer formats = faster reads. */
const FORMATS = [
  BarcodeFormat.CODE_128,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_39,
  BarcodeFormat.QR_CODE,
];

/** The same code seen again within this time is the same scan, not a new one. */
const REPEAT_MS = 2500;

type State = "off" | "starting" | "on";

/** Live camera barcode reader (back camera on phones). Needs HTTPS or localhost. */
export function CameraScanner({ onScan }: { onScan: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastRef = useRef({ code: "", at: 0 });
  const onScanRef = useRef(onScan);
  const [state, setState] = useState<State>("off");
  const [error, setError] = useState("");
  const [torch, setTorch] = useState<boolean | null>(null);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  // Release the camera when leaving the page.
  useEffect(() => () => controlsRef.current?.stop(), []);

  async function start() {
    unlockAudio();
    setError("");
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError("The camera only works on a secure (https://) address. Open the app through its HTTPS link.");
      return;
    }
    setState("starting");
    const reader = new BrowserMultiFormatReader(new Map([[DecodeHintType.POSSIBLE_FORMATS, FORMATS]]), {
      delayBetweenScanAttempts: 150,
    });
    try {
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } }, audio: false },
        videoRef.current!,
        (result) => {
          if (!result) return;
          const code = result.getText().trim();
          const now = Date.now();
          if (!code || (code === lastRef.current.code && now - lastRef.current.at < REPEAT_MS)) return;
          lastRef.current = { code, at: now };
          onScanRef.current(code);
        },
      );
      controlsRef.current = controls;
      setTorch(controls.switchTorch ? false : null);
      setState("on");
    } catch (e) {
      setState("off");
      const name = e instanceof Error ? e.name : "";
      setError(
        name === "NotAllowedError"
          ? "Camera access was refused. Allow the camera for this site in your browser settings, then try again."
          : name === "NotFoundError" || name === "OverconstrainedError"
            ? "No camera found on this device."
            : name === "NotReadableError"
              ? "The camera is being used by another app. Close it and try again."
              : `Could not start the camera${e instanceof Error && e.message ? `: ${e.message}` : ""}`,
      );
    }
  }

  function stop() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setState("off");
    setTorch(null);
  }

  async function toggleTorch() {
    if (torch === null || !controlsRef.current?.switchTorch) return;
    try {
      await controlsRef.current.switchTorch(!torch);
      setTorch(!torch);
    } catch {
      setTorch(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={`relative overflow-hidden rounded-xl bg-black ${state === "off" ? "hidden" : ""}`}>
        <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline />
        {/* Aiming guide */}
        <div className="pointer-events-none absolute inset-x-[12%] top-1/2 h-1/3 -translate-y-1/2 rounded-lg border-2 border-white/80" />
        {state === "starting" && <p className="absolute inset-0 flex items-center justify-center text-sm text-white">Starting camera…</p>}
      </div>
      {error && <Alert>{error}</Alert>}
      <div className="flex gap-2">
        {state === "off" ? (
          <Button type="button" onClick={start} className="flex-1">
            📷 Start camera
          </Button>
        ) : (
          <>
            <Button type="button" variant="secondary" onClick={stop} className="flex-1">
              Stop camera
            </Button>
            {torch !== null && (
              <Button type="button" variant="secondary" onClick={toggleTorch} aria-pressed={torch}>
                {torch ? "Light off" : "Light on"}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
