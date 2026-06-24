// Column layout for the "Photoshoot & Marketing" tracker. One record per stock
// piece (keyed by Stock No.): the AI photoshoot image/video links plus the
// digital-marketing (Instagram) links and a comment. Stored in a dedicated
// "Photoshoot" tab of the same Google Sheet (auto-created on first write).
export const PHOTOSHOOT_TAB = "Photoshoot";

export const PHOTOSHOOT_HEADERS = [
  "Stock No.",
  "Design Name",
  "Gold Color",
  "Date",
  "Raw Images",
  "Prompt A",
  "Prompt B",
  "Prompt C",
  "Prompt D",
  "Video",
  "Instagram Post",
  "Instagram Reel",
  "Instagram Story",
  "Comments",
] as const;
