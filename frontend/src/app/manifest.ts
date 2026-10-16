import type { MetadataRoute } from "next";

/** Lets phones "Add to Home Screen" and open the app full-screen like a normal app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Twayba Inventory",
    short_name: "Twayba",
    description: "Warehouse, stock, POS and delivery system",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f8fb",
    theme_color: "#0c41a7",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
