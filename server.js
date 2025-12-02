const { createClient } = require('@supabase/supabase-js');
const { ApifyClient } = require('apify-client');
const { GoogleGenAI } = require('@google/genai')
const express = require('express');
const cron = require('node-cron');
const cors = require('cors');
const e = require('express');
const env = require('dotenv').config();
const port = 5169;

const app = express();
app.use(cors());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY);
const apify = new ApifyClient({token: process.env.APIFY_KEY});
const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY);

app.get('/model', async (req, res) => {
    res.set('content-type', 'application/json');
    const results = await evaluatePicks("nba");
    res.send(results);
})

app.get('/schedule/all', async (req, res) => {
    res.set('content-type', 'application/json');

    const nbaData = await getAllMatchupData("nba");
    const nflData = await getAllMatchupData("nfl");

    res.send({NBA_games: nbaData, NFL_games: nflData});
})

app.get('/schedule/nba', async (req, res) => {
    res.set('content-type', 'application/json');
    const results = await fetchNBASchedule();

    for (const matchup of results){ 
        const { error } = await supabase.from("nba_games").insert({
            home_team: matchup.homeTeam.shortName,
            away_team: matchup.awayTeam.shortName,
            event_date: new Date(matchup.scheduledTime),
            home_odds_ml: matchup.odds[0].moneyLine.currentHomeOdds,
            away_odds_ml: matchup.odds[0].moneyLine.currentAwayOdds,
            home_handicap: matchup.odds[0].pointSpread.currentHomeHandicap,
            away_handicap: matchup.odds[0].pointSpread.currentAwayHandicap,
            home_odds_spread: matchup.odds[0].pointSpread.currentHomeOdds,
            away_odds_spread: matchup.odds[0].pointSpread.currentAwayOdds,
            over_under_total: matchup.odds[0].overUnder.currentTotal,
            over_odd: matchup.odds[0].overUnder.currentOverOdd,
            under_odd: matchup.odds[0].overUnder.currentUnderOdd,
        })
        if(error){
            console.error(`Supabase error:`, error)
        }
    }

    res.send(results)
})

app.get('/schedule/nfl', async (req, res) => {
    res.set('content-type', 'application/json');
    const results = await fetchNFLSchedule();

    for (const matchup of results){ 
        const { error } = await supabase.from("nfl_games").insert({
            home_team: matchup.homeTeam.shortName,
            away_team: matchup.awayTeam.shortName,
            event_date: new Date(matchup.scheduledTime),
            home_odds_ml: matchup.odds[0].moneyLine.currentHomeOdds,
            away_odds_ml: matchup.odds[0].moneyLine.currentAwayOdds,
            home_handicap: matchup.odds[0].pointSpread.currentHomeHandicap,
            away_handicap: matchup.odds[0].pointSpread.currentAwayHandicap,
            home_odds_spread: matchup.odds[0].pointSpread.currentHomeOdds,
            away_odds_spread: matchup.odds[0].pointSpread.currentAwayOdds,
            over_under_total: matchup.odds[0].overUnder.currentTotal,
            over_odd: matchup.odds[0].overUnder.currentOverOdd,
            under_odd: matchup.odds[0].overUnder.currentUnderOdd,
        })
        if(error){
            console.error(`Supabase error:`, error)
        }
    }
    
    res.send(results)
})

