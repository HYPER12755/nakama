import { useEffect, useState } from "react";
import {
  artChoices,
  onArtChange,
  resetArtChoice,
  setArtChoice,
  type ArtChoiceMap,
} from "../lib/artChoices";

/** The artwork choices, live in every component that shows the table. */
export function useArtChoices(): {
  choices: ArtChoiceMap;
  choose: (group: string, file: string) => void;
  reset: (group: string) => void;
} {
  const [choices, setChoices] = useState<ArtChoiceMap>(() => artChoices());

  useEffect(() => {
    setChoices(artChoices());
    return onArtChange(setChoices);
  }, []);

  return { choices, choose: setArtChoice, reset: resetArtChoice };
}
