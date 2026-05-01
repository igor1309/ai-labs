import type { Item } from "./discovery";

export interface Section {
  id: "prompts" | "skills";
  items: Item[];
  title: "Prompts" | "Skills";
}

export function assembleSections(prompts: Item[], skills: Item[]): Section[] {
  return [
    {
      id: "prompts",
      items: sortItems(prompts),
      title: "Prompts"
    },
    {
      id: "skills",
      items: sortItems(skills),
      title: "Skills"
    }
  ];
}

function sortItems(items: Item[]): Item[] {
  return [...items].sort((left, right) => {
    if (left.id < right.id) {
      return -1;
    }

    if (left.id > right.id) {
      return 1;
    }

    return 0;
  });
}
