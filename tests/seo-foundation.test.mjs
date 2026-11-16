import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const robots = readFileSync(new URL("../robots.txt", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("../sitemap.xml", import.meta.url), "utf8");

test("homepage exposes Spanish SEO title, description and index directives", () => {
  assert.ok(html.includes('<html lang="es">'));
  assert.ok(html.includes("<title>JOA Multiverso | Videojuegos, anime, cine y comunidad gamer</title>"));
  assert.ok(html.includes('name="description" content="JOA Multiverso:'));
  assert.ok(html.includes('name="robots" content="index, follow'));
});

test("homepage declares canonical and social metadata", () => {
  assert.ok(html.includes('rel="canonical" href="https://junior18cubano-hash.github.io/mi-catalogo/'));
  assert.ok(html.includes('property="og:title"'));
  assert.ok(html.includes('name="twitter:card"'));
});

test("homepage includes valid JSON-LD website and business identities", () => {
  const marker = '<script type="application/ld+json">';
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, "JSON-LD script should exist");
  const contentStart = start + marker.length;
  const end = html.indexOf("</script>", contentStart);
  assert.notEqual(end, -1, "JSON-LD script should close");
  const data = JSON.parse(html.slice(contentStart, end));
  assert.ok(data["@graph"].some((entry) => entry["@type"] === "WebSite"));
  assert.ok(data["@graph"].some((entry) => entry["@type"] === "LocalBusiness"));
});
test("robots.txt allows crawling and points to the sitemap", () => {
  assert.ok(robots.includes("User-agent: *"));
  assert.ok(robots.includes("Allow: /"));
  assert.ok(robots.includes("Sitemap: https://junior18cubano-hash.github.io/mi-catalogo/sitemap.xml"));
});

test("sitemap contains the canonical homepage URL", () => {
  assert.ok(sitemap.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'));
  assert.ok(sitemap.includes("<loc>https://junior18cubano-hash.github.io/mi-catalogo/</loc>"));
});
