import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { getFirebaseDb } from "./firebase";
import {
  DATA_LIMITS,
  SCHEMA_ID_PATTERN,
  putDataRecordsSchema,
  putDataSchemaSchema,
  type DataRecord,
  type DataSchema,
} from "@shared/agent-data";
import {
  PERSON_DAY_DESCRIPTION,
  PERSON_DAY_JSON_SCHEMA,
  PERSON_DAY_SCHEMA_ID,
  PERSON_DAY_TITLE,
  PERSON_WEEK_DESCRIPTION,
  PERSON_WEEK_JSON_SCHEMA,
  PERSON_WEEK_SCHEMA_ID,
  PERSON_WEEK_TITLE,
  RESERVED_SCHEMA_PREFIX,
} from "@shared/person-views";

export class DatasetError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "DatasetError";
  }
}

export interface DatasetDeps {
  get(path: string): Promise<any>;
  set(path: string, value: any): Promise<void>;
  // Multi-path update: keys are relative paths ("recordId"), null deletes.
  update(path: string, values: Record<string, any>): Promise<void>;
  remove(path: string): Promise<void>;
  now?(): Date;
}

export interface ListRecordsOptions {
  emailId?: string;
  personId?: string;
  limit?: number;
  offset?: number;
}

// CJS/ESM interop under tsx/esbuild vs the bundled build.
const Ajv: typeof Ajv2020 = (Ajv2020 as any).default ?? Ajv2020;
const applyFormats: typeof addFormats = (addFormats as any).default ?? addFormats;

// No loadSchema option: remote $ref is never fetched (SSRF-safe). A fresh
// instance per compile keeps agent-supplied $id values from colliding across
// users or schemas.
function compileSchema(jsonSchema: Record<string, unknown>) {
  const ajv = new Ajv({ strict: true, allErrors: false, allowUnionTypes: true });
  applyFormats(ajv);
  try {
    return ajv.compile(jsonSchema);
  } catch (e) {
    throw new DatasetError(`Invalid JSON Schema: ${(e as Error).message}`, 400);
  }
}

const byteSize = (x: unknown) => Buffer.byteLength(JSON.stringify(x));

function toSchema(raw: any): DataSchema {
  const { jsonSchemaJson, ...rest } = raw;
  return { ...rest, jsonSchema: JSON.parse(jsonSchemaJson) } as DataSchema;
}

function toRecord(raw: any): DataRecord {
  const { dataJson, ...rest } = raw;
  return { ...rest, data: JSON.parse(dataJson), emailIds: rest.emailIds ?? [], personIds: rest.personIds ?? [] } as DataRecord;
}

const BUILTIN_TS = "2026-10-09T00:00:00.000Z";

function builtin(id: string, title: string, description: string, jsonSchema: unknown) {
  return { id, title, description, version: 1, jsonSchemaJson: JSON.stringify(jsonSchema), createdAt: BUILTIN_TS, updatedAt: BUILTIN_TS };
}

// Virtual: never written to RTDB, present for every user.
const BUILTIN_SCHEMAS: Record<string, any> = {
  [PERSON_DAY_SCHEMA_ID]: builtin(PERSON_DAY_SCHEMA_ID, PERSON_DAY_TITLE, PERSON_DAY_DESCRIPTION, PERSON_DAY_JSON_SCHEMA),
  [PERSON_WEEK_SCHEMA_ID]: builtin(PERSON_WEEK_SCHEMA_ID, PERSON_WEEK_TITLE, PERSON_WEEK_DESCRIPTION, PERSON_WEEK_JSON_SCHEMA),
};

