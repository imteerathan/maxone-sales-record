# MAXONE Sales Record

Mobile-first, offline-first sales and stock ledger based on the supplied `ยอดขายรายวัน maxone.xlsx` workbook.

## Current implementation

- Two tabs: sales entry and historical report.
- Shop dropdown with add-new shop. The three shop names in the workbook are seeded as selectable names only; historical transactions are not imported.
- Transaction date and time are both recorded. Each transaction has an internal, hidden SalesID.
- Opening stock is an optional, editable report field and is not inferred or recalculated.
- Closing stock is editable by default. An optional checkbox calculates cases, packs, and bottles independently from the latest earlier-date closing balance minus today's sales in each matching unit.
- Stock entry no longer includes refill-to-central-stock fields. Saving and deleting a record do not recalculate or rewrite other saved balances.
- The local record update and audit entry are committed in one IndexedDB transaction. Existing local and Supabase records are not cleared by the v0.9.5 startup path.
- History defaults to the last 60 days and can show all records.
- Excel and PDF exports use the supplied 12-column report layout and title `แบบฟอร์มสรุปยอดขาย หน่วยหมอก เขตกทม.`. Sales totals are summed by unit, labeled, and blank for units totaling zero. Excel dates are written in Buddhist Era (พ.ศ.). Internal SalesID is not shown or exported.
- Local-first storage uses IndexedDB. The app shell and Excel library are cached by the service worker after the first online visit.
- Supabase email/password authentication and owner-scoped cloud sync are implemented using the project's publishable key and REST/Auth endpoints. No service-role key is present in the client.

## Supabase project

- Project: `maxone-sales-record`
- Region: Singapore (`ap-southeast-1`)
- Plan at creation: Free, quoted project cost $0/month
- The connected Free organization currently has two active projects, so it is at Supabase's two-active-Free-project limit. No third project should be created unless one is paused or the plan/organization changes.
- Project URL: `https://dbyedilzgeuksjznnyhe.supabase.co`
- Schema: `src/schema.sql`
- RLS is enabled on `shops`, `sales_records`, and `sync_tombstones`. All client table access is granted to `authenticated` only, with per-user ownership policies.

The browser app includes the project's **publishable** key. Publishable keys are intended for browser use when paired with RLS; never replace it with a `service_role` or secret key.

## Run locally

1. Extract the ZIP.
2. Open a terminal in the `maxone-sales-record` folder.
3. Run `python -m http.server 8000`.
4. Open `http://localhost:8000`.
5. Visit once while online so the app shell and Excel library can be cached. Then test airplane mode.

For iPhone installation, host the folder over HTTPS, open it in Safari, and use **Share → Add to Home Screen**. Localhost-only service-worker behavior is not a substitute for HTTPS hosting.

## Account and cloud sync

1. Open **เข้าสู่ระบบ / ซิงก์**.
2. Create an account with an email address and a password of at least 8 characters.
3. If Supabase requires email confirmation, open the confirmation email first.
4. Sign in. The app reconciles local records with the account's cloud records when online.

No password is stored by the app. Supabase's session tokens are stored locally by this app to support repeat sign-in. Signing out does not erase locally saved sales data.

## Workbook facts and import boundary

- The supplied workbook contains one worksheet, `Sheet1`, with report columns A-L.
- Five sample rows are dated 16-20 November 2569 (พ.ศ.).
- Opening-stock columns C-E are blank in the five sample rows. Some displayed balances do not reconcile with the sales figures under the new stock-carry-forward rules.
- For that reason, only the three shop names are preloaded. The five historical rows are not imported as validated ledger transactions and are not silently recalculated.

## Compatibility and known limits

- The app shell is written in ES5-style JavaScript and uses basic HTML controls to improve compatibility with older Safari.
- Service workers are supported on iOS 11.3 and later. iPhone 6/6s/SE (1st generation) can run compatible iOS versions, but actual behavior has **not** been verified on the physical devices.
- Supabase announced removal of a small set of legacy TLS 1.2 CBC cipher suites beginning 10 November 2026. Very old operating systems that support only those suites may fail to connect to Supabase; this must be checked on the target iPhone. Current Safari on supported iOS releases is expected to negotiate modern TLS, but no physical-device test has been completed.
- Cloud signup/sign-in and multi-device sync still require a real user account to test end-to-end. Do not use production sales data until the user completes that test and confirms the workflow.
- The export library is loaded from jsDelivr and cached after a successful online visit. If the first visit is offline, Excel export will not be available until the library has been cached.
- One expiry date is stored per sales record, matching the source workbook. Lot-level expiry tracking is not included.
- Multiple transactions can be recorded at the same shop on the same date. The time of transaction determines global stock order; shop is not a stock partition.
- Supabase Free is $0 at the time the project was created. Free projects may be paused after about one week of low database activity; the owner can restore them from the dashboard. Free does not include automatic database backups, so export the Excel report regularly. The organization is currently at its two-active-Free-project limit. Usage quotas and free-plan policies can change; do not enable paid add-ons or upgrade without explicit approval.

See [`TEST-REPORT.md`](TEST-REPORT.md) for the exact checks performed and items that still need a real-device/account test.


## Global Stock Migration (second fix)

On every app startup, existing IndexedDB records are normalized and recalculated as one company-wide stock ledger. Legacy per-shop opening seeds are discarded except for the earliest transaction, which retains the initial warehouse seed. After Cloud merge, the same global rebuild is applied and corrected balances are written back to Supabase. Service worker cache version is bumped to `maxone-sales-v3-global-ledger-migration`.


## v0.3 update

- Header displays the app version (`v0.3`).
- Online/offline network state is shown separately before the sync status.
- Shop management includes search, rename, duplicate-name validation, and selecting the renamed shop immediately. Changes sync through the existing owner-scoped Supabase shop upsert.
- On the first v0.3 startup per browser profile, the app clears its MAXONE IndexedDB stores (`shops`, `records`, `audit`, `syncQueue`) once, preserves the sign-in session, then initializes the clean ledger and default shop names. This is a one-time reset marker; it does not clear browser data on every launch.
- The dedicated MAXONE Supabase tables were reset for the fresh start. No Cotton Favor project or data was touched.


## v0.3.3

- Signup now passes the current production origin as the Supabase Auth `redirect_to` destination.
- The v0.3.3 first-start marker clears stale MAXONE IndexedDB stores once on the browser profile so offline records from the previous test/reset cycle are not merged back into the freshly cleared Cloud.
- The first global-ledger transaction explicitly persists the user-entered warehouse opening seed. It rejects a first transaction with no opening seed and no stock refill, and later transactions inherit the previous global closing balance.
- Supabase Auth URL Configuration still requires the project owner to set Site URL to `https://maxone-sales-record.vercel.app/` and add that exact URL to Redirect URLs. Confirm the signup email template uses `{{ .ConfirmationURL }}` or correctly passes `{{ .RedirectTo }}`; a hardcoded localhost redirect in a customized template must be removed.
