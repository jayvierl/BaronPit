import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkCrossAppIdentity } from "./profile-identity.mjs";

export async function checkProfileEditor(journey) {
  const editor = "/profile/edit";
  const edit = "/api/account/profile";
  const upload = "/api/account/photo";
  await journey(editor, { status: 307, signInReturn: editor });
  await journey(edit, { method: "POST", body: {}, status: 401 });
  await journey(editor, { session: true, includes: ["Edit profile", "Display name", "Bio"] });

  const update = { displayName: "River Scout", bio: "Support main learning jungle routes.", profileLink: "/rooms/general" };
  const choice = { kind: "champion", id: "Ashe" };
  const save = (body, options = {}) => journey(edit, { method: "POST", session: true, body, ...options });
  const leagueIcon = { kind: "riot-icon", id: 17 };
  await save({ avatar: leagueIcon }, { status: 409 });
  assert.deepEqual((await save({ avatar: leagueIcon }, { session: "helper" })).avatar, leagueIcon);
  const first = await save({ ...update, avatar: choice, profileVersion: 0 });
  assert.deepEqual(first.avatar, choice);
  assert.equal(first.profileLink, update.profileLink);
  const publicProfile = await journey("/u/501", { html: true });
  assert.ok(publicProfile.includes(update.bio) && publicProfile.includes(update.displayName));
  assert.match(publicProfile, /class="avatar-art"[^>]*\/champions\/[^"]+?\.webp/);
  assert.ok(publicProfile.includes('href="/rooms/general"'));
  await save({ ...update, displayName: "Stale name", profileVersion: 0 }, { status: 409 });

  const file = await readFile(new URL("../../public/baron-emblem-96.webp", import.meta.url));
  await journey(upload, { method: "POST", upload: file, status: 401 });
  const receipt = await journey(upload, { method: "POST", session: true, upload: file, status: 201 });
  assert.equal(receipt.status, "approved");
  assert.match(receipt.photoHash, /^[a-f0-9]{64}$/);
  const image = { kind: "upload", id: receipt.photoId, hash: receipt.photoHash };
  const url = "/api/profile-photo/" + image.id + "?v=" + image.hash;
  const preview = upload + "/preview?id=" + image.id + "&v=" + image.hash;
  await journey(url, { status: 404 });
  await journey(preview, { status: 401 });
  await journey(preview, { session: "helper", status: 404 });
  await journey(preview, { session: true, expectWebp: true });
  await save({ ...update, avatar: image }, { session: "helper", status: 409 });
  const second = await save({ ...update, avatar: image, profileVersion: first.profileVersion });
  assert.deepEqual(second.avatar, image);
  await journey(url, { expectWebp: true });
  const withPhoto = await journey("/u/501", { html: true });
  assert.ok(withPhoto.includes(url), "Public social profile did not render the selected photo");
  await checkCrossAppIdentity(journey, image);

  const removed = await save({ ...update, avatar: { kind: "initials" }, profileVersion: second.profileVersion });
  assert.deepEqual(removed.avatar, { kind: "initials" });
  await journey(url, { status: 404 });
  await journey("/u/501", { includes: [update.bio], excludes: [image.id] });
  await checkCrossAppIdentity(journey, removed.avatar);
}
