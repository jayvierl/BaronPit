// Exercise the public community experience and private preferences while public matching is closed.
export async function checkCommunityDuo(journey) {
  await journey("/", {includes: ["Find your duo", "Set duo preferences", "Bot lane review hour"]});
  await journey("/rooms/lfg-lobby", {includes: ["Open Duo Finder"]});
  await journey("/lfg?view=all", {includes: ['href="#duo-plan"', 'id="duo-plan"', "Set duo preferences"]});
  await journey("/review-hour", {includes: ["role=Support", "role=Bot", "Add this hour to calendar"]});
  await journey("/review-hour/calendar?day=2000-01-01", {status: 410});
  await journey("/lfg/thanks", {includes: ["public 90-day total", "Tip preview only", "Free thanks", "$4.50", "$0.50"]});
  await journey("/api/lfg", {method:"POST", body:{action:"endorse",id:1}, status:401});
  await journey("/api/lfg", {method:"POST", session:true, body:{action:"endorse",id:1,amount:500}, status:400,
    includes:["only accepts a duo request ID"]});
  await journey("/pilot", {includes:["NA bot-lane duo evening","Sign in to share availability"]});
  await journey("/api/pilot/evening", {method:"POST",body:{action:"save"},status:401});
  await journey("/api/pilot/evening", {method:"POST",session:true,body:{action:"save",role:"Support",start:"2000-01-01T02:00:00.000Z",consent:true},status:400});
  await journey("/api/pilot/evening", {method:"POST",session:true,body:{action:"sample",consent:true},status:409});
  await journey("/api/lfg/reminder?id=1", {status:401});
  await journey("/api/lfg/reminder?id=1", {session:true, status:404});
  const preferences = "/api/lfg/preferences";
  const settings = {action:"save", role:"Support", partnerRole:"ADC", timeZone:"America/Chicago", blocks:["Weekend mornings"], vibe:"chill", communication:"text"};
  await journey(preferences, {method:"POST", body:settings, status:401});
  await journey(preferences, {method:"POST", session:true, body:settings, includes:['"ok":true']});
  await journey("/lfg", {session:true, includes:["Weekend mornings", "/lfg/thanks"]});
  await journey(preferences, {method:"POST", session:true, body:{action:"clear"}, includes:['"ok":true']});
}
