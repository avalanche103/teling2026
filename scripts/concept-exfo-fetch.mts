/**
 * Local EXFO catalog refresh (exforus + c-tt + alfa + concept seed).
 * Usage: npx --yes tsx scripts/concept-exfo-fetch.mts
 */
import {
  diffExfoAgainstStore,
  fetchExfoCatalog,
} from "../lib/concept/exfo-catalog";

async function main() {
  console.log("Fetching EXFO catalog…");
  const cache = await fetchExfoCatalog({
    includeSsdSeed: true,
    scrapeExforus: true,
    scrapeCtt: true,
    scrapeAlfa: true,
  });
  const diff = diffExfoAgainstStore(cache.items);
  console.log(
    JSON.stringify(
      {
        productCount: cache.items.length,
        sources: cache.sources,
        warnings: cache.warnings || [],
        addedSincePrevious: cache.addedSincePrevious,
        updatedSincePrevious: cache.updatedSincePrevious,
        ...diff,
        sample: cache.items.slice(0, 8).map((i) => ({
          articul: i.articul,
          source: i.source,
          name: i.name.slice(0, 60),
          url: i.url.slice(0, 80),
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
