# Sources and assumptions

Everything below was read from public pages on **2026-10-13** (America/New_York). Nothing was
obtained from the restaurant directly, and the restaurant was not contacted. All of it needs the
owner's confirmation before a live launch.

## Pages read

| Source | URL | Result |
| --- | --- | --- |
| Toast ordering | https://www.toasttab.com/local/order/panguich → redirects to https://toast.app/r/panguich/order | Loaded in a browser. Pickup and Delivery offered; rewards and gift cards shown; full online menu with prices; hours; "3.00%" credit-card surcharge notice. |
| Current website | https://panguich.us/ , /food-menu , /drink-menu , /specials , /events , /catering | "Powered by SpotHopper". Menu, drinks, a Monday breakfast special (8–11 AM, image only), events (Thanksgiving, New Year's Eve), newsletter, jobs, three Google review excerpts, catering pop-up. The catering page body is rendered by script and could not be read as text. |
| Second site | https://panguichfl.com/ , /panguich/locations/ | A different online-ordering platform (not identified; uses Stripe). Shows "Popular Items" with different prices. Copyright 2024. |
| Toast API docs | https://doc.toasttab.com/doc/devguide/devApiAccessUserGuide.html (via search result; the page blocked direct fetching) | Standard API access: read-only, GET only, no write access, no sandbox; part of Restaurant Management Essentials for US customers. |
| Toast IQ | https://pos.toasttab.com/products/toast-iq | "Included with Toast POS at no additional cost." Q&A over sales, labor, menu performance, guest trends, discounts, voids; forecasting; prep lists; menu-upsell actions. "Toast IQ Grow" is a separate marketing package. |
| SpotHopper | https://www.spothopperapp.com/ | Advertises websites, local search, review generation, AI promotions, social posting, email campaigns, events/catering promotion, AI replies to inquiries, reporting. |
| Instagram | https://www.instagram.com/panguich/ | Not inspected (login wall). **No social metrics are used anywhere.** |
| Reveal | https://reveallabs.co/ | Inspiration only; not fetched for content, nothing copied. |

## Verified business facts used in the app

- **Name / address / phone:** Panguich, 10215 Stirling Road, Cooper City, FL 33328, (954) 883-9366 — identical on all three sources.
- **Hours (used):** Mon–Sat 8:00 AM–7:00 PM, Sun 8:00 AM–5:00 PM — Toast and panguich.us agree.
- **Order link (used):** `https://www.toasttab.com/local/order/panguich` — the link panguich.us itself uses for "Order".
- **Featured items:** Butifarra, Pan con Chicharrón, Pan con Pollo — listed under "Featured Items" on the Toast page. Shown as "featured by Panguich", never as best-sellers.
- **Menu:** 113 items in `src/content/menu.ts`. Items on the Toast online menu use the Toast price. Items only on the panguich.us menu (breakfasts, starters, single-fruit juices) use that price and are tagged "Ask in store" because they were not listed for online ordering when checked.
- **Allergy notice:** "Food allergies or dietary needs? Please notify a staff member before ordering." (panguich.us).

## Conflicts found (surfaced to the owner, not resolved by us)

| Topic | Toast | panguich.us | panguichfl.com |
| --- | --- | --- | --- |
| Sunday close | 5:00 PM | 5:00 PM | **4:00 PM** |
| Pan con Chicharrón | $13.99 | $13.99 | **$15.64** |
| Lomo Saltado (bowl/plate) | $17.99 | $17.99 | **$13.45** |
| Pan con Pollo | $12.99 | $12.99 | **$13.54** |
| Pan con Pavo | $13.99 | **$12.99** | — |
| Asado sandwich | $13.99 | **$12.99** | — |
| Espresso | $3.00 | **$3.25** | — |
| Cortadito | $3.20 | **$3.50** | — |
| Iced Americano | $5.50 | **$5.75** | — |

A different price per channel can be intentional. These are listed, not "corrected".

## Assumptions (each needs confirmation)

1. Toast is the system of record for prices and availability.
2. The Toast ordering link is the owner's preferred order destination (it is the one their site uses).
3. Breakfast and starter items missing from Toast online ordering are still sold in store. The Toast
   page was read while the restaurant was closed; a time-limited menu could explain the difference.
4. "Socosani $3.25" on Toast is the "Sparkling Water $3.25" on the website.
5. Short dish explanations marked `gloss` in `menu.ts` (34 of them) are general descriptions written
   for first-time guests, not the restaurant's recipes. They make no ingredient or allergen promise.
6. Spanish text is our translation of the restaurant's English descriptions.

## Explicitly not known

Revenue, order counts, customer counts, profitability, marketing performance, staff performance,
software contracts and their costs, who owns each domain, whether Toast IQ / Toast Catering / invoice
tools / SpotHopper marketing features are enabled, catering packages or prices, delivery radius,
deposit policy, kitchen capacity, image rights. The sponsor's impression that the restaurant is
under-visited is a hypothesis, not data.
