# Accountant — finance workspace

The Accountant has **full operational access to finance**, **limited read-only access to student information**, and **no administrative authority outside finance**.

Today the school takes **cash only**: there is no payment gateway, SMS or WhatsApp. Those parts are deliberately left out (see *Not built yet*).

## What the Accountant can do

| Area | What | Screen |
|---|---|---|
| Dashboard | Today's and total collection, outstanding, overdue, pending payments, refund requests, recent transactions, 14-day trend; quick actions | `/dashboard` (and `/dashboard/finance`) |
| Find a student | Name, admission no., photo, class, section, status, parents' name and contact, fees and payment history. **Not** date of birth, gender, attendance, results or documents | `/dashboard/finance/collect`, `/dashboard/finance/students/:id` |
| Collect a fee | Search student → outstanding fees → pick a fee → method (cash) → amount → review → confirm → receipt | `/dashboard/finance/collect` |
| Fees | View structures and assigned fees; paid / outstanding / overdue; ledger; fee demand statement | `/dashboard/fees`, student profile |
| Correct a payment | Needs a reason; old values kept in the log; allowed for a few days after recording | Transactions |
| Receipts | View, download PDF, print, reprint (counted and logged), send to the parent | `/dashboard/receipts/:id` |
| Refunds | Request, track; **pay out** once approved | `/dashboard/finance/refunds` |
| Discounts | Apply a small discount alone; request scholarships, concessions and larger discounts; apply once approved | `/dashboard/finance/concessions` |
| Reports | 15 reports with date / class / section / method filters; export CSV, Excel, PDF | `/dashboard/finance/reports` |
| Notices to families | Payment confirmation, receipt, due / outstanding / overdue reminders — in-app and email | Fee demand |
| Own account | Profile, password, security, notification preferences, own sessions | `/dashboard/profile` |

## What the Accountant cannot do

Platform admin, subscription, user and role management, permissions, school and academic configuration, teachers, attendance, exams and results, editing a student's academic record, deleting students, system logs, other schools' data, security or tenant configuration.

Two things the Accountant used to hold were **removed on purpose**:

- `student.view` (the whole student record) → replaced by the finance-only lookup (`finance.student`).
- `fee.refund` (waive = write off a fee) → a write-off is a Director decision. Refunds now go through the approval flow below.

## Approvals (segregation of duties)

```
Refund:      Accountant requests → Principal/Director approves → Accountant pays out
Concession:  Accountant requests → Principal/Director approves → Accountant applies
```

- Nobody approves their own request (`CANNOT_APPROVE_OWN`).
- A plain **discount** within `maxDiscountPercent` of the fee (default 5%, counted across all small discounts on that fee) is applied immediately. **Scholarships and concessions always need approval.**
- Someone holding both approve and apply (Director, Principal) does it in one step.
- A refund can't exceed what was paid, counting refunds already requested.

## The money rules

All amounts are minor units (paise). One definition everywhere (`finance/fee-math.ts`):

```
owed    = amount billed − discounts
paid    = payments − refunds paid out
balance = max(owed − paid, 0)
```

Payments can't exceed the balance. The school can require full payment only (`allowPartialPayments`).

## Permission matrix (default roles)

| Permission | Accountant | Principal | Director |
|---|:-:|:-:|:-:|
| `fee.view` / `fee.create` / `fee.collect` | ✅ | ✅ | ✅ |
| `finance.dashboard`, `finance.student`, `finance.audit` | ✅ | ✅ | ✅ |
| `payment.correct` | ✅ (within window) | ✅ | ✅ |
| `payment.correctAny` | ❌ | ✅ | ✅ |
| `receipt.view`, `feeNotice.send` | ✅ | ✅ | ✅ |
| `refund.view` / `.request` / `.process` | ✅ | ✅ | ✅ |
| `refund.approve` | ❌ | ✅ | ✅ |
| `discount.view` / `.request` / `.apply` | ✅ | ✅ | ✅ |
| `discount.approve` | ❌ | ✅ | ✅ |
| `financeReport.view` / `.export` | ✅ | ✅ | ✅ |
| `fee.refund` (waive a fee) | ❌ | ✅ | ✅ |
| `student.view` (full record), teachers, attendance, roles, settings | ❌ | per role | ✅ |

Schools can change these from the Roles screen. Parents hold `receipt.view` for their own children only.

## Settings (Director → School Settings → Fees)

`maxDiscountPercent`, `paymentCorrectionWindowDays`, `notifyPaymentReceipt`, `allowPartialPayments`, `receiptPrefix`, late-fee rules.

Deployment: `PAYMENT_METHODS` (default `CASH`). Adding `CHEQUE` or `BANK_TRANSFER` there switches those methods on with no code change.

## Audit and exports

Everything that moves money is in the audit log and visible to the Accountant (read-only, finance only) at `/dashboard/finance/activity`: payment recorded / corrected (with before → after), receipt reprinted / downloaded / sent, refund requested / approved / rejected / paid out, discount requested / approved / applied, report exported, reminders sent. Exported text cells starting with `= + - @` are neutralised so a name can't run as a spreadsheet formula.

## Not built yet (deliberately)

- **Online payment management** (gateway status, verifying gateway payments, failed-payment retries). The dashboard card and the *Online payments* / *Failed payments* reports say plainly that online payments are off. When a gateway is added, verification must be server-side (webhook signature), never trusted from the browser.
- **SMS and WhatsApp** reminders. Reminders are logged per channel, so a new channel slots in without changing the rest.
