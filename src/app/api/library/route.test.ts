import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "./route";

const auth = vi.hoisted(() => ({getCurrentUser:vi.fn(), isAdmin:vi.fn(), isBanned:vi.fn(), rateLimit:vi.fn()}));
const library = vi.hoisted(() => ({changeLibrary:vi.fn(), libraryState:vi.fn(), setReplyMode:vi.fn()}));
vi.mock("@/lib/auth", () => auth);
vi.mock("@/lib/discussion-library", () => library);

function write(body: object, origin = "https://baron.example") {
  return POST(new Request("https://baron.example/api/library", {
    method:"POST", headers:{origin,"content-type":"application/json"}, body:JSON.stringify({kind:"post",id:19,...body}),
  }));
}

beforeEach(() => {
  vi.resetAllMocks();
  auth.getCurrentUser.mockResolvedValue({id:7,termsCurrent:false});
  auth.isBanned.mockReturnValue(true);
  library.changeLibrary.mockResolvedValue(true);
  library.setReplyMode.mockResolvedValue(true);
});

it("allows a restricted account to mute, downgrade notifications, remove a save, and mark a reply as read", async () => {
  expect((await write({action:"reply-mode",mode:"muted"})).status).toBe(200);
  expect((await write({action:"reply-mode",mode:"direct"})).status).toBe(200);
  expect(await write({action:"save",active:false})).toMatchObject({status:200});
  expect(await write({action:"watch",active:false})).toMatchObject({status:200});
  expect(await write({action:"read",kind:"comment",active:true})).toMatchObject({status:200});
  expect(library.setReplyMode.mock.calls).toEqual([[7,19,"muted"],[7,19,"direct"]]);
  expect(library.changeLibrary.mock.calls).toEqual([[7,"post",19,"save",false],[7,"post",19,"watch",false],[7,"comment",19,"read",true]]);
  expect(auth.rateLimit).not.toHaveBeenCalled();
});

it("keeps participation gates on new saves and all-reply watches, and requires a same-origin session for private controls", async () => {
  for (const body of [{action:"save",active:true},{action:"watch",active:true},{action:"reply-mode",mode:"all"}]) {
    expect((await write(body)).status).toBe(403);
  }
  expect((await write({action:"reply-mode",mode:"muted"},"https://unrelated.example")).status).toBe(403);
  auth.getCurrentUser.mockResolvedValue(null);
  expect((await write({action:"save",active:false})).status).toBe(401);
  expect(library.setReplyMode).not.toHaveBeenCalled();
  expect(library.changeLibrary).not.toHaveBeenCalled();
});
