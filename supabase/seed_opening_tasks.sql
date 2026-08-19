-- Threshold Salon — the run-up to opening day, Monday 7 September 2026.
--
-- A seed, not a migration: run it once, and every row is an ordinary to-do she
-- can tick, edit or delete. Nothing here is special-cased in the app.
--
-- Dated so they surface a few at a time rather than as a wall of thirty on day
-- one. `start_date` is when it first appears on her Overview; `due_date` is when
-- it wants to be finished. The Overview shows anything started-or-due today and
-- not ticked, so this becomes a rolling list that fills in as opening
-- approaches.
--
-- All of them are salon tasks with no client attached, so they land in the
-- "Salon" group on the To-do tab and leave "Follow-ups" for actual people.
--
-- Note: recurrence supports weekly, biweekly and monthly — there's no daily
-- option, so the handful of things she should look at every day are written as
-- weekly nudges rather than nagging her each morning.

insert into public.tasks (title, start_date, due_date, recurrence) values

-- ── Three weeks out: the things that stop you opening at all ──────────────
('Hang your cosmetology licence and salon licence where clients can see them', '2026-08-18', '2026-08-22', 'none'),
('Check your liability insurance is current, and save the certificate', '2026-08-18', '2026-08-22', 'none'),
('Confirm with Salon Lofts: lease start, keys, door code, wifi password', '2026-08-18', '2026-08-21', 'none'),
('Order colour — tubes, developer volumes, lightener', '2026-08-18', '2026-08-23', 'none'),
('Order toners and glosses for the shades you use most', '2026-08-18', '2026-08-23', 'none'),
('Order foils, bowls, brushes, clips, capes, gloves', '2026-08-18', '2026-08-23', 'none'),
('Order back-bar shampoo, conditioner and treatment', '2026-08-19', '2026-08-23', 'none'),
('Pick three or four retail products to sell from day one, and order them', '2026-08-19', '2026-08-25', 'none'),
('Sort towels: how many, where they get washed, how often', '2026-08-19', '2026-08-25', 'none'),
('Barbicide, disinfectant, sharps disposal, cleaning kit', '2026-08-19', '2026-08-25', 'none'),

-- ── The app, so nothing embarrasses you in front of a client ──────────────
('Set your real hours in the app, including any breaks', '2026-08-20', '2026-08-24', 'none'),
('Decide your booking rules: shortest notice, gap between clients, how far ahead', '2026-08-20', '2026-08-26', 'none'),
('Decide which services take a deposit, and how much', '2026-08-20', '2026-08-26', 'none'),
('Check every service, price and duration in the app is right', '2026-08-21', '2026-08-26', 'none'),
('Book yourself through the website exactly as a client would', '2026-08-22', '2026-08-27', 'none'),
('Ring the salon number, leave a voicemail, check it lands in Messages', '2026-08-22', '2026-08-27', 'none'),

-- ── Money, tested with real money before someone is standing there ────────
('Take a $1 payment on the Intuit reader and refund it', '2026-08-23', '2026-08-29', 'none'),
('Save a card and charge $1 through the site, then refund it', '2026-08-23', '2026-08-29', 'none'),
('Check the $1 test actually reaches your bank account', '2026-08-26', '2026-09-01', 'none'),
('Get a cash float for change and tips', '2026-09-01', '2026-09-05', 'none'),

-- ── Two weeks out: telling people ─────────────────────────────────────────
('Claim your Google Business Profile — hours, address, photos, booking link', '2026-08-24', '2026-08-29', 'none'),
('Instagram: bio, booking link, and a post announcing the date', '2026-08-24', '2026-08-28', 'none'),
('Order business cards and a few referral cards', '2026-08-24', '2026-08-30', 'none'),
('Sort signage or a window decal for the suite door', '2026-08-24', '2026-08-31', 'none'),
('Decide whether opening week has an offer, and what it is', '2026-08-25', '2026-08-30', 'none'),
('Print a price list for the suite', '2026-08-28', '2026-09-03', 'none'),

-- ── Filling the chair ─────────────────────────────────────────────────────
('Personally invite ten regulars to book opening week', '2026-08-25', '2026-08-31', 'none'),
('Text your client list the opening date — once the texting is approved', '2026-08-28', '2026-09-03', 'none'),
('Check next week''s bookings and chase anything unconfirmed', '2026-08-24', '2026-09-06', 'weekly'),
('Look at Messages and voicemail — anything waiting on a reply?', '2026-08-19', '2026-09-06', 'weekly'),

-- ── Final week ────────────────────────────────────────────────────────────
('Deep clean the suite, set the station, check the lighting', '2026-09-02', '2026-09-06', 'none'),
('Set up music, water, snacks, phone charger — charge the card reader', '2026-09-04', '2026-09-06', 'none'),
('Confirm every opening-week booking the day before', '2026-09-05', '2026-09-06', 'none'),
('Lay out tomorrow: outfit, tools, first client''s formula', '2026-09-06', '2026-09-06', 'none'),
('Early night. You open tomorrow.', '2026-09-06', '2026-09-06', 'none');
