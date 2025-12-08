# Shoot – Online Multiplayer Shoot Card Game

This project is a proof-of-concept implementation of a four-player online "shoot" card game. It is designed for web browsers on phones, tablets, or desktops and focuses on functionality over detailed graphics. Cards are displayed with simple text (face-down cards show as `*******`), and UI cues rely on coloured badges, circles, and text bubbles to communicate status.

## Features

- **Lobby + code-based tables** – the first player can create a table and share the 5-character join code; others join before play starts.
- **Persistent fake bankrolls** – each unique username starts with £50.00 (stored in SQLite). Bets/payouts automatically adjust balances.
- **Ready checks** – every seat has a `Ready?` button with colour-coded status (green/yellow/red) and waiting banner when fewer than four players are seated.
- **Dealer stake control** – the dealer selects one of the allowed stakes (20p to £1) before the round begins. Stake amount is added to the pot immediately.
- **Full deck logic** – 52 cards shuffled each game; Aces count as 1, 2–10 as pip values, Jack=11, Queen=12, King=13.
- **Shoot flow with pauses** – when a player shoots, everyone sees: announcement → short pause → flipped card → second pause → result (win or continue).
- **All-in fallback** – players who can’t cover the shoot cost can “Go All In!”, risking their entire balance for a double-or-nothing flip while the round continues.
- **Turn + round enforcement** – action order follows the initial dealer-draw ranking; if nobody beats the dealer card after three rounds, the dealer wins the pot.
- **Dealer draw ceremony** – once everyone is ready, each player (starting from seat 1) draws a card with dramatic pauses; the highest card becomes the dealer for the entire game.
- **Responsive UI** – layout scales down for mobile, using CSS grid/flex plus simple shapes (table circle, player chips, pot badge, etc.).

## Tech Stack

| Layer      | Details |
|------------|---------|
| Backend    | Node.js (CommonJS) with Express, Socket.IO, better-sqlite3 |
| Frontend   | Vanilla JS module + Socket.IO client + custom CSS |
| Database   | SQLite database stored at `server/data/shootgame.db` |
| Dev tools  | Nodemon for hot reloading (`npm run dev`) |

## Project Structure

```
ShootGame/
├─ README.md
└─ server/
   ├─ package.json
   ├─ index.js            # Express + Socket.IO entrypoint
   ├─ db.js               # SQLite helpers and balance utilities
   ├─ gameManager.js      # All lobby / game / turn logic
   ├─ data/
   │  └─ shootgame.db     # Auto-created SQLite file
   └─ public/
      ├─ index.html       # Responsive lobby/table UI
      ├─ styles.css       # Placeholder styling
      └─ app.js           # Client logic & socket wiring
```

## Getting Started

> **Prerequisites:** Install [Node.js 18+](https://nodejs.org/) (which also installs npm). The development environment in this workspace currently lacks Node, so the steps below haven’t been executed here—please run them locally.

1. **Install dependencies**
   ```powershell
   cd server
   npm install
   ```

2. **Development mode with auto-restart**
   ```powershell
   npm run dev
   ```
   This uses `nodemon` to restart the server when files change.

3. **Production mode** (serves the static UI and API via the same server)
   ```powershell
   npm start
   ```

4. Browse to [http://localhost:4000](http://localhost:4000) and open the game from multiple browsers/devices for testing.

### Database Notes

- The SQLite file (`server/data/shootgame.db`) is created automatically after the first username is registered.
- Balances are stored in pennies. Each new username (case-insensitive) gets £50.00.
- To reset all bankrolls, delete the `.db` file while the server is stopped.

## Hosting from Your Public IP

To allow remote friends to join using your own IP address:

1. **Choose a port** – by default the server listens on port `4000`. You can change it with `PORT=xxxx node index.js` if needed.
2. **Allow the port through Windows Firewall**
   - Open *Windows Defender Firewall → Advanced settings → Inbound Rules*.
   - Add a **New Rule** for **Port**, TCP `4000`, allow connection, apply to all profiles, name it “ShootGame Server”.
3. **Set up router port forwarding**
   - Find your computer’s local IP (e.g., `192.168.1.23`).
   - Log into your router and forward external TCP port `4000` to the same port on that local IP.
4. **Share the URL + join code**
   - Your friends will navigate to `http://<your-public-ip>:4000/` (or a dynamic DNS hostname if you have one).
   - Send them the table code generated after you press “Create table”.
5. **Keep the server running**
   - Use `npm start` (or `node index.js`) in a terminal window. Leave it open while people play.

> ⚠️ When exposing a service on the public internet, consider:
> - Using a firewall/port-forwarding rule only while needed.
> - Avoid running as Administrator; keep the process in a regular user session.
> - Share the join URL/code only with people you trust.

## Gameplay Tips

- All four players must be seated and press “Ready to play?” to start a match.
- Dealer selects the stake before cards are dealt. Stake immediately deducts from the dealer balance and feeds the pot.
- On your turn choose either **Stake (20p)** or **Shoot**. Shooting deducts the current pot value from your balance before revealing a card.
- If you can’t afford the shoot cost, tap **Go All In!** to risk your entire balance; a winning flip pays double your stake but the round continues to the next player.
- Face-down cards show as `*******` until flipped. When you flip due to a shoot, everyone sees the card and the broadcast message.
- Each player gets 3 turns per game; after 3 full rounds with no winner the dealer grabs the pot.
- Each match is a single three-round game; when three full rounds pass without a shoot win, the dealer takes the pot and the lobby reopens (a new dealer will be drawn next time players ready up).

## Troubleshooting

- **“npm: command not found”** – install Node.js, then restart your terminal.
- **Players can’t connect externally** – double-check firewall + router forwarding, confirm you shared the *public* IP (e.g., from https://ifconfig.me) and that your ISP isn’t blocking the port.
- **Balances look stuck** – delete `server/data/shootgame.db` to reset; or inspect it with a SQLite browser.
- **Need HTTPS?** – run the server behind a reverse proxy (nginx, Caddy, Cloudflare Tunnel) and forward WebSockets to port 4000.

Enjoy playing SHOOT!
