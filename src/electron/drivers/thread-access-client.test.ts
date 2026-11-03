import { expect, it } from "@lightning-js/lightning";
import { ThreadAccessClient } from "./thread-access-client";

it("provisions threads and manages membership without advancing a replica", async () => {
  const requests: { url: string; options?: RequestInit }[] = [];
  const client = new ThreadAccessClient("https://horizon.test/", async (input, options) => {
    requests.push({ url: String(input), options });
    return options?.method === "GET"
      ? Response.json([{ identity_id: "owner", role: "owner" }])
      : new Response(null, { status: 204 });
  });
  await client.create("thread");
  await client.grant("thread", "person/id", "reader");
  expect((await client.members("thread"))[0]?.role).toBe("owner");
  await client.revoke("thread", "person/id");
  expect(requests.map((request) => request.url)).toEqual([
    "https://horizon.test/threads",
    "https://horizon.test/threads/thread/members/person%2Fid",
    "https://horizon.test/threads/thread/members",
    "https://horizon.test/threads/thread/members/person%2Fid",
  ]);
  expect(requests.map((request) => request.options?.method)).toEqual([
    "POST",
    "PUT",
    "GET",
    "DELETE",
  ]);
  expect(requests[0]?.options?.body).toBe(JSON.stringify({ thread_id: "thread" }));
  expect(requests[1]?.options?.body).toBe(JSON.stringify({ role: "reader" }));
  expect(requests.every((request) => request.options?.credentials === "include")).toBe(true);
});

it("surfaces denied membership operations without returning server content", async () => {
  const client = new ThreadAccessClient(
    "https://horizon.test",
    async () => new Response("private upstream detail", { status: 403 }),
  );
  let error: unknown;
  try {
    await client.create("thread");
  } catch (caught) {
    error = caught;
  }
  expect(String(error)).toBe("Error: Thread access request failed (403)");
});
