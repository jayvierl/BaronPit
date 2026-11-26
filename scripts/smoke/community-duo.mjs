// Exercise the public community experience and private preferences while public matching is closed.
export async function checkCommunityDuo(journey) {
  await journey("/", {includes: ["Find your duo", "Set duo preferences", "Bot lane review hour"]});
  await journey("/rooms/lfg-lobby", {includes: ["Open Duo Finder"]});
  await journey("/review-hour", {includes: ["role=Support", "role=Bot", "Add this hour to calendar"]});
  await journey("/review-hour/calendar?day=2000-01-01", {status: 410});
  await journey("/lfg/thanks", {includes: ["Tip preview only", "Free thanks", "$4.50", "$0.50"]});
  const preferences = "/api/lfg/preferences";
  const settings = {action:"save", role:"Support", partnerRole:"ADC", blocks:["Weekend mornings"], vibe:"chill", communication:"text"};
  await journey(preferences, {method:"POST", body:settings, status:401});
  await journey(preferences, {method:"POST", session:true, body:settings, includes:['"ok":true']});
  await journey("/lfg", {session:true, includes:["Weekend mornings", "/lfg/thanks"]});
  await journey(preferences, {method:"POST", session:true, body:{action:"clear"}, includes:['"ok":true']});
}
