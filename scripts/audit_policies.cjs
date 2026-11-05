const fs = require('fs');
const path = require('path');

const migrationsDir = path.resolve(__dirname, '../supabase/migrations');
const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

// Normalize policy names (strip quotes)
const cleanName = (s) => s.replace(/^["'`]|["'`]$/g, '').trim();

const policies = {}; // table -> Map(policyName, { file, command, to, using, withCheck })

for (const file of files) {
  const content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

  // Find all drops
  const dropRegex = /DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?(".*?"|'.*?'|`.*?`|[^\s;]+)\s+ON\s+(?:public\.)?([a-zA-Z0-9_]+)/gi;
  let dMatch;
  while ((dMatch = dropRegex.exec(content)) !== null) {
    const pName = cleanName(dMatch[1]);
    const tbl = dMatch[2].toLowerCase();
    if (policies[tbl] && policies[tbl].has(pName)) {
      policies[tbl].delete(pName);
    }
  }

  // Find all creates
  // Note: CREATE POLICY can have WITH CHECK and/or USING in different orders or just one.
  const createRegex = /CREATE\s+POLICY\s+(".*?"|'.*?'|`.*?`|[^\s]+)\s+ON\s+(?:public\.)?([a-zA-Z0-9_]+)([\s\S]*?);/gi;
  let cMatch;
  while ((cMatch = createRegex.exec(content)) !== null) {
    const pName = cleanName(cMatch[1]);
    const tbl = cMatch[2].toLowerCase();
    const rest = cMatch[3];

    let command = 'ALL';
    const forMatch = /FOR\s+(SELECT|INSERT|UPDATE|DELETE|ALL)/i.exec(rest);
    if (forMatch) command = forMatch[1].toUpperCase();

    let to = 'authenticated';
    const toMatch = /TO\s+([a-zA-Z0-9_,\s]+?)(?:USING|WITH CHECK|$)/i.exec(rest);
    if (toMatch) to = toMatch[1].trim();

    let using = '';
    const usingMatch = /USING\s*\(([\s\S]*?)\)(?:\s*WITH\s+CHECK|$)/i.exec(rest);
    if (usingMatch) using = usingMatch[1].trim();

    let withCheck = '';
    const checkMatch = /WITH\s+CHECK\s*\(([\s\S]*?)\)$/i.exec(rest);
    if (checkMatch) withCheck = checkMatch[1].trim();

    if (!policies[tbl]) policies[tbl] = new Map();
    policies[tbl].set(pName, {
      file,
      command,
      to,
      using: using.replace(/\s+/g, ' '),
      withCheck: withCheck ? withCheck.replace(/\s+/g, ' ') : undefined,
    });
  }
}

for (const [table, tablePolicies] of Object.entries(policies)) {
  console.log(`\n=== Table: ${table} (${tablePolicies.size} active policies) ===`);
  for (const [name, pol] of tablePolicies.entries()) {
    console.log(`  - [${pol.file}] "${name}" FOR ${pol.command} TO ${pol.to}`);
    if (pol.using) console.log(`      USING: ${pol.using}`);
    if (pol.withCheck) console.log(`      WITH CHECK: ${pol.withCheck}`);
  }
}
