export type UserRole = "student" | "recruiter"

export interface User {
  id: string
  email: string
  role: UserRole
  created_at: string
}

export interface Profile {
  id: string
  user_id: string
  username: string
  summary: string | null
  target_roles: string[]
  visibility: "public" | "private"
  private_token: string | null
  created_at: string
  updated_at: string
}

export interface Skill {
  id: string
  profile_id: string
  name: string
  verified: boolean
  confidence_score: number
  created_at: string
}

export type EvidenceType = "github" | "url" | "file" | "certificate"
export type EvidenceStrength = "strong" | "moderate" | "weak"

export interface Evidence {
  id: string
  profile_id: string
  title: string
  type: EvidenceType
  url: string | null
  file_path: string | null
  tags: string[]
  strength: EvidenceStrength
  is_private: boolean
  linked_skill_ids: string[]
  linked_experience_ids: string[]
  created_at: string
}

export type VerificationStatus = "self_reported" | "doc_supported"
export type ExperienceSource = "resume" | "manual"

export interface Experience {
  id: string
  profile_id: string
  title: string
  organisation: string
  role: string
  start_date: string
  end_date: string | null
  description: string
  source: ExperienceSource
  verification_status: VerificationStatus
  linked_evidence_ids: string[]
  created_at: string
}

export interface RecruiterSearch {
  id: string
  recruiter_id: string
  jd_text: string
  extracted_skills: Record<string, unknown>
  created_at: string
}

export type OutreachStatus = "pending" | "accepted" | "declined"

export interface Shortlist {
  id: string
  search_id: string
  candidate_profile_id: string
  outreach_status: OutreachStatus
  created_at: string
}

export type AccessRequestStatus = "pending" | "approved" | "declined"

export interface AccessRequest {
  id: string
  requester_id: string
  profile_id: string
  evidence_id: string | null
  status: AccessRequestStatus
  created_at: string
}

export interface ExtractedSkill {
  name: string
  confidence: number
  evidence_type: "resume" | "github" | "both"
  verified: boolean
}

export interface ExtractedExperience {
  title: string
  organisation: string
  role: string
  start_date: string
  end_date: string | null
  description: string
  type: "work" | "education" | "project"
}

export interface ScoredEvidence {
  strength: EvidenceStrength
  reasoning: string
  suggested_tags: string[]
}

export interface JDExtractionResult {
  required_skills: Array<{
    name: string
    weight: "must_have" | "nice_to_have"
    category: string
  }>
  role_type: string
  seniority: string
}
