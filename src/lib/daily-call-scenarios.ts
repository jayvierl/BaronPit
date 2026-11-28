export type DailyCallScenario = {
  title: string;
  body: string;
  options: readonly [string, string, string, string];
  /** Editor-approved breakdown shown in the original thread after the call
   * closes. `published` is the editors' approval flag: an unpublished or
   * missing breakdown renders an honest "not published yet" note instead. */
  breakdown?: {
    when: string;
    risk: string;
    changes: string;
    published: boolean;
  };
};

export const dailyCallScenarios = [
  {
    title: "Bot lane’s first recall",
    body: "Imagine your bot lane has enough gold for a buy. The opposing duo just recalled, and your wave is building. What do you do before going back?",
    options: ["Crash the stacked wave", "Thin the wave and recall early", "Hold the wave for another trade", "Use lane priority to ward, then recall"],
  },
  {
    title: "Top wave or dragon",
    body: "Imagine you’re Top. A big wave is about to reach your turret, dragon spawns in 35 seconds, and your Teleport is ready. What’s your call?",
    options: ["Catch the wave and save Teleport", "Recall and walk to dragon early", "Push one wave and Teleport if it starts", "Ask for a top-side trade"],
  },
  {
    title: "Mid turret just fell",
    body: "Imagine you took the enemy mid outer turret. Your jungler is nearby, your bot wave is moving forward, and both enemy side lanes are missing. Where do you use the window?",
    options: ["Ward one jungle entrance together", "Move bot with the advancing wave", "Recall and spend your gold", "Stay mid to cover the next wave"],
  },
  {
    title: "Jungle’s cross-map choice",
    body: "Imagine the enemy jungler shows bot while your low-health top laner is catching a stacked wave. You’re near the top river. What do you prioritize?",
    options: ["Cover the top laner’s wave", "Take an enemy camp and leave", "Start the top-side objective", "Ward the route and finish your own camps"],
  },
  {
    title: "One safe ward",
    body: "Imagine you’re Support, dragon spawns soon, and your team has just lost river vision. Mid can move in a few seconds. How do you start the setup?",
    options: ["Wait for mid and enter together", "Ward from the near jungle entrance", "Sweep the route your team will use", "Reset for wards and meet your team"],
  },
  {
    title: "A pick near Baron",
    body: "Imagine your team catches the enemy mid near Baron. Their jungler is missing, your carry is low, and your top wave is pushing. What do you call?",
    options: ["Start Baron and watch the entrances", "Clear vision and wait for another pick", "Use the top wave to pressure a turret", "Reset together and return with items"],
  },
  {
    title: "Two recalls before dragon",
    body: "Imagine dragon spawns in a minute. Your Mid and ADC both have a buy, and the enemy team is already walking toward river. How do you time the recalls?",
    options: ["Recall together after pushing mid", "Send ADC back first while Mid holds", "Send Mid back first while ADC pushes", "Spend the window setting vision"],
  },
  {
    title: "A side wave for the ADC",
    body: "Imagine you’re ADC with a completed item. Four teammates are showing mid, a big wave is arriving bot, and the enemy engage support is missing. What do you do?",
    options: ["Catch the wave with Support nearby", "Group mid until the enemy shows", "Take the safe half of the wave", "Ask a teammate to swap lanes"],
  },
  {
    title: "Where to use Herald",
    body: "Imagine your jungler has Herald. Mid’s turret is within reach, bot has a stacked wave, and the enemy team is gathering near top. Which window do you take?",
    options: ["Use Herald mid to open the map", "Use Herald bot with the stacked wave", "Save Herald for the next clean push", "Use Herald top with your grouped team"],
  },
  {
    title: "Follow the engage or peel",
    body: "Imagine you’re Support. Your frontline catches two enemies near mid, and the opposing assassin is still missing. Your ADC is behind you with Flash down. What do you do?",
    options: ["Stay close and save crowd control", "Follow the engage while it’s open", "Stand between the fight and your ADC", "Ping back and cover the escape route"],
  },
  {
    title: "Freeze or take the recall",
    body: "Imagine you’re Top. The enemy just recalled, your wave is held near your turret, and you have gold for an item. The next cannon wave is on its way. What’s your move?",
    options: ["Keep the freeze and deny the wave", "Crash the wave and recall", "Recall now and Teleport back if needed", "Build a slow push before recalling"],
  },
  {
    title: "Bot tower is down",
    body: "Imagine your bot lane took the first turret. Mid is even, top has a losing matchup, and the next dragon is still a while away. How would you use the bot duo?",
    options: ["Rotate the bot duo mid", "Send the bot duo top", "Keep ADC bot and roam with Support", "Keep the duo bot for another wave"],
  },
  {
    title: "Stagger the resets?",
    body: "Imagine your team wins a mid skirmish, spends most of its health and mana, and can still reach a turret. The enemy survivors are clearing the next wave. What do you call?",
    options: ["Push one more wave, then recall together", "Recall now while the map is quiet", "Stagger recalls so two players hold mid", "Clear nearby vision and then recall"],
  },
  {
    title: "An early river contest",
    body: "Imagine you’re Jungle with Scuttle nearby. The opposing jungler walks into river, your mid wave is even, and your top laner has a small push. How do you use the time?",
    options: ["Ask Top to move and contest", "Give river and take a safe camp", "Ward the entrance and wait for Mid", "Circle toward the opposite river"],
  },
  {
    title: "Getting back into your jungle",
    body: "Imagine the enemy team controls your top jungle entrance after taking mid turret. Your Top needs to catch a wave and your jungler has camps up. How do you get in?",
    options: ["Enter through the nearer safe route", "Escort Top and ward on the way out", "Push mid together to reclaim space", "Trade farm on the other side"],
  },
  {
    title: "Dragon or Herald trade",
    body: "Imagine the enemy duo and jungler start dragon. Your Top can move, your Mid is under turret, and Herald is available. What’s your team’s response?",
    options: ["Start Herald with Top", "Group and contest through mid", "Push top for turret pressure", "Take safe farm and reset for the next play"],
  },
  {
    title: "One more turret",
    body: "Imagine your team wins near the enemy base. Two defenders are alive, one lane’s wave is already at a turret, and Baron is up. What do you call before respawns?",
    options: ["Push with the wave toward the inhibitor", "Move straight to Baron", "Set Baron vision and reset", "Pressure two lanes for one more wave"],
  },
  {
    title: "One dragon from Soul",
    body: "Imagine your team is one dragon away from Soul. It spawns in 40 seconds, your Top has Teleport, and the enemy has pushed both nearby waves. Where do you begin?",
    options: ["Clear mid and enter river together", "Have Top push a side lane with Teleport ready", "Hold your jungle entrance for a pick", "Send two players to clear bot first"],
  },
  {
    title: "A camp or a gank",
    body: "Imagine you’re Jungle about to start a camp. Enemy Mid used Flash, but your Mid needs to clear a wave and your bot river ward just expired. What do you do with the window?",
    options: ["Wait for Mid to clear, then gank", "Finish the camp and revisit mid", "Ward bot river before another play", "Hover mid to cover a countergank"],
  },
  {
    title: "Support’s roam timer",
    body: "Imagine your ADC recalls after a crash. You have enough health to roam, Mid has an even wave, and your jungler is walking toward river. Where do you go?",
    options: ["Roam mid and return for the next bot wave", "Escort your jungler through river", "Recall to match your ADC’s timing", "Set defensive bot vision and wait"],
  },
  {
    title: "An open side lane",
    body: "Imagine you’re Top with Teleport down. Your next wave threatens a side turret, your team is grouping mid, and the enemy has shown four players there. How far do you push?",
    options: ["Hit the turret while four players show", "Push the wave and move toward mid", "Hide near the lane to catch a rotation", "Leave immediately and group mid"],
  },
  {
    title: "A tricky mid recall",
    body: "Imagine you’re Mid with enough gold for a component. Both mid laners have Flash down, the enemy just returned to lane, and your jungler is on the same side. When do you base?",
    options: ["Ask Jungle to cover a quick crash", "Thin the wave and recall now", "Stay for a safer wave after the next trade", "Play toward Jungle and recall after vision"],
  },
  {
    title: "ADC buy during dragon",
    body: "Imagine you’re ADC with a major buy waiting. Your jungler starts dragon as a bot wave reaches your side, and the enemy bot duo can move first. What’s your call?",
    options: ["Join dragon and ping that bot can move", "Clear the wave and then move", "Ask the team to back off while you buy", "Meet Support at the safe river entrance"],
  },
  {
    title: "The engage is on cooldown",
    body: "Imagine the enemy frontline spends its main engage and retreats into an unwarded river. Your team has damage ready, but two teammates are still catching up. What do you call?",
    options: ["Advance just far enough to regain vision", "Ping for a quick turn on their frontline", "Hold the entrance until teammates arrive", "Use the opening to push mid"],
  },
  {
    title: "Defending two waves",
    body: "Imagine the enemy has Baron buff and sends waves mid and top. Your Mid can clear from range, and your Top has a flank angle from base. How do you cover both lanes?",
    options: ["Split the wave-clear and hold both towers", "Group five at the more exposed tower", "Show three mid and set up a top flank", "Give the first turret and defend deeper"],
    breakdown: {
      when: "Split if both groups can clear safely and see the enemy rotate. Defend deeper if vision is gone and the two waves land together. The flank is better when your team can stall mid and collapse at the same time.",
      risk: "The risk is getting picked before your team can regroup.",
      changes: "Vision between lanes, timing of the waves, and who can clear without walking up.",
      published: true,
    },
  },
  {
    title: "Elder after the skirmish",
    body: "Imagine Elder is up after a split fight. Your team has four players alive, your jungler respawns soon, and one enemy carry is already back on the map. What’s the call?",
    options: ["Hold vision until your jungler returns", "Start Elder while you have numbers", "Push a lane to draw out the carry", "Reset low-health players and regroup"],
  },
  {
    title: "One last bot plate",
    body: "Imagine your bot duo can reach a turret plate while the opposing ADC is recalling. Their support left vision, and your next wave is small. How much do you commit?",
    options: ["Take the plate together and leave", "Take a few hits while Support watches", "Recall before the enemy duo returns", "Push the next wave and set river vision"],
  },
  {
    title: "Teleport for the dive?",
    body: "Imagine you’re Top with Teleport ready. Your bot duo is low under turret, two enemies are visible nearby, and your lane opponent is building a wave. How do you respond?",
    options: ["Teleport early to prevent the dive", "Wait for a clearer commitment before using it", "Push top and call for your duo to back away", "Hold your wave and ask Jungle to cover bot"],
  },
  {
    title: "Last ward before the fight",
    body: "Imagine you’re Support with one ward left. Your team has a route to dragon, but nobody can see the far river entrance and your ADC’s retreat path is dark. Where does it go?",
    options: ["Ward the far entrance with an escort", "Ward the ADC’s retreat path", "Ward over the pit wall from safety", "Hold the ward for the next team movement"],
  },
  {
    title: "Turn or finish",
    body: "Imagine your team is halfway through Baron. Two enemies show at the river entrance, their jungler is missing, and your own jungler has Smite ready. What do you call?",
    options: ["Finish Baron with everyone on damage", "Turn together on the visible enemies", "Send two players to zone the entrance", "Leave the pit and re-enter on your terms"],
  },
] as const satisfies readonly DailyCallScenario[];
