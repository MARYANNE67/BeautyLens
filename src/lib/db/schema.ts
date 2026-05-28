import {
  pgTable,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const userRoleEnum = pgEnum("user_role", ["student", "recruiter"])
export const visibilityEnum = pgEnum("visibility", ["public", "private"])
export const evidenceTypeEnum = pgEnum("evidence_type", ["github", "url", "file", "certificate"])
export const evidenceStrengthEnum = pgEnum("evidence_strength", ["strong", "moderate", "weak"])
export const experienceSourceEnum = pgEnum("experience_source", ["resume", "manual"])
export const verificationStatusEnum = pgEnum("verification_status", ["self_reported", "doc_supported"])
export const outreachStatusEnum = pgEnum("outreach_status", ["pending", "accepted", "declined"])
export const accessRequestStatusEnum = pgEnum("access_request_status", ["pending", "approved", "declined"])

export const users = pgTable("users", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
  email: text("email").notNull().unique(),
  role: userRoleEnum("role").notNull().default("student"),
  created_at: timestamp("created_at").defaultNow().notNull(),
})

export const profiles = pgTable("profiles", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
  user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  username: text("username").notNull().unique(),
  summary: text("summary"),
  target_roles: jsonb("target_roles").$type<string[]>().notNull().default([]),
  visibility: visibilityEnum("visibility").notNull().default("public"),
  private_token: text("private_token"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
})

export const skills = pgTable("skills", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
  profile_id: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  verified: boolean("verified").notNull().default(false),
  confidence_score: integer("confidence_score").notNull().default(0),
  created_at: timestamp("created_at").defaultNow().notNull(),
})

export const evidence = pgTable("evidence", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
  profile_id: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  type: evidenceTypeEnum("type").notNull(),
  url: text("url"),
  file_path: text("file_path"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  strength: evidenceStrengthEnum("strength").notNull().default("moderate"),
  is_private: boolean("is_private").notNull().default(false),
  linked_skill_ids: jsonb("linked_skill_ids").$type<string[]>().notNull().default([]),
  linked_experience_ids: jsonb("linked_experience_ids").$type<string[]>().notNull().default([]),
  created_at: timestamp("created_at").defaultNow().notNull(),
})

export const experiences = pgTable("experiences", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
  profile_id: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  organisation: text("organisation").notNull(),
  role: text("role").notNull(),
  start_date: text("start_date").notNull(),
  end_date: text("end_date"),
  description: text("description").notNull(),
  source: experienceSourceEnum("source").notNull().default("manual"),
  verification_status: verificationStatusEnum("verification_status").notNull().default("self_reported"),
  linked_evidence_ids: jsonb("linked_evidence_ids").$type<string[]>().notNull().default([]),
  created_at: timestamp("created_at").defaultNow().notNull(),
})

export const recruiter_searches = pgTable("recruiter_searches", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
  recruiter_id: text("recruiter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  jd_text: text("jd_text").notNull(),
  extracted_skills: jsonb("extracted_skills").$type<Record<string, unknown>>().notNull().default({}),
  created_at: timestamp("created_at").defaultNow().notNull(),
})

export const shortlists = pgTable("shortlists", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
  search_id: text("search_id").notNull().references(() => recruiter_searches.id, { onDelete: "cascade" }),
  candidate_profile_id: text("candidate_profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  outreach_status: outreachStatusEnum("outreach_status").notNull().default("pending"),
  created_at: timestamp("created_at").defaultNow().notNull(),
})

export const access_requests = pgTable("access_requests", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
  requester_id: text("requester_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  profile_id: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  evidence_id: text("evidence_id").references(() => evidence.id, { onDelete: "cascade" }),
  status: accessRequestStatusEnum("status").notNull().default("pending"),
  created_at: timestamp("created_at").defaultNow().notNull(),
})
