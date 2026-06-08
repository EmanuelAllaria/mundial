const { createClient } = require("@supabase/supabase-js");
const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !API_FOOTBALL_KEY) {
  throw new Error(
    "Faltan variables de entorno. Necesitas SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y API_FOOTBALL_KEY.",
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function getStage(roundLabel) {
  if (roundLabel.includes("Round of 32")) return "round_32";
  if (roundLabel.includes("Round of 16")) return "round_16";
  if (roundLabel.includes("Quarter-finals")) return "quarter";
  if (roundLabel.includes("Semi-finals")) return "semi";
  if (roundLabel.includes("Final")) return "final";
  return "group";
}

function getGroupId(roundLabel) {
  if (!roundLabel.includes("Group")) return null;
  return roundLabel.replace("Group ", "").split(" - ")[0].trim();
}

async function upsertTeam(team, groupId) {
  const payload = {
    id: String(team.id),
    name: team.name,
    flag_url: team.logo || null,
    group_id: groupId,
  };

  const { error } = await supabase.from("teams").upsert(payload);
  if (error) {
    throw error;
  }
}

async function upsertMatch(item) {
  const { fixture, teams, league, goals } = item;
  const groupId = getGroupId(league.round);

  await upsertTeam(teams.home, groupId);
  await upsertTeam(teams.away, groupId);

  const payload = {
    id: fixture.id,
    team_a_id: String(teams.home.id),
    team_b_id: String(teams.away.id),
    group_id: groupId,
    stage: getStage(league.round),
    match_date: fixture.date,
    score_a: goals?.home ?? null,
    score_b: goals?.away ?? null,
    finished: ["FT", "AET", "PEN"].includes(fixture.status.short),
  };

  const { error } = await supabase.from("matches").upsert(payload);
  if (error) {
    throw error;
  }
}

async function syncWorldCup2026() {
  try {
    console.log("Obteniendo fixture oficial desde API-Football...");

    const response = await axios.get(
      "https://v3.football.api-sports.io/fixtures",
      {
        params: { league: 1, season: 2026 },
        headers: { "x-rapidapi-key": API_FOOTBALL_KEY },
      },
    );

    const fixtures = response.data?.response || [];
    console.log(`Se encontraron ${fixtures.length} partidos mapeados.`);

    for (const item of fixtures) {
      await upsertMatch(item);
    }

    console.log("Sincronización de base de datos completada con éxito.");
  } catch (error) {
    console.error("Error procesando sincronización de API externa:", error);
    process.exitCode = 1;
  }
}

syncWorldCup2026();
