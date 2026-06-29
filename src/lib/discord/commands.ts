// Slash-command definitions, shared by the registration script and (by name) the handler.
// Option types: 3 = STRING, 6 = USER. See https://discord.com/developers/docs/interactions/application-commands
export const COMMANDS = [
  {
    name: "leaderboard",
    description: "Top ranked players (current season)",
    options: [
      {
        name: "tab",
        description: "Which ladder (default: overall)",
        type: 3,
        required: false,
        choices: [
          { name: "Overall", value: "overall" },
          { name: "Crew", value: "crew" },
          { name: "Impostor", value: "imp" },
        ],
      },
    ],
  },
  {
    name: "rank",
    description: "A player's rank card (defaults to you)",
    options: [{ name: "user", description: "Whose rank to show", type: 6, required: false }],
  },
  {
    name: "lastmatch",
    description: "A player's most recent ranked match (defaults to you)",
    options: [{ name: "user", description: "Whose last match to show", type: 6, required: false }],
  },
  {
    name: "tiers",
    description: "The rank tier ladder and ELO thresholds",
  },
  {
    name: "setup-leaderboard",
    description: "Post a live-updating leaderboard in this channel (refreshes after every match)",
    // "32" = MANAGE_GUILD: Discord only shows/allows this for server managers.
    default_member_permissions: "32",
    options: [
      {
        name: "tab",
        description: "Which ladder the live board tracks (default: overall)",
        type: 3,
        required: false,
        choices: [
          { name: "Overall", value: "overall" },
          { name: "Crew", value: "crew" },
          { name: "Impostor", value: "imp" },
        ],
      },
    ],
  },
];
