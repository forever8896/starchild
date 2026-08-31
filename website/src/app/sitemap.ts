import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/links";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/origin", "/contributors", "/about", "/contact", "/legal", "/privacy"];
  return routes.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: "monthly",
    priority: path === "" ? 1 : 0.7,
  }));
}
