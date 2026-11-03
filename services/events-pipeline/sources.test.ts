import { test } from "node:test";
import assert from "node:assert/strict";
import type { FfEvent } from "../../shared/events";
import { applySourcePolicy } from "./sources";

const at = "2026-10-10T12:00:00.000Z";
const src = (url: string, kind: FfEvent["sources"][number]["kind"]) => ({ url, kind, retrievedAt: at });

function event(over: Partial<FfEvent> = {}): FfEvent {
  return {
    organizer: { name: "Riverside Farm", url: "https://riversidefarm.example/" },
    sources: [],
    cost: { isFree: false, ticketRequired: false, registrationRequired: false },
    title: "T",
    ...over,
  } as unknown as FfEvent;
}

test("orders official, then other, then listing, stably", () => {
  const e = applySourcePolicy(
    event({
      sources: [
        src("https://allevents.in/a", "listing"),
        src("https://riversidefarm.example/x", "listing"),
        src("https://app.amilia.com/store/en/riverside/shop", "listing"),
        src("https://patch.com/b", "listing"),
      ],
    }),
  );
  assert.deepEqual(
    e.sources.map((s) => [s.url, s.kind]),
    [
      ["https://riversidefarm.example/x", "official"],
      ["https://app.amilia.com/store/en/riverside/shop", "other"],
      ["https://allevents.in/a", "listing"],
      ["https://patch.com/b", "listing"],
    ],
  );
});

test("without an organizer everything is listing", () => {
  const e = applySourcePolicy(event({ organizer: undefined, sources: [src("https://riversidefarm.example/x", "official")] }));
  assert.equal(e.sources[0].kind, "listing");
});

test("listing sign-up and ticket links are dropped, others untouched", () => {
  const e = applySourcePolicy(
    event({
      cost: {
        isFree: false, ticketRequired: true, registrationRequired: true, priceText: "$5",
        registrationUrl: "https://activekids.com/x", ticketUrl: "https://riversidefarm.example/t",
      } as FfEvent["cost"],
    }),
  );
  assert.equal("registrationUrl" in e.cost, false);
  assert.equal(e.cost.ticketUrl, "https://riversidefarm.example/t");
  assert.equal(e.cost.priceText, "$5");
  assert.equal(e.title, "T");
});

test("idempotent", () => {
  const once = applySourcePolicy(
    event({ sources: [src("https://allevents.in/a", "listing"), src("https://riversidefarm.example/x", "other")] }),
  );
  assert.deepEqual(applySourcePolicy(once), once);
});
