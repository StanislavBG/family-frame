# Household email (operator and household guide)

Households can forward email to Family Frame for free. This guide covers how it works, the operator setup, and the steps each household follows.

## 1. How it works

- The operator owns one dedicated Gmail inbox.
- Each household gets a plus address: `<base>+<key>` for the household, and `<base>+<key>-<person>` for one person. `<base>` is the inbox address (for example `inbox@gmail.com`), `<key>` is a secret routing key.
- A household forwards mail to its address. Gmail delivers it to the operator's inbox.
- A local timer runs `npm run inbox:run` every 5 minutes. It reads new Gmail messages, works out the household and person from the plus address, and posts each message to the service API (`POST /api/service/inbox/deliver`).
- The server stores the mail in the household's mailbox. Agents keep reading it through the usual mail tools.
- Held sources: a sender the household has not approved, or a message that fails authentication, is held. Nothing from a held source reaches the mailbox until the household approves it.
- The routing key is secret. A household can rotate it, which retires the old address.

## 2. Operator setup

Cost: free. It uses the Gmail API quota and a local timer. No paid service is involved.

1. Create a dedicated Gmail account for the inbox.
2. In Google Cloud, create a project, enable the Gmail API, and create an OAuth client of type **Desktop app**.
3. Set the OAuth consent screen to **In production**. Refresh tokens issued while it is in Testing expire after 7 days, and the timer would stop working.
4. Create an env file (for example `~/.config/family-frame-inbox/env`) with:

   | Variable | Value |
   | --- | --- |
   | `FF_BASE_URL` | Public URL of Family Frame |
   | `FF_SERVICE_TOKEN` | The `ff_svc_` service token. Same token as Events |
   | `INBOX_ADDRESS` | The inbox address, for example `inbox@gmail.com` |
   | `INBOX_GMAIL_CLIENT_ID` | OAuth client ID |
   | `INBOX_GMAIL_CLIENT_SECRET` | OAuth client secret |
   | `INBOX_GMAIL_TOKEN_FILE` | Path where the refresh token is saved |

   Set `INBOX_ENV_FILE` to the env file path. The systemd unit sets it for you.
5. Authorize Gmail once: `npm run inbox:run -- auth`. Open the printed link, approve access, and the refresh token is saved to `INBOX_GMAIL_TOKEN_FILE`.
6. On Replit, set the secret `HOUSEHOLD_INBOX_ADDRESS` to the same inbox address. Without it, Settings shows that household email is not set up.
7. Check one run by hand: `npm run inbox:run`. It prints a JSON summary.
8. Install the timer:

   ```bash
   mkdir -p ~/.config/systemd/user ~/.local/state/family-frame-inbox
   cp services/mail-intake/systemd/family-frame-inbox.* ~/.config/systemd/user/
   systemctl --user daemon-reload
   systemctl --user enable --now family-frame-inbox.timer
   ```

   Edit `WorkingDirectory` in the service file if the repo is not at `~/Projects/family-frame`. Logs go to `~/.local/state/family-frame-inbox/run.log`.

The service token reaches only `/api/service/events/` and `/api/service/inbox/`.

The service is outside the root `npm test` and `npm run check`. Use `npm run inbox:test` and `npm run inbox:check`.

## 3. Household steps

1. Open **Settings > Household email** and turn it on. The household address and one address per person appear.
2. In Gmail, open Settings > Forwarding and POP/IMAP > Add a forwarding address, and paste the address.
3. Gmail sends a confirmation request. It appears in Family Frame under held sources. Open the Gmail confirmation link and approve it.
4. Create a Gmail filter (From: the sender) with "Forward it to" the address.
5. When a new sender shows up under pending sources, approve it. Mail from unapproved senders stays held.
6. Use a person's address when the mail is about one person. It goes to that person's views.
7. To retire an address, use **Rotate address**. Update your Gmail forwarding and filters to the new address.

## 4. Agents

Agents publish with `mail_upsert_emails` as before. Household email is an extra way in, not a replacement.
