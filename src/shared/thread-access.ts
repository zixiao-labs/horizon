export type ThreadRole = "owner" | "writer" | "reader";
export type MemberRole = Exclude<ThreadRole, "owner">;

export interface ThreadMember {
  readonly identity_id: string;
  readonly role: ThreadRole;
}
