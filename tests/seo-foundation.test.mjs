import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const robots = readFileSync(new URL("../robots.txt", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("../sitemap.xml", import.meta.url), "utf8");

test("homepage exposes Spanish SEO title, description and index directives", () => {
  assert.match(html, /<html lang="es">/);
  assert.match(html, /<title>JOA Multiverso \| Videojuegos, anime, cine y comunidad gamer<\/title>/);
  assert.match(html, /<meta name="description" content="JOA Multiverso:/);
  assert.match(html, /<meta name="robots" content="index, follow/);
});

test("homepage declares canonical and social metadata", () => {
  assert.match(html, /rel="canonical" href="https:\/\/junior18cubano-hash\.github\.io\/mi-catalogo\//);
  assert.match(html, /property="og:title"/);
  assert.match(html, /name="twitter:card"/);
});

test("homepage includes validly structured JSON-LD business and website identities", () => {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, "JSON-LD script should exist");
  const data = JSON.parse(match[1]);
  assert.ok(data["@graph"].some((entry) => entry["@type"] === "WebSite"));
  assert.ok(data["@graph"].some((entry) => entry["@type"] === "LocalBusiness"));
});

test("robots.txt allows crawling and points to the sitemap", () => {
  assert.match(robots, /User-agent: \*/);
  assert.match(robots, /Allow: \/);
  assert.match(robots, /Sitemap: https:\/\/junior18cubano-hash\.github\.io\/mi-catalogo\/sitemap\.xml/);
});

test("sitemap contains the canonical homepage URL", () => {
  assert.match(sitemap, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(sitemap, /<loc>https:\/\/junior18cubano-hash\.github\.io\/mi-catalogo\/<\/loc>/);
});
