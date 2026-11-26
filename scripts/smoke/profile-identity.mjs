import assert from "node:assert/strict";

function authorLink(html) {
  return html.match(/<a\b[^>]*\bhref="\/u\/501(?:\?[^"\s]*)?"[^>]*>[\s\S]*?<\/a>/g)?.find(link => link.includes('class="avatar"'));
}

export async function checkCrossAppIdentity(journey, expected) {
  const feed = await journey("/?tab=following", {session:true, html:true});
  const search = await journey("/search?q=River%20Scout", {html:true});
  const composer = feed.match(/<fieldset\b[^>]*aria-label="Post to the Pit"[^>]*>([\s\S]*?)<textarea/);
  const views = [
    ["existing post", authorLink(feed)],
    ["community search", authorLink(search)],
    ["signed-in composer", composer?.[1]],
  ];
  for (const [surface, markup] of views) {
    assert.ok(markup?.includes('class="avatar"'), "Missing avatar on " + surface);
    if (expected.kind === "upload") {
      const url = "/api/profile-photo/" + expected.id + "?v=" + expected.hash;
      assert.ok(markup.includes(url), "Selected photo missing on " + surface);
    } else {
      assert.ok(!markup.includes('class="avatar-art"'), "Removed photo still shown on " + surface);
    }
  }
  const result = await journey("/api/social/comments?postId=521");
  const reply = result.comments.find(comment => comment.id === 550 && comment.authorId === 501);
  assert.deepEqual(reply?.authorAvatar, expected, "Existing reply should use the author's current avatar");
}
