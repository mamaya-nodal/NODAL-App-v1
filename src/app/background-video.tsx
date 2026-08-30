"use client";

import { useEffect, useRef } from "react";

import styles from "./public-access.module.css";

export function BackgroundVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.defaultMuted = true;
    video.muted = true;
    video.playsInline = true;

    const play = () => {
      void video.play().catch(() => undefined);
    };

    play();
    video.addEventListener("canplay", play);
    document.addEventListener("visibilitychange", play);
    window.addEventListener("pointerdown", play, { once: true });

    return () => {
      video.removeEventListener("canplay", play);
      document.removeEventListener("visibilitychange", play);
      window.removeEventListener("pointerdown", play);
    };
  }, []);

  return (
    <video
      ref={videoRef}
      className={styles.backgroundVideo}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      poster="/video-nodal-poster.jpg"
      aria-hidden="true"
    >
      <source src="/video-nodal.mp4" type="video/mp4" />
    </video>
  );
}
