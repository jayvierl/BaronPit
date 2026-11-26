import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function checkSubmissions(journey) {
  const post = { kind: "text", body: "Which side should we ward after resetting?", submissionId: randomUUID(), expectedAuthorId: 501 };
  const options = { session: true, method: "POST", body: post };
  await journey("/api/social/post", { ...options, session: "helper", status: 409, includes:["Your signed-in account changed"] });
  const published = await journey("/api/social/post", options);
  assert.equal(published.status, "visible");
  assert.deepEqual(await journey("/api/social/post", options), published);

  const thread = "/post/" + published.postId;
  const reply = {
    session: "helper",
    method: "POST",
    body: { postId: published.postId, body: "Hold the river ward for the next objective.", submissionId: randomUUID() },
  };
  const comment = await journey("/api/social/comments", reply);
  assert.deepEqual(await journey("/api/social/comments", reply), comment);
  await journey(thread, { includes: [post.body] });
  await journey("/api/social/comments?postId=" + published.postId, { includes: [reply.body.body] });

  const withdraw = { session: true, method: "POST", body: { kind: "post", id: published.postId } };
  await journey("/api/social/withdraw", { ...withdraw, session: "helper", status: 404 });
  await journey("/me", { session: true, includes: ["My submissions", post.body, "Published"] });
  await journey("/api/social/withdraw", withdraw);
  await journey("/api/social/withdraw", withdraw);
  assert.deepEqual(await journey("/api/social/post", options), { ...published, status: "withdrawn" });
  await journey(thread, { status: "missing", excludes: [post.body, reply.body.body] });
  await journey("/me", { session: true, includes: ["Withdrawn"], excludes: [post.body] });
  await journey("/me", { session: "helper", includes: ["Thread unavailable"], excludes: [reply.body.body] });
}
