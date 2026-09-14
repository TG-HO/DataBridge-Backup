# DataBridge AI - Credentials & Test Data Reference

This document catalogs all verified test accounts, database credentials, organization invite codes, and pre-configured database connection targets in the DataBridge AI system.

---

## 1. Primary Internal Database Credentials

The core database houses system users, multi-tenant organizations, connection profiles, dashboards, and persistent query sessions.

| Property | Value | Notes |
| :--- | :--- | :--- |
| **Engine** | Microsoft SQL Server 2022 | Running in Docker (`databridge-sql`) |
| **Host** | `localhost` | `127.0.0.1` |
| **Port** | `1433` | Standard MSSQL port |
| **Database Name** | `databridge_ai` | Master project catalog |
| **System User** | `sa` | System Administrator |
| **Password** | `YourStrong@Password123` | Defined in `.env` and Docker container |
| **Connection String** | `sqlserver://localhost:1433;database=databridge_ai;user=sa;password=YourStrong@Password123;encrypt=true;trustServerCertificate=true` |

---

## 2. Test User Accounts

DataBridge AI uses **bcrypt** (cost factor 10) for password security and Auth.js for JWT session management.

### Account 1: Workspace Owner (`Test Org`)
* **Full Name:** Usman Khan
* **Email Address:** `usman.khan@tajgasoli`
* **Password:** `1234567890`
* **Organization:** Test Org
* **Organization Invite Code:** `TES-MFGZRW`
* **Role:** `OWNER`
* **Permissions:** Full administrative privileges, database connection creation, schema synchronization, dashboard authoring, member invite management.

### Account 2: Workspace Member (`Test Org`)
* **Full Name:** Test Acc
* **Email Address:** `test@test.com`
* **Password:** `12345678` *(or reset via Forgot Password)*
* **Organization:** Test Org
* **Organization Invite Code:** `TES-MFGZRW`
* **Role:** `MEMBER`
* **Permissions:** Natural language AI queries across authorized databases, viewing dashboards, query history.

### Account 3: Workspace Owner (`Taj Gasoline`)
* **Full Name:** Usman
* **Email Address:** `usman.khan@tajgasoline.com`
* **Password:** *(User managed)*
* **Organization:** Taj Gasoline
* **Organization Invite Code:** `TAJ-IMU4X9`
* **Role:** `OWNER`
* **Permissions:** Tenant-isolated workspace for Taj Gasoline operations.

---

## 3. Organizations & Multi-Tenant Invite Codes

Organizations are completely isolated tenants. To join an organization, a user must provide the corresponding **Invite Code** during registration.

| Organization Name | Organization ID | Invite Code | Member Count | Role Required to Invite |
| :--- | :--- | :--- | :--- | :--- |
| **Test Org** | `cmtlcb5qe0001bkacmo4r8fvl` | `TES-MFGZRW` | 2 | `OWNER` |
| **Taj Gasoline** | `cmu0wl5xs0001bktodmmr8345` | `TAJ-IMU4X9` | 1 | `OWNER` |

### How to Invite New Members
1. The Owner copies the **Invite Code** from the sidebar footer or the **Databases** settings page.
2. The prospective member visits `/register`.
3. Selects **Join with Invite Code**.
4. Enters their Name, Email, Password, and pastes the **Organization Invite Code**.
5. Upon submission, the member is automatically linked to that organization with `role: MEMBER`.

### How to Reset a Forgotten Password
If an analyst or owner forgets their credential:
1. Visit `http://localhost:3000/forgot-password` (or click *Forgot password?* on the login screen).
2. Enter the registered **Account Email** (e.g. `usman.khan@tajgasoli`).
3. Enter the **Organization Invite Code** (e.g. `TES-MFGZRW`).
4. Type and confirm the **New Password**.
5. Submit to instantly re-hash and update the credential in SQL Server.

---

## 4. Pre-Configured Database Connections (`Test Org`)

The following target databases are saved and encrypted with **AES-256-CBC** under **Test Org**:

### 1. Enterprise Microsoft SQL Server
* **Connection Name:** Test Connection
* **Database Type:** `mssql`
* **Host:** `103.79.17.77`
* **Port:** `1433`
* **Database Name:** `databridge_enterprise`
* **Default Schema:** `dbo`

### 2. Retail MySQL Database
* **Connection Name:** MySQL Test Conn
* **Database Type:** `mysql`
* **Host:** `103.79.17.77`
* **Port:** `3306`
* **Database Name:** `databridge_retail_test`

### 3. PostgreSQL Analytics Warehouse
* **Connection Name:** PostgreSQL Test Conn
* **Database Type:** `postgres`
* **Host:** `103.79.17.77`
* **Port:** `5432`
* **Database Name:** `databridge_postgres_test`

### 4. MongoDB Document Store
* **Connection Name:** MongoDB Test
* **Database Type:** `mongodb`
* **Host:** `mongodb+srv://...` (Atlas Cluster)
* **Port:** `27017`
* **Database Name:** `sample_mflix`

### 5. Google Firebase Firestore
* **Connection Name:** Firebase Test
* **Database Type:** `firebase`
* **Project ID / Host:** `blogfusion2`
* **Port:** `443`
* **Collection / Database:** `firestore`

### 6. Local Network SQL Server
* **Connection Name:** Local DB Test SQL Server
* **Database Type:** `mssql`
* **Host:** `192.168.0.212`
* **Port:** `1433`
* **Database Name:** `testdb`

---

## 5. Encryption & Security Secrets

| Environment Key | Description | Production Guidance |
| :--- | :--- | :--- |
| `ENCRYPTION_KEY` | 64 hex characters (32 bytes) for AES-256-CBC encryption of database passwords. | **Never change in production** without re-encrypting existing connection passwords in `DbConnection.encryptedPassword`. |
| `AUTH_SECRET` | Secret key used to sign and verify NextAuth JWT session tokens. | Set to a random 64-character string generated with `openssl rand -hex 32`. |
| `NEXTAUTH_URL` | Canonical URL of the application. | `http://localhost:3000` in dev, or your production domain (`https://app.yourdomain.com`). |
