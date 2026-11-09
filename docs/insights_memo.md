# Memo: what the client data says, and what to do about it

**To:** Branch heads and advisors  **From:** Analytics  **Data as of:** 31 October 2026

**Read this first.** The data is synthetic. The behaviours below were deliberately built into the generator (see [data_generation_notes.md](data_generation_notes.md)), so finding them proves the method works, not that a real firm behaves this way. Every figure comes from a generated artefact: the analytics views, [analytics_validation.md](analytics_validation.md) and [pattern_validation.md](pattern_validation.md).

## Where we stand

AUM is Rs 5,640.69 crore, up 40.0% from Rs 4,028.07 crore in January 2025. Net new money was Rs 49.62 crore in October and positive in 21 of 22 months. There are 4,037 active clients. Monthly attrition was 1.04% in October; over the last 12 months 14.39% of the clients we had a year ago have left (929 clients lost in total across the data window).

## Finding 1: silence precedes departure

Clients not reached by a connected conversation for 90 days or more leave 3.3 times as often as clients contacted in the last 30 days: 2.18% a month against 0.67%. The gap is measured at the previous month-end, so it is known before the client leaves. The effect holds inside Mass Affluent (0.79% to 2.51% for 90 to 179 days) and HNI (0.56% to 1.23%); UHNI has too few observations in the long-gap buckets to say.

**Recommendation.** Make 90 days the trigger for a mandatory call and track it per advisor. At the latest month-end, 968 active clients carry a Medium risk score from the contact and idle-cash rules; a contact campaign is the cheapest lever.

## Finding 2: Mass Affluent clients leave far more often than the rest

Pooled over the window, monthly attrition is 1.26% for Mass Affluent, 0.61% for HNI and 0.16% for UHNI. Mass Affluent clients leave about twice as often as HNI and about eight times as often as UHNI. They are also 4.8% of AUM, so the revenue at stake per departure is small; the cost is in the count of clients and advisor time.

**Recommendation.** Do not spend senior advisor time on Mass Affluent retention. Use a lighter, scheduled-contact model for that segment, and keep named relationship managers for HNI and UHNI where a single departure moves AUM.

## Finding 3: a large AUM drop is a near-certain warning

Among active clients whose AUM fell by more than 50% over three month-ends, 87.9% left the next month (799 of 909 client-month observations). Among clients with no AUM-drop flag, 4 of 86,644 left. A 30% to 50% fall is a weaker signal: 12.7% left the next month. Combined with contact gaps, the transparent risk score put every client who left in the Medium or High group the month before, and 67.1% of High-scored client-months ended in a departure against a 1.05% base rate.

**Recommendation.** Route any client whose AUM drops by more than 50% in three months to the advisor and branch head the same week. Only 3 clients are in that High group today, so this is a small, tractable list. The outflow pattern was planted in the generator, so the strength of this signal on real data would need to be re-measured before relying on it.

## Finding 4: advisors differ most in how often they reach clients

Contact frequency (connected interactions per active client-month) runs from 0.12 to 1.07 across the 60 advisors, with a median of 0.56. The five advisors planted as low-contact were all found among the bottom ten. Growth is harder to read. Measured as net flow rate (12-month net new money over opening AUM), the five advisors planted as high-growth average 14.9% against 7.4% for the rest, but only 2 of them appear in the top ten because individual advisors overlap heavily over a single year. The ranking should not be used to rank individuals.

**Recommendation.** Coach the bottom decile on contact frequency now. For growth, use a rolling multi-year view before using it in reviews.

## What this memo does not claim

- It does not show that contact causes retention; in the generator the relationship was built in.
- It does not predict next quarter. The data is a single synthetic history, and returning clients are not simulated.
- January 2025 joiners (34 clients) have no holdings in the generator and are never counted as active.
