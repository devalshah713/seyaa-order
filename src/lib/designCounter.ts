// Which category code a PD sheet's design number is built from, answered on the
// server.
//
// The code is read off the Lists screen, not from a map in here. The portal has
// always kept a code against each category, sub-category and sub-sub-category
// (see CODED_KINDS in memoFormat.ts), the Lists screen is where the office
// changes one, and suggestCode() already offers exactly the six the owner gave:
// Ring RG, Earring ER, Necklace NK, Bracelet BR, Pendant PEND, Bangle BN. A
// second map in code would be a second answer to the same question with nothing
// keeping the two in step, and the one that lost would be the one the office
// can see.
//
// What is in code is the shorter list of codes a number may be built from
// (DESIGN_CATEGORY_CODES). A category coded anything else, or coded nothing at
// all, gets no automatic number: the sheet says so and the PD man types the
// number by hand. Nothing silently produces a broken number.
//
// Asked on the server on every save, because the form holding the code is a
// convenience and the save is what decides.
import "server-only";
import { listPartyNames } from "./memoStore";
import { partyKey } from "./memoFormat";
import {
  designColourCode, isDesignCategoryCode, whyNoDesignNo, type DesignColour,
} from "./designCode";

export type DesignPlan =
  // The number can be built: this category's code and this sheet's colour.
  | { ok: true; code: string; colour: DesignColour; why: "" }
  // It cannot, and this is what to say about it.
  | { ok: false; code: string; colour: ""; why: string };

// The code the Lists screen holds against this category, or blank when the
// category is not on the list or carries no code.
export async function categoryCode(category: string): Promise<string> {
  const name = (category || "").trim();
  if (!name) return "";
  const lists = await listPartyNames(["category"]);
  const key = partyKey(name);
  const found = (lists.category || []).find((e) => partyKey(e.name) === key);
  return (found?.code || "").toUpperCase();
}

export async function planDesignNo(
  category: string,
  goldColor: string
): Promise<DesignPlan> {
  const code = await categoryCode(category);
  const colour = designColourCode(goldColor);
  if (!isDesignCategoryCode(code) || !colour) {
    return { ok: false, code, colour: "", why: whyNoDesignNo(category, code, goldColor) };
  }
  return { ok: true, code, colour, why: "" };
}
