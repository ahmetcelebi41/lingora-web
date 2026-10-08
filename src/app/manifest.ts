import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LINGORA",
    short_name: "LINGORA",
    // Resolve against the manifest URL: / locally, /lingora-web/ on Pages.
    id: "./",
    start_url: "./",
    scope: "./",
    display: "standalone",
    background_color: "#f8f9fb",
    theme_color: "#4f46e5",
    lang: "tr",
    icons: [
      {
        src: "./icons/lingora-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "./icons/lingora-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
