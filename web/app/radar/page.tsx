"use client";

import { useEffect, useState } from "react";

export default function RadarPage() {
  const [src, setSrc] = useState("http://localhost:5188");

  useEffect(() => {
    setSrc(`http://${window.location.hostname}:5188`);
  }, []);

  return (
    <div className="h-screen w-screen">
      <iframe
        src={src}
        title="Agent Radar"
        className="h-full w-full border-0"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
