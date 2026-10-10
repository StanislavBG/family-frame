import type { UserData } from "./middleware";

/** Drop a deleted person from the people list, event attendees and the Photos person selection. */
export function removePersonRefs(
  userData: Pick<UserData, "people" | "events" | "settings">,
  personId: string,
): Pick<UserData, "people" | "events" | "settings"> {
  const people = (userData.people || []).filter((p) => p.id !== personId);
  const events = (userData.events || []).map((event) => ({
    ...event,
    people: (event.people || []).filter((id) => id !== personId),
  }));
  const current = userData.settings;
  const settings = current?.photoMediaPersonIds
    ? { ...current, photoMediaPersonIds: current.photoMediaPersonIds.filter((id) => id !== personId) }
    : current;
  return { people, events, settings };
}
