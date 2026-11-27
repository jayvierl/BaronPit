# Feed and player lookup

| Home feed | Player lookup |
| --- | --- |
| ![Phone feed with four conversations, a compact composer and icon navigation](mobile-feed-fixture.webp) | ![Player lookup with ranked records, recent form and a rated match](mobile-player-fixture.webp) |

These screens use isolated development accounts and synthetic matches. They show the dark appearance at 390 × 844 pixels.

The feed keeps the author, time, writing and conversation actions together. Search, rooms and duo discovery remain reachable through navigation. Public profiles open on contributions. Player lookup opens on rank, games played, win rate and recent form. Each game has a single **Discuss this match** action. Match details expand in place.

| Same phone, same fixture | Previous layout | This change |
| --- | ---: | ---: |
| Top of the first feed post | 238 px | 173 px |
| Top of the first match row | 1,554 px | 623 px |
| Height of that match row | 548 px | 101 px |

### How a player earns MVP

For a completed ranked Solo/Duo or Flex game on Summoner’s Rift, the app compares all ten players on four measures from Riot’s match record. The measures are kill participation, share of team champion damage, share of team vision score, and fewer deaths. Each measure contributes equally. The final 1–10 rating gives the player’s place after combining the four measures. A sole first place earns the app’s MVP badge. Two players tied for first each receive 9.5.

A score describes one game. Comparisons can reflect role and team composition. The profile shows an average once its recent sample contains three rated games, alongside the number of games used. Incomplete data, games under 15 minutes and early surrenders leave the rating empty. Older eligible games can gain ratings during the existing on-demand snapshot refresh.
