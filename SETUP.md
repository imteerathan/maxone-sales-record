# MAXONE Sales Record: test guide

## Desktop

1. Extract `MAXONE-Sales-Record.zip`.
2. Run `python -m http.server 8000` from the `maxone-sales-record` folder.
3. Open `http://localhost:8000` in Chrome, Edge or Safari.
4. Test the sales entry tab, historical tab, edit/delete and Excel export.

## First online visit and offline use

- Open the app once while online. The service worker caches the app shell and attempts to cache the Excel library.
- Add a test shop/record and confirm it remains after reloading.
- Turn on airplane mode and reopen the installed app. Local entry and history should remain available. Cloud sync and first-time Excel-library download require internet.

## Cloud account test

- Open `เข้าสู่ระบบ / ซิงก์`.
- Register using the intended MAXONE email and a password of at least 8 characters.
- If email confirmation is enabled, confirm the email, then sign in.
- Press `ซิงก์ตอนนี้` and confirm the status changes to synced.
- Do not enter real sales until the user confirms that cloud data appears correctly on the intended devices.

## Important

- Local data is stored in Safari/Chrome IndexedDB. Clearing website data can delete unsynced data.
- Signing out does not delete local records.
- Do not import the five workbook rows as normal ledger records without deciding how to handle their missing opening balances and inconsistent stock totals.
- The app has not been deployed to a public URL and has not been physically tested on iPhone 6/6s/SE (1st generation).
