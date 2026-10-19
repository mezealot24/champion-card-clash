-- Player deck builder: most copies of one card a player may put in their deck (deck size stays deck_size).
insert into public.game_config (key, value, description) values
  ('deck_max_copies', '2', 'Deck builder: max copies of one card in a player deck')
on conflict (key) do nothing;
