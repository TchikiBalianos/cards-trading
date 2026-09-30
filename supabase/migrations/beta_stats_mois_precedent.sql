-- Compteur du mois calendaire précédent, pour le rapport mensuel de /api/keep-alive.
-- Appliquée sur le projet frbwmzgaqmylilzciptg le 30 septembre 2026.
--
-- Fonction SÉPARÉE de beta_stats() : beta_stats() est appelée par le ping
-- quotidien qui empêche la pause du projet, on n'y touche pas pour un simple
-- rapport. Si celle-ci manque ou échoue, le rapport part quand même, sans le
-- chiffre du mois.
--
-- Mois calendaire à l'heure de Paris. Renvoie par exemple
--   {"mois": "2026-09", "mois_precedent": 3}
-- quand elle est appelée en octobre 2026.
--
-- Pour mémoire, beta_stats() telle qu'elle existe en base (non versionnée avant ce fichier) :
--   select json_build_object(
--     'total',    (select count(*) from beta_submissions),
--     'last_7d',  (select count(*) from beta_submissions where submitted_at > now() - interval '7 days'),
--     'derniere', (select max(submitted_at) from beta_submissions))
--
-- Pour annuler : drop function public.beta_stats_mois_precedent();

create or replace function public.beta_stats_mois_precedent()
returns json
language sql
security definer
set search_path to 'public'
as $function$
  with bornes as (
    select date_trunc('month', (now() at time zone 'Europe/Paris') - interval '1 month') as debut,
           date_trunc('month', now() at time zone 'Europe/Paris') as fin
  )
  select json_build_object(
    'mois', to_char((select debut from bornes), 'YYYY-MM'),
    'mois_precedent', (
      select count(*) from beta_submissions s, bornes b
      where (s.submitted_at at time zone 'Europe/Paris') >= b.debut
        and (s.submitted_at at time zone 'Europe/Paris') < b.fin
    )
  )
$function$;

grant execute on function public.beta_stats_mois_precedent() to anon, authenticated, service_role;
