#!/usr/bin/env tsx
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import * as dotenv from 'dotenv';
import { DatabaseStorage } from '../storage.js';
import type { IStorage } from '../storage.js';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });

interface CsvRow {
  id: string;
  league_id: string;
  roster_id: string;
  'roster name': string;
  player_id: string;
  'player name': string;
  salaries: string;
  fifth_year_option: string;
  is_on_ir: string;
  franchise_tag_used: string;
  franchise_tag_year: string;
  original_contract_years: string;
  is_rookie_contract: string;
  extension_applied: string;
  extension_year: string;
  extension_salary: string;
  extension_type: string;
  has_been_extended: string;
  has_been_franchise_tagged: string;
  updated_at: string;
}

function parseSalaries(salariesJson: string): Record<string, number> {
  if (!salariesJson) return {};
  try {
    return JSON.parse(salariesJson);
  } catch (error) {
    console.error('[Parse Error] Invalid salaries JSON:', salariesJson);
    return {};
  }
}

function parseBoolean(value: string): number {
  // Database stores booleans as integers (0 or 1)
  return value === '1' || value === 'true' ? 1 : 0;
}

function parseNumber(value: string): number | null {
  if (!value || value.trim() === '') return null;
  const num = Number(value);
  return isNaN(num) ? null : num;
}

function parseString(value: string): string | null {
  if (!value || value.trim() === '') return null;
  return value;
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');

  const csvPath = args.find(arg => arg.endsWith('.csv')) || 'c:\\Users\\elwth\\OneDrive\\Desktop\\player_contracts_rows (1).csv';

  console.log('[Import Contracts] Starting...');
  console.log(`[Import Contracts] CSV Path: ${csvPath}`);
  console.log(`[Import Contracts] Dry Run: ${isDryRun}`);

  if (!fs.existsSync(csvPath)) {
    console.error(`[Import Contracts] CSV file not found at: ${csvPath}`);
    process.exit(1);
  }

  const storage: IStorage = new DatabaseStorage();

  // Step 1: Get active league
  const activeLeague = await storage.getActiveLeague();
  if (!activeLeague) {
    console.error('[Import Contracts] No active league found');
    process.exit(1);
  }
  console.log(`[Import Contracts] Active League: ${activeLeague.leagueId} (${activeLeague.leagueName})`);

  // Step 2: Read and parse CSV
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows: CsvRow[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });
  console.log(`[Import Contracts] Total rows in CSV: ${rows.length}`);

  // Step 3: Filter rows to active league
  // The CSV has league IDs in scientific notation which loses precision
  // So we compare the first 3-4 significant digits
  const activeLeagueIdNum = parseFloat(activeLeague.leagueId);
  const filteredRows = rows.filter(row => {
    const csvLeagueIdNum = parseFloat(row.league_id);
    // Compare with 1% tolerance to handle scientific notation rounding
    const ratio = Math.abs(csvLeagueIdNum - activeLeagueIdNum) / activeLeagueIdNum;
    return ratio < 0.01;
  });
  console.log(`[Import Contracts] Rows for active league: ${filteredRows.length}`);

  if (filteredRows.length === 0) {
    console.error(`[Import Contracts] No contracts found for active league ${activeLeagueIdStr}`);
    process.exit(1);
  }

  // Step 4: Prepare contract records
  const contractsToInsert = filteredRows.map(row => {
    const salaries = parseSalaries(row.salaries);
    const playerId = parseInt(row.player_id);
    const rosterId = parseInt(row.roster_id);

    return {
      id: row.id,
      leagueId: activeLeague.leagueId,
      rosterId: rosterId,
      playerId: playerId,
      salaries: salaries,
      fifthYearOption: parseString(row.fifth_year_option),
      isOnIr: parseBoolean(row.is_on_ir),
      franchiseTagUsed: parseBoolean(row.franchise_tag_used),
      franchiseTagYear: parseNumber(row.franchise_tag_year),
      originalContractYears: parseNumber(row.original_contract_years) || 1,
      isRookieContract: parseBoolean(row.is_rookie_contract),
      extensionApplied: parseBoolean(row.extension_applied),
      extensionYear: parseNumber(row.extension_year),
      extensionSalary: parseNumber(row.extension_salary),
      extensionType: parseNumber(row.extension_type),
      hasBeenExtended: parseBoolean(row.has_been_extended),
      hasBeenFranchiseTagged: parseBoolean(row.has_been_franchise_tagged)
    };
  });

  console.log(`[Import Contracts] Prepared ${contractsToInsert.length} contracts for import`);

  // Preview first 3 contracts
  console.log('\n[Import Contracts] Sample (first 3):');
  contractsToInsert.slice(0, 3).forEach((c, idx) => {
    console.log(`  ${idx + 1}. Player ${c.playerId}, Roster ${c.rosterId}, Salaries: ${JSON.stringify(c.salaries)}`);
  });

  if (isDryRun) {
    console.log('\n[Import Contracts] DRY RUN - No changes made');
    process.exit(0);
  }

  // Step 5: Clear existing contracts (clean slate)
  console.log('\n[Import Contracts] Clearing existing contracts...');
  const deletedCount = await storage.deleteAllPlayerContracts(activeLeague.leagueId);
  console.log(`[Import Contracts] Deleted ${deletedCount} existing contracts`);

  // Step 6: Insert all contracts
  console.log('[Import Contracts] Inserting contracts...');
  let insertedCount = 0;
  for (const contract of contractsToInsert) {
    try {
      await storage.upsertPlayerContract(contract);
      insertedCount++;
    } catch (error) {
      console.error(`[Import Contracts] Failed to insert contract for player ${contract.playerId}:`, error);
    }
  }

  console.log(`\n[Import Contracts] COMPLETE`);
  console.log(`  Deleted: ${deletedCount}`);
  console.log(`  Inserted: ${insertedCount}`);
}

main().catch(error => {
  console.error('[Import Contracts] Fatal error:', error);
  process.exit(1);
});
