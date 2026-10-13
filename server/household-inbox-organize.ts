import { organizedRequestSchema, type BILL_CATEGORIES } from "@shared/household-inbox";
import type { MailService } from "./mail-service";
import type { TimeSeriesService } from "./time-series-service";
import type { DatasetService } from "./dataset-service";
import { HouseholdInboxError } from "./household-inbox-service";

export interface OrganizeDeps {
  mail: Pick<MailService, "getEmail" | "upsertEmails">;
  series: Pick<TimeSeriesService, "getSeries" | "putSeries" | "putPoints">;
  datasets: Pick<DatasetService, "putRecords">;
  getPeople(userId: string): Promise<{ id: string; name: string }[]>;
}

export interface OrganizeResult {
  applied: "bill" | "daily-report" | "none";
  seriesId?: string;
  recordId?: string;
}

const CATEGORY_GROUP: Record<(typeof BILL_CATEGORIES)[number], string> = {
  electricity: "Utilities",
  gas: "Utilities",
  water: "Utilities",
  garbage: "Utilities",
  internet: "Internet",
  phone: "Internet",
  insurance: "Home",
  other: "Bills",
};

function slug(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function billSeriesId(vendor: string, category: string): string {
  const tail = "-" + category;
  const head = slug(vendor).slice(0, 64 - "mail-".length - tail.length).replace(/-+$/, "");
  return "mail-" + (head || "bill") + tail;
}

async function tagEmail(deps: OrganizeDeps, userId: string, mailId: string, kind: string) {
  const email = await deps.mail.getEmail(userId, mailId);
  if (!email) throw new HouseholdInboxError("Email not found", 404);
  const { ingestedAt, updatedAt, readAt, ...rest } = email;
  await deps.mail.upsertEmails(userId, { emails: [{ ...rest, kind }] });
}

export async function applyOrganized(userId: string, input: unknown, deps: OrganizeDeps): Promise<OrganizeResult> {
  const parsed = organizedRequestSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue.path.join(".");
    throw new HouseholdInboxError(path ? `${path}: ${issue.message}` : issue.message, 400);
  }
  const { mailId, kind, bill, day } = parsed.data;

  if (!(await deps.mail.getEmail(userId, mailId))) throw new HouseholdInboxError("Email not found", 404);
  if (kind === "other") return { applied: "none" };

  if (kind === "bill" && bill) {
    const seriesId = billSeriesId(bill.vendor, bill.category);
    try {
      await deps.series.getSeries(userId, seriesId);
    } catch (err: any) {
      if (err?.status !== 404) throw err;
      const label = bill.category[0].toUpperCase() + bill.category.slice(1);
      await deps.series.putSeries(userId, seriesId, {
        title: `${bill.vendor} ${label}`,
        tags: ["utilities"],
        unit: bill.currency,
        annotations: {
          vendor: bill.vendor,
          vendorShort: bill.vendor,
          category: label,
          group: CATEGORY_GROUP[bill.category],
        },
      });
    }
    await deps.series.putPoints(userId, seriesId, {
      points: [
        {
          t: bill.billDate,
          value: bill.amount,
          annotations: {
            ...(bill.dueDate ? { dueDate: bill.dueDate } : {}),
            emailId: mailId,
            currency: bill.currency,
          },
        },
      ],
    });
    await tagEmail(deps, userId, mailId, "bill");
    return { applied: "bill", seriesId };
  }

  if (day) {
    const people = await deps.getPeople(userId);
    if (!people.some((p) => p.id === day.personId)) throw new HouseholdInboxError("Unknown person", 400);
    const recordId = "mail-" + mailId;
    const data = {
      date: day.date,
      title: day.title,
      source: "household-email",
      ...(day.summary ? { summary: day.summary } : {}),
      ...(day.metrics?.length ? { metrics: day.metrics } : {}),
      ...(day.highlights?.length ? { highlights: day.highlights } : {}),
      ...(day.napSpans?.length
        ? {
            timeline: {
              start: day.napSpans.reduce((m, n) => (n.start < m ? n.start : m), "06:00"),
              end: day.napSpans.reduce((m, n) => (n.end > m ? n.end : m), "20:00"),
              spans: day.napSpans.map((s) => ({ start: s.start, end: s.end, label: "Nap" })),
            },
          }
        : {}),
      emailIds: [mailId],
    };
    await deps.datasets.putRecords(userId, "ff-person-day", {
      records: [{ id: recordId, data, emailIds: [mailId], personIds: [day.personId] }],
    });
    await tagEmail(deps, userId, mailId, "daily-report");
    return { applied: "daily-report", recordId };
  }

  throw new HouseholdInboxError("Nothing to apply", 400);
}
