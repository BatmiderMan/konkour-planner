# Planex ⇄ Supabase — setup (10 minutes, once)

The app already points at your project (`src/supabase.ts`). You only have to prepare the server.

## 1. Create the tables, the picture bucket and realtime
Supabase dashboard → **SQL Editor** → New query → paste the whole file `supabase/setup.sql` → **Run**.
(It is safe to run twice.)

## 2. Close registration  ← important
Dashboard → **Authentication → Sign In / Providers** (older UI: *Settings*) → turn **OFF**
**"Allow new users to sign up"** → Save.
From now on nobody can create an account, not even by calling the API directly. The app has no sign-up screen anymore either.

## 3. Create the accounts for you and your friends
Dashboard → **Authentication → Users → Add user → Create new user**
* Email: `ali@planex.app`  (use `<username>@planex.app`; no mail is ever sent)
* Password: whatever you want to give them
* Tick **Auto Confirm User** → Create

In the app they type just the username (`ali`) and the password. (Typing a full email works too.)
To remove a friend: delete the user in the same page — their data goes with them.

## 4. Check that it works
1. Log in on the phone → the ☁️ badge in the top bar gets a green dot.
2. Add a question picture in the vault. Dashboard → **Storage → vault** → a folder with your user id appears with `q.jpg` (~100–200 KB).
3. Open the app on the laptop, log in → the day plans and vault appear. Change something on the phone → it shows up on the laptop in a second or two.

## How it behaves
* **No account = no change.** The app stays fully local; no request is made to the server.
* **Everything is stored locally first**, then sent. Offline edits are queued and sent when the internet is back.
* **Pictures** are re-compressed to ≤ ~200 KB (max 1280 px JPEG) before upload → about 5,000 pictures per 1 GB.
  The bucket refuses files over 1 MB.
* **Conflicts:** per item the newest edit wins. A value that lost is kept in `localStorage["planex_sync_conflicts_v1"]`.
  The list of days is merged (both devices' days are kept).
* **Realtime:** the vault, the answer-key library and the open day update live. Other settings (tracker, exams …)
  show a small "تغییرات تازه … بارگذاری" chip, and reload by themselves the next time you come back to the app.
* **Not synced:** the music library (audio files stay on each device) and device-only UI state (theme, last tab, running timer).

## Good to know (free plan)
* Free projects **pause after 7 days without any activity** (you just press "Restore" in the dashboard). Using the app is enough activity.
* 1 GB file storage and 500 MB database. Use the query at the bottom of `setup.sql` to see how much each person uses.
* The key in `src/supabase.ts` is the *publishable* key and is meant to be public. Never paste a `service_role` key into the app.
* The old table `user_plans` from the first version is not used anymore and is left untouched.
