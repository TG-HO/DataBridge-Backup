import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DataBridge AI - Analytics Intelligence Platform",
    short_name: "DataBridge AI",
    description: "Enterprise AI analytics dashboard with real-time telemetry, model metrics, and chat intelligence.",
    start_url: "/",
    display: "standalone",
    background_color: "#09090B",
    theme_color: "#00E599",
    orientation: "portrait-primary",
    scope: "/",
    icons: [
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
    categories: ["business", "productivity", "utilities"],
  };
}
