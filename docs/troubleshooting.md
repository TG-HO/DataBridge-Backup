# DataBridge AI - Troubleshooting & FAQ Guide

This guide addresses common setup issues, network edge-cases, and diagnostic steps for DataBridge AI.

---

## 1. Database & Docker Issues

### Issue: `Can't reach database server at localhost:1433` or `ESOCKET / ECONNREFUSED`
* **Root Cause:** The Microsoft SQL Server Docker container is not running, or SQL Server is not listening on port 1433.
* **Diagnosis:** Run in PowerShell:
  ```powershell
  docker ps -a
  ```
* **Resolution:**
  1. Start the container:
     ```powershell
     docker start databridge-sql
     ```
  2. Verify it is running:
     ```powershell
     docker ps --filter "name=databridge-sql"
     ```
  3. Ensure it restarts automatically on Windows boot:
     ```powershell
     docker update --restart unless-stopped databridge-sql
     ```

---

### Issue: `EPERM: operation not permitted, rename query_engine-windows.dll.node`
* **Root Cause:** On Windows, running `npx prisma generate` while `npm run dev` is active causes a file lock error because Node.js has loaded the `.dll.node` query engine into memory.
* **Resolution:**
  1. Stop the running dev server in your terminal (`Ctrl + C`).
  2. If the port remains locked, kill the process:
     ```powershell
     # Find PID on port 3000
     netstat -ano | findstr :3000
     # Terminate process
     Stop-Process -Id <PID> -Force
     ```
  3. Clean temporary files and regenerate:
     ```powershell
     Remove-Item -Path "node_modules/.prisma/client/*.tmp*" -Force -ErrorAction SilentlyContinue
     npx prisma generate
     ```
  4. Restart the development server:
     ```powershell
     npm run dev
     ```

---

## 2. Authentication & Multi-Tenancy

### Issue: Forgot Password redirects back to `/login?callbackUrl=...`
* **Root Cause:** Next.js middleware was intercepting `/forgot-password` and redirecting unauthenticated users.
* **Resolution:** Verified fixed in [`middleware.ts`](file:///d:/DataBridge%20AI/middleware.ts#L27). Ensure `pathname === "/forgot-password"` is included in `isAuthPage`.

---

### Issue: `Invalid Organization Invite Code` during registration or password reset
* **Root Cause:** The user entered an invalid, mistyped, or lowercase code.
* **Resolution:**
  - Organization invite codes are uppercase alphanumeric strings (e.g. `TES-MFGZRW` or `TAJ-IMU4X9`).
  - Have the Organization Owner verify the code in the bottom footer of their sidebar or in the **Databases** settings page.

---

## 3. Target Database Connectivity

### Microsoft SQL Server Connection Fails
* **Symptom:** `ConnectionError: Failed to connect to <IP>:1433`
* **Checks:**
  1. Verify the SQL Server instance allows remote TCP/IP connections in SQL Server Configuration Manager.
  2. Check firewall rules on the target server allowing inbound traffic on port `1433`.
  3. Ensure SQL Server authentication (Mixed Mode) is enabled if connecting with SQL users.

---

### PostgreSQL SSL Errors
* **Symptom:** `self signed certificate` or `does not support SSL`
* **Checks:**
  - DataBridge AI's PostgreSQL client auto-falls back to non-SSL if SSL negotiation fails ([lib/pg-client.ts](file:///d:/DataBridge%20AI/lib/pg-client.ts)).
  - Verify that `pg_hba.conf` on the target server allows connections from your host IP address.

---

### MongoDB Atlas Connectivity
* **Symptom:** `MongoServerSelectionError: connection timed out`
* **Checks:**
  1. In MongoDB Atlas, go to **Network Access** and ensure `0.0.0.0/0` (or your static IP) is in the IP Access List.
  2. Ensure the connection string format begins with `mongodb+srv://` and includes URL-encoded credentials.

---

## 4. AI Provider & Inference

### Issue: AI Chat returns empty response or network timeout
* **Checks:**
  1. Check `.env` for the configured `AI_PROVIDER`:
     - **OpenRouter:** Verify your API key at [openrouter.ai/keys](https://openrouter.ai/keys) and ensure the selected model is active.
     - **Ollama:** Ensure the Ollama daemon is running (`ollama serve`) and the model is pulled (`ollama pull qwen2.5-coder:7b`).
     - **NVIDIA NIM:** Verify your key from `build.nvidia.com`.
  2. Test API responsiveness directly via curl or check console logs in the running Next.js terminal.
