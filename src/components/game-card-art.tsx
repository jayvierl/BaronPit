"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { GameCardMotion } from "@/lib/game-card-motion";
import styles from "./game-card-art.module.css";

type DataConnection = EventTarget & { saveData?: boolean };
const reduceMotion = "(prefers-reduced-motion: reduce)";
const reduceData = "(prefers-reduced-data: reduce)";
const serverFalse = () => false;
const connection = () => (navigator as Navigator & { connection?: DataConnection }).connection;

function allowsMotion() {
  return !matchMedia(reduceMotion).matches && !matchMedia(reduceData).matches && !connection()?.saveData;
}

function watchMotion(listener: () => void) {
  const targets = [matchMedia(reduceMotion), matchMedia(reduceData), connection()];
  for (const target of targets) target?.addEventListener("change", listener);
  return () => {
    for (const target of targets) target?.removeEventListener("change", listener);
  };
}

function tabIsVisible() {
  return document.visibilityState === "visible";
}

function watchTab(listener: () => void) {
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
}

export function GameCardArt({ motion }: { motion: GameCardMotion }) {
  const frame = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(false);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  const allowed = useSyncExternalStore(watchMotion, allowsMotion, serverFalse);
  const tabVisible = useSyncExternalStore(watchTab, tabIsVisible, serverFalse);
  const shouldPlay = inView && tabVisible && allowed && !paused && !failed;
  const attachVideo = allowed && !failed && (started || paused || shouldPlay);
  const asset = `/game-cards/${motion}`;

  useEffect(() => {
    if (!frame.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      setInView(entry.isIntersecting && entry.intersectionRatio >= 0.2);
    }, { threshold: 0.2 });
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (!shouldPlay) {
      element.pause();
      return;
    }
    let active = true;
    element.muted = true;
    void element.play().catch((error: unknown) => {
      if (!active) return;
      if (error instanceof DOMException && error.name === "NotAllowedError") setPaused(true);
      else setFailed(true);
    });
    return () => { active = false; };
  }, [shouldPlay]);

  return (
    <div ref={frame} className={styles.frame} data-motion={motion}>
      <Image className={styles.still} src={`${asset}.webp`} alt="" width={640} height={360} loading="lazy" unoptimized />
      {attachVideo && (
        <video ref={video} className={shouldPlay && started ? styles.playing : styles.video}
          aria-hidden="true" muted playsInline loop preload="none"
          onPlaying={() => setStarted(true)} onError={event => {
            // A source can fail while the browser is trying the next format.
            if (event.target === event.currentTarget) setFailed(true);
          }}>
          <source src={`${asset}.webm`} type="video/webm" />
          <source src={`${asset}.mp4`} type="video/mp4" onError={() => setFailed(true)} />
        </video>
      )}
      {allowed && !failed && (started || paused) && (
        <button type="button" className={styles.control} aria-label={paused ? "Play game animation" : "Pause game animation"}
          title={paused ? "Play game animation" : "Pause game animation"} onClick={() => {
            setPaused(!paused);
            // Some browsers require the activation itself for a manual restart.
            if (paused && inView && tabVisible) void video.current?.play().catch(() => {});
          }}>
          <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true">
            <path d={paused ? "M5 2.5 13 8l-8 5.5z" : "M4 3h2.5v10H4zm5.5 0H12v10H9.5z"} />
          </svg>
        </button>
      )}
    </div>
  );
}
