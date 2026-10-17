// Whether the page is hidden, as the document's visibility reports it.
export type DocumentVisibility = {
  hidden(): boolean;
  // Calls `onChange` on each change until the returned function is called.
  watch(onChange: () => void): () => void;
};

export function documentVisibility(document: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">): DocumentVisibility {
  return {
    hidden: () => document.visibilityState === "hidden",
    watch: (onChange) => {
      document.addEventListener("visibilitychange", onChange);
      return () => document.removeEventListener("visibilitychange", onChange);
    }
  };
}
