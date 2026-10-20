# Meal Manager

A Node.js, Express and EJS meal journal with ratings, favorites, maps and clipboard sharing.

## Run locally

```sh
npm install
node app.js
```

Open http://localhost:3000.

Without database environment variables, this runs the local-only SQLite journal. See PERSONAL-SETUP.md for the local database location and backup instructions.

## Hosted version

Set DATABASE_URL to your PostgreSQL connection string, SESSION_SECRET to a securely generated random secret and NODE_ENV to production. Use npm ci to install and node app.js to start. These values belong in the host's environment settings, never in Git.

The hosted version provides registration, login and logout. Each account owns its meals and favorites. Passwords use salted scrypt hashes; sessions and meals are stored in PostgreSQL and survive application restarts. Session cookies last up to 30 days of inactivity. Local SQLite records are separate and are not automatically uploaded.

Run npm test to test account isolation, protected forms, CRUD and restart persistence. Maps and address search require an internet connection.
