import {expect,it,vi} from "vitest";
import {inventory} from "../scripts/media-inventory.mjs";
it("counts every page without returning object data or treating a missing credential as an empty inventory",async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(Response.json({blobs:[{size:2,url:"private"}],hasMore:true,cursor:"next"}))
    .mockResolvedValueOnce(Response.json({blobs:[{size:15}],hasMore:false}));
  expect(await inventory("",fetcher)).toEqual({status:"not configured"});
  expect(await inventory("fixture",fetcher)).toEqual({status:"complete",objects:2,bytes:17});
  expect(fetcher.mock.calls[1][0].searchParams.get("cursor")).toBe("next");
});
it("stops when the provider cannot complete enumeration",async()=>{
  await expect(inventory("fixture",async()=>Response.json({blobs:[],hasMore:true}))).rejects.toThrow("cursor");
});
