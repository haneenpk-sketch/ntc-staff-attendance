# Railway deployment
Use the repository root and the main branch. Railway builds the root Dockerfile and runs the Node server on its assigned PORT.
1. Attach a persistent volume mounted at /data. Run one replica.
2. Set ADMIN_PASSWORD to a unique strong password of at least 16 characters in service Variables.
3. Generate a public domain in Settings → Networking and deploy the latest commit. For a custom domain, set APP_ORIGIN to its HTTPS origin with no trailing slash. Clear any dashboard build or start command that overrides the repository configuration.
4. Open the HTTPS domain and sign in as admin using ADMIN_PASSWORD.
5. Download the connector configuration from Network setup on the Railway site. Apply your office router settings and restart the office connector. Use only one connector per office installation.

Railway keeps its own SQLite attendance database and connector token on the volume. A new volume starts empty. Back up the volume before migrating or replacing it.
