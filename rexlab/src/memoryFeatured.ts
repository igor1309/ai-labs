import type { FeaturedRecord, FeaturedStore } from "./featured.ts";

// The featured record held for this visit alone, starting from
// `initial`: nothing of it outlives the page.
export function memoryFeatured(initial: FeaturedRecord = { starts: {}, featured: undefined }): FeaturedStore {
  let record = initial;
  return {
    load: () => record,
    saveFeatured: (choice) => {
      record = { ...record, featured: choice };
    }
  };
}