app.get('/cron/nba-daily', async (req, res) => {
    try {
        const scheduleResult = await runNBAScheduleJob();
        await evaluatePicks("nba");

        res.json({
            ok: true,
            jobs: ['nba-schedule', 'nba-picks'],
            scheduleResult,
        });
    } catch (err) {
        console.error("Error running NBA daily cron:", err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.get('/cron/nfl-weekly', async (req, res) => {
    try {
        const scheduleResult = await runNFLScheduleJob();
        await evaluatePicks("nfl");

        res.json({
            ok: true,
            jobs: ['nfl-schedule', 'nfl-picks'],
            scheduleResult,
        });
    } catch (err) {
        console.error("Error running NFL weekly cron:", err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

async function fetchNBASchedule() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const formatted = tomorrow.toISOString().split("T")[0];

    const input = { 
        league: "NBA",
        date: formatted,
        sportsbook: "Consensus"
    };

    const run = await apify.actor('harvest/sportsbook-odds-scraper').call(input);
    const { items } = await apify.dataset(run.defaultDatasetId).listItems();
    return items;
}

async function runNBAScheduleJob() {
    const results = await fetchNBASchedule();

    const rows = results.map(matchup => ({
        home_team: matchup.homeTeam.shortName,
        away_team: matchup.awayTeam.shortName,
        event_date: new Date(matchup.scheduledTime),
        home_odds_ml: matchup.odds[0].moneyLine.currentHomeOdds,
        away_odds_ml: matchup.odds[0].moneyLine.currentAwayOdds,
        home_handicap: matchup.odds[0].pointSpread.currentHomeHandicap,
        away_handicap: matchup.odds[0].pointSpread.currentAwayHandicap,
        home_odds_spread: matchup.odds[0].pointSpread.currentHomeOdds,
        away_odds_spread: matchup.odds[0].pointSpread.currentAwayOdds,
        over_under_total: matchup.odds[0].overUnder.currentTotal,
        over_odd: matchup.odds[0].overUnder.currentOverOdd,
        under_odd: matchup.odds[0].overUnder.currentUnderOdd,
    }));

    const { error } = await supabase.from("nba_games").insert(rows);

    if (error) {
        console.error("Supabase error inserting NBA games:", error);
        throw error;
    }

    return { inserted: rows.length };
}
async function fetchNFLSchedule() {
    const day = new Date();
    
    day.setDate(day.getDate() + 2);
    const thursday = day.toISOString().split("T")[0];
    day.setDate(day.getDate() + 1);
    const friday = day.toISOString().split("T")[0];
    day.setDate(day.getDate() + 2);
    const sunday = day.toISOString().split("T")[0];
    day.setDate(day.getDate() + 2);
    const monday = day.toISOString().split("T")[0];

    const input_th = { 
        league: "NFL",
        date: thursday,
        sportsbook: "Consensus"
    };
    const response_th = await apify.actor('harvest/sportsbook-odds-scraper').call(input_th);
    const { items: items_th } = await apify.dataset(response_th.defaultDatasetId).listItems();

    const input_fr = { 
        league: "NFL",
        date: friday,
        sportsbook: "Consensus"
    };
    const response_fr = await apify.actor('harvest/sportsbook-odds-scraper').call(input_fr);
    const { items: items_fr } = await apify.dataset(response_fr.defaultDatasetId).listItems();

    const input_su = { 
        league: "NFL",
        date: sunday,
        sportsbook: "Consensus"
    };
    const response_su = await apify.actor('harvest/sportsbook-odds-scraper').call(input_su);
    const { items: items_su } = await apify.dataset(response_su.defaultDatasetId).listItems();

    const input_mo = { 
        league: "NFL",
        date: monday,
        sportsbook: "Consensus"
    };
    const response_mo = await apify.actor('harvest/sportsbook-odds-scraper').call(input_mo);
    const { items: items_mo } = await apify.dataset(response_mo.defaultDatasetId).listItems();

    const resultArray = items_th.concat(items_fr, items_su, items_mo);
    return resultArray;
}

async function runNFLScheduleJob() {
    const results = await fetchNFLSchedule();

    const rows = results.map(matchup => ({
        home_team: matchup.homeTeam.shortName,
        away_team: matchup.awayTeam.shortName,
        event_date: new Date(matchup.scheduledTime),
        home_odds_ml: matchup.odds[0].moneyLine.currentHomeOdds,
        away_odds_ml: matchup.odds[0].moneyLine.currentAwayOdds,
        home_handicap: matchup.odds[0].pointSpread.currentHomeHandicap,
        away_handicap: matchup.odds[0].pointSpread.currentAwayHandicap,
        home_odds_spread: matchup.odds[0].pointSpread.currentHomeOdds,
        away_odds_spread: matchup.odds[0].pointSpread.currentAwayOdds,
        over_under_total: matchup.odds[0].overUnder.currentTotal,
        over_odd: matchup.odds[0].overUnder.currentOverOdd,
        under_odd: matchup.odds[0].overUnder.currentUnderOdd,
    }));

    const { error } = await supabase.from("nfl_games").insert(rows);

    if (error) {
        console.error("Supabase error inserting NFL games:", error);
        throw error;
    }

    return { inserted: rows.length };
}


async function evaluatePicks(league){
    const matchups = await getModelContext(league);

    const response = await genAI.models.generateContent({
        model: "gemini-2.5-pro",
        contents: `You are an **Expert Sports Analyst and Predictive Model** specializing in ${league.toUpperCase()} betting markets. Your task is to analyze the provided array of ${league.toUpperCase()} game data and generate a comprehensive prediction for the Moneyline, Point Spread, and Total Score for *every single game* listed.

        **INSTRUCTIONS:**
        1.  **Enable Tool Use:** You must use the integrated Google Search tool to find the most current and relevant ${league.toUpperCase()} statistics, injury reports, team news, and advanced metrics (e.g., DVOA, EPA/play) for the teams involved in the provided matchups.
        2.  **Domain Restriction (Strict):** When performing a search for data, you **MUST** limit your results to reputable ${league.toUpperCase()} analytics domains. You must accomplish this by always including the \`site:\` operator in your search query. For example, a search for 'Dolphins vs Bills injury report' must be formatted like this:
            \`site:espn.com OR site:pff.com OR site:pro-football-reference.com "Dolphins vs Bills injury report"\`
        3.  **Strictly Adhere to JSON Output:** Your entire response **MUST** be a single JSON array that conforms exactly to the provided **Output JSON Schema**. Do not include any text, conversation, or explanation outside of the JSON block.
        4.  **Team ID Requirement (STRICT):** The values for **"home_team"** and **"away_team"** in your output **MUST** be the **EXACT** team abbreviations/IDs found in the corresponding input object. DO NOT substitute them with full team names or other abbreviations.
        5.  **Prediction Format (Simplified for Parsing):**
            * **moneyline_pick:** Must be one of two strings: **"home"** (for the home team to win) or **"away"** (for the away team to win).
            * **spread_pick:** Must be one of two strings: **"home"** (for the home team to cover the spread) or **"away"** (for the away team to cover the spread).
            * **total_pick:** Must be a **boolean** value: **\`true\`** for OVER the total line, and **\`false\`** for UNDER the total line.
        6.  **Situational Analysis and Value:** You are not just predicting the most likely winner, but identifying the pick with the best betting value. You **MUST** give significant weight to **volatile, situational factors**—such as injuries, back-to-back games (fatigue), poor recent defensive form, or specific matchup advantages—when they favor the underdog. If a volatile factor significantly degrades the favorite's probability of covering/winning, the pick should favor the underdog.
        7.  **Rationale Constraint:** For each of the three picks, the associated "_rationale" field **MUST** be a concise paragraph between **3 and 5 sentences** long. The rationale must cite specific data points found *through your search* to justify the pick. **For any underdog moneyline or spread pick, the rationale MUST explicitly reference the situational or volatile factor (e.g., injury, rest, poor recent ATS record) that overcomes the consensus favorite status.**

        **INPUT DATA (Array of JSON Objects):**
        ${JSON.stringify(matchups, null, 2)}

        **OUTPUT JSON SCHEMA (Adhere Strictly to New Format):**
        \`\`\`json
        [
        {
            "home_team": "[STRING: EXACT team ID/abbreviation from input]", 
            "away_team": "[STRING: EXACT team ID/abbreviation from input]",
            
            "moneyline_pick": "[STRING: home or away]", 
            "moneyline_rationale": "[STRING: 3-5 sentence rationale]",
            
            "spread_pick": "[STRING: home or away]", 
            "spread_rationale": "[STRING: 3-5 sentence rationale]",
            
            "total_pick": "[BOOLEAN: true for OVER, false for UNDER]", 
            "total_rationale": "[STRING: 3-5 sentence rationale]"
        }
        ]
        \`\`\`
        `,
        config: {
            tools: [{ googleSearch: {} }] 
        }
    });

    const jsonString = response.candidates[0].content.parts[0].text;
    const cleanJson = jsonString.replace('```json\n', '').replace('\n```', '').trim();
    const picksArray = JSON.parse(cleanJson);

    for (let matchup of picksArray){
        const { error } = await supabase.from(league + "_picks").insert({
            home_team: matchup.home_team,
            away_team: matchup.away_team,
            moneyline_pick: matchup.moneyline_pick,
            moneyline_rationale: matchup.moneyline_rationale,
            spread_pick: matchup.spread_pick,
            spread_rationale: matchup.spread_rationale,
            total_pick: matchup.total_pick,
            total_rationale: matchup.total_rationale
        });
        if (error) {
            console.error(`Supabase error:`, error)
        }
    }

    return picksArray;
}

async function getModelContext(leagueString){
    const league = leagueString.toLowerCase();
    const today = new Date().toISOString().split("T")[0];

    const { data, error } = await supabase.from(league + "_games").select("*");
    if (error) {
        console.error(`Supabase error:`, error)
    }
    return data;
}

async function getAllMatchupData(leagueString) {
    const league = leagueString.toLowerCase();
    const teamTable = `${league}_teams`;
    const picksTable = `${league}_picks`;

    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const startISO = start.toISOString();

    const { data, error } = await supabase
        .from(`${league}_games`)
        .select(`
            *,
            ${picksTable} (*),
            home_details:${teamTable}!home_team (*),
            away_details:${teamTable}!away_team (*)
        `)
        .gte("event_date", startISO);

    if (error) {
        console.error(`Supabase error fetching today's games:`, error);
        return [];
    }

    return data;
}

app.listen(port, () => {
    console.log(`Running on port ${port} access at http://localhost:${port}/`)
})