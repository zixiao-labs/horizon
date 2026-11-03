import type { MemberRole, ThreadMember } from "../../shared/thread-access";

/** Explicit provisioning, separate from passive replica state and WS retries.
 * Supply a fetch implementation carrying the same session as the sync socket.
 */
export class ThreadAccessClient {
  readonly #base: string;
  readonly #fetch: typeof fetch;

  constructor(baseUrl: string, authenticatedFetch: typeof fetch = fetch) {
    this.#base = baseUrl.replace(/\/+$/, "");
    this.#fetch = authenticatedFetch;
  }

  async create(threadId: string): Promise<void> {
    await this.#request("/threads", "POST", { thread_id: threadId });
  }

  async members(threadId: string): Promise<readonly ThreadMember[]> {
    const response = await this.#request(this.#membersPath(threadId), "GET");
    return (await response.json()) as ThreadMember[];
  }

  async grant(threadId: string, identityId: string, role: MemberRole): Promise<void> {
    await this.#request(`${this.#membersPath(threadId)}/${encodeURIComponent(identityId)}`, "PUT", {
      role,
    });
  }

  async revoke(threadId: string, identityId: string): Promise<void> {
    await this.#request(
      `${this.#membersPath(threadId)}/${encodeURIComponent(identityId)}`,
      "DELETE",
    );
  }

  #membersPath(threadId: string): string {
    return `/threads/${encodeURIComponent(threadId)}/members`;
  }

  async #request(path: string, method: string, body?: unknown): Promise<Response> {
    const response = await this.#fetch(`${this.#base}${path}`, {
      method,
      credentials: "include",
      ...(body === undefined
        ? {}
        : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      // Do not echo arbitrary HTML/proxy errors or authentication headers.
      throw new Error(`Thread access request failed (${response.status})`);
    }
    return response;
  }
}