export function createDatasetService(deps: DatasetDeps) {
  const now = () => (deps.now ? deps.now() : new Date()).toISOString();
  const validators = new Map<string, ReturnType<typeof compileSchema>>();

  const schemasPath = (u: string) => `appData/${u}/schemas`;
  const recordsPath = (u: string, s: string) => `appData/${u}/records/${s}`;

  function checkSchemaId(schemaId: string) {
    if (typeof schemaId !== "string" || !SCHEMA_ID_PATTERN.test(schemaId)) {
      throw new DatasetError("Invalid schema id", 400);
    }
  }

  function checkNotReserved(schemaId: string) {
    if (schemaId.startsWith(RESERVED_SCHEMA_PREFIX)) {
      throw new DatasetError(`Schema ids starting with "${RESERVED_SCHEMA_PREFIX}" are reserved by Family Frame`, 403);
    }
  }

  function dropValidators(userId: string, schemaId: string) {
    const prefix = `${userId}:${schemaId}:`;
    Array.from(validators.keys()).forEach((k) => {
      if (k.startsWith(prefix)) validators.delete(k);
    });
  }

  async function loadSchema(userId: string, schemaId: string): Promise<any> {
    checkSchemaId(schemaId);
    if (BUILTIN_SCHEMAS[schemaId]) return BUILTIN_SCHEMAS[schemaId];
    const raw = await deps.get(`${schemasPath(userId)}/${schemaId}`);
    if (!raw) throw new DatasetError("Schema not found", 404);
    return raw;
  }

  return {
    async putSchema(userId: string, schemaId: string, input: unknown): Promise<DataSchema> {
      checkSchemaId(schemaId);
      checkNotReserved(schemaId);
      const parsed = putDataSchemaSchema.safeParse(input);
      if (!parsed.success) throw new DatasetError(parsed.error.issues.map((i) => i.message).join("; "), 400);
      const { title, description, jsonSchema } = parsed.data;
      const jsonSchemaJson = JSON.stringify(jsonSchema);
      if (Buffer.byteLength(jsonSchemaJson) > DATA_LIMITS.schemaBytesMax) {
        throw new DatasetError(`jsonSchema exceeds ${DATA_LIMITS.schemaBytesMax} bytes`, 400);
      }
      compileSchema(jsonSchema);

      const existing = await deps.get(`${schemasPath(userId)}/${schemaId}`);
      if (!existing) {
        // Cap is read-then-write; a small overshoot under concurrent writers is acceptable.
        const all = (await deps.get(schemasPath(userId))) ?? {};
        if (Object.keys(all).length >= DATA_LIMITS.schemasPerUserMax) {
          throw new DatasetError(`Schema limit of ${DATA_LIMITS.schemasPerUserMax} reached`, 409);
        }
      }
      const ts = now();
      // Updating a schema does NOT revalidate existing records; they keep the
      // schemaVersion they were stamped with.
      const stored: Record<string, any> = {
        id: schemaId,
        title,
        version: existing ? (existing.version ?? 0) + 1 : 1,
        jsonSchemaJson,
        createdAt: existing?.createdAt ?? ts,
        updatedAt: ts,
      };
      if (description !== undefined) stored.description = description;
      await deps.set(`${schemasPath(userId)}/${schemaId}`, stored);
      dropValidators(userId, schemaId);
      return toSchema(stored);
    },

    async listSchemas(userId: string): Promise<DataSchema[]> {
      const all = (await deps.get(schemasPath(userId))) ?? {};
      const own = Object.values<any>(all)
        .map(toSchema)
        .sort((a, b) => a.id.localeCompare(b.id));
      return [...Object.values(BUILTIN_SCHEMAS).map(toSchema), ...own];
    },

    async getSchema(userId: string, schemaId: string): Promise<DataSchema> {
      return toSchema(await loadSchema(userId, schemaId));
    },

    async deleteSchema(userId: string, schemaId: string): Promise<void> {
      checkSchemaId(schemaId);
      checkNotReserved(schemaId);
      await loadSchema(userId, schemaId);
      await deps.remove(recordsPath(userId, schemaId));
      await deps.remove(`${schemasPath(userId)}/${schemaId}`);
      dropValidators(userId, schemaId);
    },

    async putRecords(userId: string, schemaId: string, input: unknown) {
      const schema = await loadSchema(userId, schemaId);
      const parsed = putDataRecordsSchema.safeParse(input);
      if (!parsed.success) throw new DatasetError(parsed.error.issues.map((i) => i.message).join("; "), 400);
      const { records } = parsed.data;

      const key = `${userId}:${schemaId}:${schema.version}`;
      let validate = validators.get(key);
      if (!validate) {
        validate = compileSchema(JSON.parse(schema.jsonSchemaJson));
        validators.set(key, validate);
      }

      // Validate everything before writing anything (all-or-nothing).
      records.forEach((rec, index) => {
        if (byteSize(rec) > DATA_LIMITS.recordBytesMax) {
          throw new DatasetError(`Record ${index} (${rec.id}) exceeds ${DATA_LIMITS.recordBytesMax} bytes`, 400);
        }
        if (!validate!(rec.data)) {
          const err = validate!.errors?.[0];
          throw new DatasetError(
            `Record ${index} (${rec.id}) invalid at "${err?.instancePath ?? ""}": ${err?.message ?? "validation failed"}`,
            400,
          );
        }
      });

      const existing: Record<string, any> = (await deps.get(recordsPath(userId, schemaId))) ?? {};
      const ids = records.map((r) => r.id);
      const newIds = new Set(ids.filter((id) => !(id in existing)));
      // Cap is read-then-write; a small overshoot under concurrent writers is acceptable.
      if (Object.keys(existing).length + newIds.size > DATA_LIMITS.recordsPerDatasetMax) {
        throw new DatasetError(`Dataset limit of ${DATA_LIMITS.recordsPerDatasetMax} records reached`, 409);
      }

      const ts = now();
      const values: Record<string, any> = {};
      for (const rec of records) {
        values[rec.id] = {
          id: rec.id,
          schemaId,
          schemaVersion: schema.version,
          dataJson: JSON.stringify(rec.data),
          emailIds: rec.emailIds ?? [],
          personIds: Array.from(new Set(rec.personIds ?? [])),
          createdAt: existing[rec.id]?.createdAt ?? ts,
          updatedAt: ts,
        };
      }
      await deps.update(recordsPath(userId, schemaId), values);
      const created = newIds.size;
      return { created, updated: new Set(ids).size - created, ids };
    },

    async listRecords(userId: string, schemaId: string, opts: ListRecordsOptions = {}) {
      await loadSchema(userId, schemaId);
      const all = (await deps.get(recordsPath(userId, schemaId))) ?? {};
      let list = Object.values<any>(all).map(toRecord);
      if (opts.emailId) list = list.filter((r) => r.emailIds.includes(opts.emailId!));
      if (opts.personId) list = list.filter((r) => r.personIds.includes(opts.personId!));
      list.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
      const limit = Math.min(Math.max(opts.limit ?? DATA_LIMITS.listLimitDefault, 1), DATA_LIMITS.listLimitMax);
      const offset = Math.max(opts.offset ?? 0, 0);
      return { records: list.slice(offset, offset + limit), total: list.length };
    },

    async getRecord(userId: string, schemaId: string, recordId: string): Promise<DataRecord> {
      await loadSchema(userId, schemaId);
      const raw = await deps.get(`${recordsPath(userId, schemaId)}/${recordId}`);
      if (!raw) throw new DatasetError("Record not found", 404);
      return toRecord(raw);
    },

    async deleteRecord(userId: string, schemaId: string, recordId: string): Promise<void> {
      await loadSchema(userId, schemaId);
      const path = `${recordsPath(userId, schemaId)}/${recordId}`;
      if (!(await deps.get(path))) throw new DatasetError("Record not found", 404);
      await deps.remove(path);
    },
  };
}

export type DatasetService = ReturnType<typeof createDatasetService>;

let instance: DatasetService | null = null;
function defaultService(): DatasetService {
  if (!instance) {
    instance = createDatasetService({
      async get(path) {
        return (await getFirebaseDb().ref(path).once("value")).val();
      },
      async set(path, value) {
        await getFirebaseDb().ref(path).set(value);
      },
      async update(path, values) {
        await getFirebaseDb().ref(path).update(values);
      },
      async remove(path) {
        await getFirebaseDb().ref(path).remove();
      },
    });
  }
  return instance;
}

// Lazy: Firebase is only touched when a method is called, never on import.
export const datasetService: DatasetService = {
  putSchema: (...args) => defaultService().putSchema(...args),
  listSchemas: (...args) => defaultService().listSchemas(...args),
  getSchema: (...args) => defaultService().getSchema(...args),
  deleteSchema: (...args) => defaultService().deleteSchema(...args),
  putRecords: (...args) => defaultService().putRecords(...args),
  listRecords: (...args) => defaultService().listRecords(...args),
  getRecord: (...args) => defaultService().getRecord(...args),
  deleteRecord: (...args) => defaultService().deleteRecord(...args),
};
