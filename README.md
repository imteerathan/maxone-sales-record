# MAXONE Sales Record

Mobile-first, offline-first sales and stock ledger based on the supplied `ยอดขายรายวัน maxone.xlsx` workbook.

## Current implementation

- Two tabs: sales entry and historical report.
- Shop dropdown with add-new shop. The three shop names in the workbook are seeded as selectable names only; historical transactions are not imported.
- Transaction date and time are both recorded. Each transaction has an internal, hidden SalesID.
- There is one company-wide warehouse stock ledger. The first event establishes initial warehouse stock; every later event inherits the previous event's closing balance, regardless of which shop the sale happened at.
- Refill and sales accept cases, packs and bottles. Calculations use integer bottles: 10 bottles = 1 pack; 5 packs = 1 case (50 bottles).
- Closing stock is calculated as opening + refill - sales. Negative stock and fractional quantities are rejected.
- Manual closing-stock correction requires confirmation and is stored as a signed adjustment. The corrected balance carries forward.
- Refill increases central warehouse stock at the event timestamp. Editing, deleting, or changing the time of a record recalculates the entire later global ledger, across all shops. The local record update and audit entry are committed in one IndexedDB transaction.
- History defaults to the last 60 days and can show all records.
- Excel export accepts any selected date range, keeps the original A-L structure in `Sheet1`, and adds a second sheet for transaction time, refill, and stock-adjustment detail. Internal SalesID is not shown or exported. Dates in Excel are written in Buddhist Era (พ.ศ.) to match the supplied workbook.
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
