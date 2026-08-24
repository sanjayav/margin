#!/usr/bin/env node
// Mint an AUTH_USERS entry for one customer.
//
//   node scripts/make-user.mjs "priya@maruti.co.in" "Priya Sharma" maruti
//
// Prints the JSON object to add to AUTH_USERS, and a generated password to hand
// over out of band. The password is never stored — only its scrypt hash — so if
// it is lost, mint a new entry rather than trying to recover it.
//
// One workspace per customer. Give a customer's whole team the same workspace
// and they share scenarios and imports; give them different ones and they
// don't. That single field is the tenant boundary the API enforces.
import { scryptSync, randomBytes } from 'node:crypto'

const [email, name, workspace, providedPassword] = process.argv.slice(2)

if (!email || !workspace) {
  console.error(`usage: node scripts/make-user.mjs <email> [name] <workspace> [password]

  node scripts/make-user.mjs priya@maruti.co.in "Priya Sharma" maruti
  node scripts/make-user.mjs ops@hyundai.com "Ops" hyundai 'a-password-you-chose'

Omit the password and a strong one is generated for you.`)
  process.exit(1)
}

const password = providedPassword || randomBytes(12).toString('base64url')
const salt = randomBytes(16)
const hash = scryptSync(password, salt, 64)
// Colon-separated: a `$` here is eaten by dotenv-expand when this lands in a
// .env file, which silently breaks every password in local dev. See api/_auth.ts.
const passwordHash = `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`

const entry = {
  email: email.trim().toLowerCase(),
  name: name || email,
  workspace,
  passwordHash,
}

console.log('\n── Add to AUTH_USERS ' + '─'.repeat(48))
console.log(JSON.stringify(entry, null, 2))
console.log('\n── Credentials to hand over ' + '─'.repeat(41))
console.log(`  email:    ${entry.email}`)
console.log(`  password: ${password}`)
if (!providedPassword) console.log('\n  (generated — this is the only time it is shown)')
console.log(`
── Deploying ${'─'.repeat(56)}
AUTH_USERS is a JSON ARRAY of these objects. To add this user to an existing
set, append the object rather than replacing the variable.

  SESSION_SECRET  must also be set (32+ random bytes). Rotating it signs
                  everyone out, which is how you revoke a session.

    openssl rand -base64 32
`)
