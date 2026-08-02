"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

const STREAM_URL =
  "https://stream.mux.com/tLkHO1qZoaaQOUeVWo8hEBeGQfySP02EPS02BmnNFyXys.m3u8";

interface ConnectionLike {
  saveData?: boolean;
}

function prefersStaticFrame(): boolean {
  if (typeof window === "undefined") return true;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return true;
  }
  const connection = (navigator as { connection?: ConnectionLike }).connection;
  return connection?.saveData === true;
}

export function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [staticFrame, setStaticFrame] = useState(false);

  useEffect(() => {
    if (prefersStaticFrame()) {
      setStaticFrame(true);
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | null = null;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = STREAM_URL;
    } else if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: false });
      hls.loadSource(STREAM_URL);
      hls.attachMedia(video);
    } else {
      setStaticFrame(true);
      return;
    }

    const play = () => {
      video.play().catch(() => {
        setStaticFrame(true);
      });
    };

    if (video.readyState >= 2) {
      play();
    } else {
      video.addEventListener("canplay", play, { once: true });
    }

    return () => {
      video.removeEventListener("canplay", play);
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, []);

  if (staticFrame) {
    return (
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,#12352a_0%,#070b0a_65%)]"
      />
    );
  }

  return (
    <video
      ref={videoRef}
      aria-hidden="true"
      muted
      autoPlay
      loop
      playsInline
      className="absolute inset-0 h-full w-full object-cover opacity-60"
    />
  );
}
