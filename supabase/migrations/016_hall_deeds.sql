-- 016_hall_deeds: Hall of Deeds shared leaderboard for Ingoizer's World (genemagg10/adventure-game PR #69)
-- Already applied to prod on 2026-10-05 as two history entries:
--   20261006000247 create_hall_deeds, 20261006000316 016_hall_deeds_grants.
-- This combined file yields the same end state on a fresh DB. Do not re-run against prod.
create table public.hall_deeds (
    id bigint generated always as identity primary key,
    tag_key text not null,
    player_tag text not null check (char_length(player_tag) between 1 and 16),
    sibling_name text not null check (char_length(sibling_name) between 1 and 24),
    milestone_id text not null,
    milestone text not null,
    achieved_at timestamptz not null default now(),
    unique (tag_key, milestone_id)
);
alter table public.hall_deeds enable row level security;
revoke all on table public.hall_deeds from anon, authenticated;
grant select on table public.hall_deeds to anon, authenticated;
grant insert (tag_key, player_tag, sibling_name, milestone_id, milestone, achieved_at) on table public.hall_deeds to anon, authenticated;
create policy hall_deeds_read on public.hall_deeds for select to anon, authenticated using (true);
create policy hall_deeds_insert on public.hall_deeds for insert to anon, authenticated with check (
    char_length(player_tag) between 1 and 16
    and player_tag ~ '^[A-Za-z0-9][A-Za-z0-9 ''\-]*$'
    and tag_key = lower(regexp_replace(btrim(player_tag), '\s+', ' ', 'g'))
    and char_length(btrim(sibling_name)) between 1 and 24
    and achieved_at between timestamptz '2025-01-01' and now() + interval '10 minutes'
    and (milestone_id, milestone) in (
        ('makers-hollow', 'Found Maker''s Hollow'), ('black-knight', 'Beat the Black Knight'),
        ('green-knight', 'Beat the Green Knight'), ('giant-turtle', 'Beat the Giant Snapping Turtle'),
        ('planted-worldtree', 'Planted the Worldtree'), ('climbed-cloudlands', 'Climbed to the Cloudlands'),
        ('beat-zeus', 'Beat Zeus'), ('mended-worldtree', 'Mended the Worldtree'),
        ('blue-gem-1', 'Collected 1 Blue Gem'), ('blue-gem-2', 'Collected 2 Blue Gems'),
        ('blue-gem-3', 'Collected 3 Blue Gems'), ('blue-gem-4', 'Collected 4 Blue Gems'),
        ('blue-gem-5', 'Collected all Blue Gems'), ('clubhouse', 'Found the Clubhouse'),
        ('charted-surface', 'Charted the whole surface'), ('strange-key-copper', 'Found a strange key'),
        ('strange-key-jade', 'Found a strange key'), ('strange-key-crystal', 'Found a strange key')
    )
);
grant all on table public.hall_deeds to service_role;
grant usage on sequence public.hall_deeds_id_seq to anon, authenticated;
grant all on sequence public.hall_deeds_id_seq to service_role;
