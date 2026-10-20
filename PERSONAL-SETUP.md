# Personal Meal Journal

This local version uses SQLite and accepts connections only from this computer (127.0.0.1).
It does not require registration, MySQL, Neon or Render. Anyone using your computer account can open it.

Use Node.js 24 or later. From this folder, run:

```sh
npm install
npm start
```

Open http://localhost:3000/meals. Keep the terminal running while using the website.

Meals, ratings, notes and favorites are saved automatically in `data/personal-meals.sqlite`.
Closing the browser or restarting the server does not erase them. This database is excluded from Git.
To back up your records, stop the server and copy the entire `data` folder to another safe location.
Keep that folder when moving the project to a different computer.

The public Render website is a separate, older shared version and does not sync with this database.
Do not deploy this local-only entry point to Render. The local journal cannot be opened from a phone or another computer.

Run `node --test personal.test.js` to check saving, restart persistence, editing, favorites, deletion and request protection.
